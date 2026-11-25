// Pharmacy web app API: registration, profile & location, stock management,
// Excel/CSV/Access import, sync key for the stock-sync agent, orders, subscription.
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { db, tx, getSetting } from '../db.js';
import { signToken, hashPassword, checkPassword, requireAuth, rateLimit } from '../lib/auth.js';
import { validate, normalizePhone, PHONE_RE, EMAIL_RE, bad, notFound, forbidden, HttpError } from '../lib/http.js';
import { notify, fireRestockAlerts, lowStockCheck } from '../lib/notify.js';
import { readStockFile, detectMapping, normaliseRows, applyStock, upsertMedicine, COLUMN_ALIASES } from '../lib/stockImport.js';
import { loadOrder, loadOrders, serializeOrder, nextStatuses, ORDER_STATUS_TEXT } from './orders-common.js';
import { imageUpload, saveImage, copyImage, deleteImage } from '../lib/images.js';
import { suggestPhotos, importPhoto, enqueuePhotoLookup, creditText } from '../lib/photoLookup.js';
import { stockLabel } from './public.js';

const r = Router();
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const flag = async (key) => !!(await db.get('SELECT enabled FROM feature_flags WHERE key = ?', key))?.enabled;

export function pharmacyProfile(p) {
  return {
    id: p.id,
    name: p.name,
    ownerName: p.owner_name,
    email: p.email,
    phone: p.phone,
    whatsapp: p.whatsapp,
    licenseNumber: p.license_number,
    address: p.address,
    area: p.area,
    city: p.city,
    region: p.region,
    lat: p.lat,
    lng: p.lng,
    bio: p.bio,
    openingHours: p.opening_hours,
    offersDelivery: !!p.offers_delivery,
    deliveryFee: p.delivery_fee,
    deliveryRadiusKm: p.delivery_radius_km,
    approvalStatus: p.approval_status,
    rejectionReason: p.rejection_reason,
    subscriptionStatus: p.subscription_status,
    subscriptionExpiresAt: p.subscription_expires_at,
    lastSyncAt: p.last_sync_at,
    createdAt: p.created_at,
    approvedAt: p.approved_at,
    logoImageId: p.logo_image_id ?? null,
  };
}

const profileRules = {
  name: { max: 120 },
  ownerName: { max: 120 },
  phone: { pattern: PHONE_RE, message: 'must be a valid phone number' },
  whatsapp: { pattern: PHONE_RE, message: 'must be a valid phone number' },
  licenseNumber: { max: 60 },
  address: { max: 300 },
  area: { max: 100 },
  city: { max: 100 },
  region: { max: 100 },
  lat: { type: 'number', min: -90, max: 90 },
  lng: { type: 'number', min: -180, max: 180 },
  bio: { max: 1500 },
  openingHours: { max: 300 },
  offersDelivery: { type: 'boolean' },
  deliveryFee: { type: 'number', min: 0, max: 1000 },
  deliveryRadiusKm: { type: 'number', min: 0, max: 200 },
};
const columnMap = {
  name: 'name', ownerName: 'owner_name', phone: 'phone', whatsapp: 'whatsapp', licenseNumber: 'license_number',
  address: 'address', area: 'area', city: 'city', region: 'region', lat: 'lat', lng: 'lng', bio: 'bio',
  openingHours: 'opening_hours', offersDelivery: 'offers_delivery', deliveryFee: 'delivery_fee', deliveryRadiusKm: 'delivery_radius_km',
};

// ---------- Auth ----------
r.post('/auth/register', rateLimit({ max: 10 }), async (req, res) => {
  const body = { ...req.body, phone: normalizePhone(req.body?.phone), whatsapp: normalizePhone(req.body?.whatsapp) || undefined };
  const v = validate(body, {
    ...profileRules,
    name: { required: true, max: 120 },
    ownerName: { required: true, max: 120 },
    email: { required: true, pattern: EMAIL_RE, message: 'must be a valid email' },
    phone: { required: true, pattern: PHONE_RE, message: 'must be a valid phone number' },
    password: { required: true, min: 8, max: 100 },
    licenseNumber: { required: true, max: 60 },
    address: { required: true, max: 300 },
  });
  const email = v.email.toLowerCase();
  if ((await db.get('SELECT id FROM pharmacies WHERE email = ?', email))) throw new HttpError(409, 'A pharmacy with this email already exists. Please log in.');
  const trialDays = Number(await getSetting('trial_days') || 30);
  const fields = Object.keys(columnMap).filter((k) => v[k] !== undefined);
  const id = Number((await db.get(`INSERT INTO pharmacies (email, password_hash, subscription_expires_at, sync_key, ${fields.map((k) => columnMap[k]).join(', ')})
      VALUES (?, ?, now() + ?::interval, ?, ${fields.map(() => '?').join(', ')}) RETURNING id`, email, await hashPassword(v.password), `${trialDays} days`, `mfsync_${crypto.randomBytes(24).toString('hex')}`,
      ...fields.map((k) => (typeof v[k] === 'boolean' ? (v[k] ? 1 : 0) : v[k])))).id);
  // Let every admin know there is a new request to review.
  for (const a of (await db.all('SELECT id FROM admins'))) {
    await notify('admin', a.id, 'pharmacy_request', 'New pharmacy request', `${v.name} (${v.area || v.city || 'Ghana'}) is waiting for approval.`, { pharmacyId: id });
  }
  const p = (await db.get('SELECT * FROM pharmacies WHERE id = ?', id));
  res.status(201).json({ token: signToken('pharmacy', id), pharmacy: pharmacyProfile(p) });
});

r.post('/auth/login', rateLimit({ max: 10 }), async (req, res) => {
  const v = validate(req.body, { email: { required: true }, password: { required: true } });
  const p = (await db.get('SELECT * FROM pharmacies WHERE email = ?', v.email.toLowerCase()));
  if (!p || !(await checkPassword(v.password, p.password_hash))) throw new HttpError(401, 'Wrong email or password');
  res.json({ token: signToken('pharmacy', p.id), pharmacy: pharmacyProfile(p) });
});

// ---------- Signed-in pharmacy ----------
r.use(requireAuth('pharmacy'));

const me = async (req) => {
  const p = (await db.get('SELECT * FROM pharmacies WHERE id = ?', req.user.id));
  // Expire subscriptions lazily.
  if (p.subscription_expires_at && p.subscription_status !== 'expired' && new Date(p.subscription_expires_at) < new Date()) {
    (await db.run(`UPDATE pharmacies SET subscription_status = 'expired' WHERE id = ?`, p.id));
    p.subscription_status = 'expired';
  }
  return p;
};
const requireApproved = async (req) => {
  const p = await me(req);
  if (p.approval_status !== 'approved') throw forbidden('Your pharmacy must be approved by MedFinder before you can manage orders.');
  return p;
};

r.get('/me', async (req, res) => res.json({ pharmacy: pharmacyProfile(await me(req)) }));

r.patch('/me', async (req, res) => {
  const body = { ...req.body };
  if (body.phone) body.phone = normalizePhone(body.phone);
  if (body.whatsapp) body.whatsapp = normalizePhone(body.whatsapp);
  const v = validate(body, profileRules);
  const current = await me(req);
  // Changing the name or licence of an approved pharmacy sends it back for review.
  const sensitive = current.approval_status === 'approved' &&
    ((v.name && v.name !== current.name) || (v.licenseNumber && v.licenseNumber !== current.license_number));
  const fields = Object.keys(columnMap).filter((k) => v[k] !== undefined);
  if (fields.length) {
    (await db.run(`UPDATE pharmacies SET ${fields.map((k) => `${columnMap[k]} = ?`).join(', ')} WHERE id = ?`, ...fields.map((k) => (typeof v[k] === 'boolean' ? (v[k] ? 1 : 0) : v[k])), req.user.id));
  }
  if (sensitive) {
    (await db.run(`UPDATE pharmacies SET approval_status = 'pending' WHERE id = ?`, req.user.id));
    for (const a of (await db.all('SELECT id FROM admins'))) {
      await notify('admin', a.id, 'pharmacy_request', 'Pharmacy details changed', `${v.name || current.name} changed its name or licence and needs re-approval.`, { pharmacyId: current.id });
    }
  }
  res.json({ pharmacy: pharmacyProfile(await me(req)), reReview: !!sensitive });
});

// ---------- Profile picture (logo / shopfront) ----------
r.post('/me/logo', imageUpload.single('image'), async (req, res) => {
  const p = await me(req);
  const id = await saveImage(req.file, 'pharmacy_logo', p.id, { preset: 'square', oldId: p.logo_image_id });
  (await db.run('UPDATE pharmacies SET logo_image_id = ? WHERE id = ?', id, p.id));
  res.json({ pharmacy: pharmacyProfile(await me(req)) });
});
r.delete('/me/logo', async (req, res) => {
  const p = await me(req);
  await deleteImage(p.logo_image_id);
  (await db.run('UPDATE pharmacies SET logo_image_id = NULL WHERE id = ?', p.id));
  res.json({ pharmacy: pharmacyProfile(await me(req)) });
});

r.post('/me/password', async (req, res) => {
  const v = validate(req.body, { currentPassword: { required: true }, newPassword: { required: true, min: 8, max: 100 } });
  const p = await me(req);
  if (!(await checkPassword(v.currentPassword, p.password_hash))) throw bad('Current password is incorrect');
  (await db.run('UPDATE pharmacies SET password_hash = ? WHERE id = ?', await hashPassword(v.newPassword), p.id));
  res.json({ ok: true });
});

r.get('/dashboard', async (req, res) => {
  const p = await me(req);
  const id = p.id;
  const one = async (sql, ...a) => (await db.get(sql, id, ...a));
  const todayOrders = (await one(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue FROM orders WHERE pharmacy_id = ? AND created_at::date = current_date AND status NOT IN ('cancelled','rejected')`));
  const pending = (await one(`SELECT COUNT(*) AS n FROM orders WHERE pharmacy_id = ? AND status = 'pending'`)).n;
  const active = (await one(`SELECT COUNT(*) AS n FROM orders WHERE pharmacy_id = ? AND status IN ('accepted','preparing','ready','out_for_delivery')`)).n;
  const monthRevenue = (await one(`SELECT COALESCE(SUM(total),0) AS v FROM orders WHERE pharmacy_id = ? AND status = 'completed' AND created_at >= date_trunc('month', now())`)).v;
  const stockItems = (await one(`SELECT COUNT(*) AS n FROM inventory WHERE pharmacy_id = ?`)).n;
  const lowStock = (await db.all(`SELECT i.id, m.name, m.strength, i.quantity, i.low_stock_threshold AS threshold FROM inventory i JOIN medicines m ON m.id = i.medicine_id WHERE i.pharmacy_id = ? AND i.quantity <= i.low_stock_threshold ORDER BY i.quantity LIMIT 8`, id));
  const recent = (await loadOrders((await db.all('SELECT id FROM orders WHERE pharmacy_id = ? ORDER BY id DESC LIMIT 6', id)).map((o) => o.id))).map((o) => serializeOrder(o, { forPharmacy: true }));
  const week = (await db.all(`SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE pharmacy_id = ? AND created_at >= current_date - 6 AND status NOT IN ('cancelled','rejected') GROUP BY day ORDER BY day`, id));
  const waiting = (await db.all(`SELECT m.name, m.strength, COUNT(*) AS patients FROM restock_alerts ra JOIN medicines m ON m.id = ra.medicine_id
                              WHERE ra.notified_at IS NULL GROUP BY m.id ORDER BY patients DESC LIMIT 5`));
  res.json({
    stats: { ordersToday: todayOrders.n, revenueToday: todayOrders.revenue, pendingOrders: pending, activeOrders: active, monthRevenue, stockItems, lowStockCount: lowStock.length },
    lowStock, recentOrders: recent, week, demandedMedicines: waiting,
  });
});

// ---------- Inventory ----------
function invRow(i) {
  return {
    id: i.id, medicineId: i.medicine_id, name: i.name, strength: i.strength, form: i.form, category: i.category,
    requiresPrescription: !!i.requires_prescription, price: i.price, quantity: i.quantity, lowStockThreshold: i.low_stock_threshold,
    sku: i.sku, stock: stockLabel(i.quantity, i.low_stock_threshold), updatedAt: i.updated_at,
    imageId: i.image_id ?? null, catalogueImageId: i.medicine_image_id ?? null,
    catalogueImageCredit: creditText(i.credit_author, i.credit_license),
  };
}
const INV_SELECT = `SELECT i.*, m.name, m.strength, m.form, m.category, m.requires_prescription, m.image_id AS medicine_image_id, ci.author AS credit_author, ci.license AS credit_license
  FROM inventory i JOIN medicines m ON m.id = i.medicine_id LEFT JOIN images ci ON ci.id = m.image_id AND ci.auto = 1`;

r.get('/inventory', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = req.query.filter; // low | out
  let sql = `${INV_SELECT} WHERE i.pharmacy_id = ?`;
  const args = [req.user.id];
  if (q) { sql += ' AND (m.name ILIKE ? OR m.category ILIKE ? OR i.sku ILIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (filter === 'low') sql += ' AND i.quantity > 0 AND i.quantity <= i.low_stock_threshold';
  if (filter === 'out') sql += ' AND i.quantity = 0';
  sql += ' ORDER BY m.name';
  res.json({ items: (await db.all(sql, ...args)).map(invRow) });
});

const invRules = {
  name: { required: true, max: 120 },
  strength: { max: 60, default: '' },
  form: { max: 60 },
  category: { max: 60 },
  requiresPrescription: { type: 'boolean' },
  price: { required: true, type: 'number', min: 0, max: 100000 },
  quantity: { required: true, type: 'number', min: 0, max: 1000000, int: true },
  lowStockThreshold: { type: 'number', min: 0, max: 100000, int: true, default: 10 },
  sku: { max: 60 },
};

r.post('/inventory', async (req, res) => {
  const v = validate(req.body, invRules);
  const result = await tx(async () => {
    const mid = await upsertMedicine({ name: v.name, strength: v.strength, form: v.form, category: v.category, requires_prescription: v.requiresPrescription });
    if ((await db.get('SELECT id FROM inventory WHERE pharmacy_id = ? AND medicine_id = ?', req.user.id, mid))) {
      throw new HttpError(409, `${v.name} ${v.strength} is already in your stock list. Edit it instead.`);
    }
    const id = Number((await db.get('INSERT INTO inventory (pharmacy_id, medicine_id, price, quantity, low_stock_threshold, sku) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', req.user.id, mid, v.price, v.quantity, v.lowStockThreshold, v.sku ?? null)).id);
    return { id, mid };
  });
  (await db.run(`INSERT INTO import_logs (pharmacy_id, source, rows_total, created_count) VALUES (?, 'manual', 1, 1)`, req.user.id));
  await fireRestockAlerts([result.mid]);
  await enqueuePhotoLookup([result.mid]);
  res.status(201).json({ item: invRow((await db.get(`${INV_SELECT} WHERE i.id = ?`, result.id))) });
});

r.patch('/inventory/:id', async (req, res) => {
  const item = (await db.get('SELECT * FROM inventory WHERE id = ? AND pharmacy_id = ?', Number(req.params.id), req.user.id));
  if (!item) throw notFound('Item not found');
  const v = validate(req.body, {
    price: { type: 'number', min: 0, max: 100000 },
    quantity: { type: 'number', min: 0, max: 1000000, int: true },
    lowStockThreshold: { type: 'number', min: 0, max: 100000, int: true },
    sku: { max: 60 },
  });
  (await db.run(`UPDATE inventory SET price = COALESCE(?, price), quantity = COALESCE(?, quantity), low_stock_threshold = COALESCE(?, low_stock_threshold), sku = COALESCE(?, sku), updated_at = now() WHERE id = ?`, v.price ?? null, v.quantity ?? null, v.lowStockThreshold ?? null, v.sku ?? null, item.id));
  (await db.run(`UPDATE pharmacies SET last_sync_at = now() WHERE id = ?`, req.user.id));
  if (v.quantity > 0 && item.quantity === 0) await fireRestockAlerts([item.medicine_id]);
  if (v.quantity !== undefined) await lowStockCheck(req.user.id, [item.medicine_id]);
  res.json({ item: invRow((await db.get(`${INV_SELECT} WHERE i.id = ?`, item.id))) });
});

r.delete('/inventory/:id', async (req, res) => {
  const item = (await db.get('SELECT * FROM inventory WHERE id = ? AND pharmacy_id = ?', Number(req.params.id), req.user.id));
  if (!item) throw notFound('Item not found');
  (await db.run('DELETE FROM inventory WHERE id = ?', item.id));
  await deleteImage(item.image_id);
  res.json({ ok: true });
});

/** Photo of how this medicine looks at this pharmacy (the pack they sell). */
r.post('/inventory/:id/image', imageUpload.single('image'), async (req, res) => {
  const item = (await db.get('SELECT * FROM inventory WHERE id = ? AND pharmacy_id = ?', Number(req.params.id), req.user.id));
  if (!item) throw notFound('Item not found');
  const id = await saveImage(req.file, 'inventory', item.id, { preset: 'product', oldId: item.image_id });
  (await db.run(`UPDATE inventory SET image_id = ?, updated_at = now() WHERE id = ?`, id, item.id));
  // First photo of a medicine also becomes its default picture across MedFinder.
  const med = (await db.get('SELECT image_id FROM medicines WHERE id = ?', item.medicine_id));
  if (!med.image_id) (await db.run('UPDATE medicines SET image_id = ? WHERE id = ?', await copyImage(id, 'medicine', item.medicine_id), item.medicine_id));
  res.json({ item: invRow((await db.get(`${INV_SELECT} WHERE i.id = ?`, item.id))) });
});
/** Free photos from Wikimedia Commons that match this stock item's medicine. */
r.get('/inventory/:id/photo-suggestions', async (req, res) => {
  const item = (await db.get(`${INV_SELECT} WHERE i.id = ? AND i.pharmacy_id = ?`, Number(req.params.id), req.user.id));
  if (!item) throw notFound('Item not found');
  try {
    res.json({ suggestions: await suggestPhotos(item) });
  } catch (e) {
    throw new HttpError(503, e.message || 'Could not search for photos right now');
  }
});

/** Use one of the suggested photos for this stock item (and as the catalogue default if none). */
r.post('/inventory/:id/photo-from-suggestion', async (req, res) => {
  const item = (await db.get('SELECT * FROM inventory WHERE id = ? AND pharmacy_id = ?', Number(req.params.id), req.user.id));
  if (!item) throw notFound('Item not found');
  const id = await importPhoto(req.body || {}, 'inventory', item.id, item.image_id);
  (await db.run(`UPDATE inventory SET image_id = ?, updated_at = now() WHERE id = ?`, id, item.id));
  const med = (await db.get('SELECT image_id FROM medicines WHERE id = ?', item.medicine_id));
  if (!med.image_id) {
    const copy = await copyImage(id, 'medicine', item.medicine_id);
    (await db.run('UPDATE images SET source_url = (SELECT source_url FROM images WHERE id = ?), author = (SELECT author FROM images WHERE id = ?), license = (SELECT license FROM images WHERE id = ?), auto = 1 WHERE id = ?', id, id, id, copy));
    (await db.run('UPDATE medicines SET image_id = ? WHERE id = ?', copy, item.medicine_id));
  }
  res.json({ item: invRow((await db.get(`${INV_SELECT} WHERE i.id = ?`, item.id))) });
});

r.delete('/inventory/:id/image', async (req, res) => {
  const item = (await db.get('SELECT * FROM inventory WHERE id = ? AND pharmacy_id = ?', Number(req.params.id), req.user.id));
  if (!item) throw notFound('Item not found');
  await deleteImage(item.image_id);
  (await db.run('UPDATE inventory SET image_id = NULL WHERE id = ?', item.id));
  res.json({ item: invRow((await db.get(`${INV_SELECT} WHERE i.id = ?`, item.id))) });
});

/** CSV template pharmacies can fill in. */
r.get('/inventory/template', async (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="medfinder-stock-template.csv"');
  res.send('Medicine,Strength,Form,Category,Price,Quantity,Reorder Level,Prescription\nParacetamol,500mg,Tablets,Pain relief,9.50,120,20,No\nAmoxicillin,500mg,Capsules,Antibiotic,24.00,40,10,Yes\n');
});

/**
 * Import stock from Excel / CSV / Access.
 * form-data: file, mode=merge|replace, dryRun=true|false, mapping={"name":"Drug",...}, table=<access table>
 */
r.post('/inventory/import', upload.single('file'), async (req, res) => {
  if (!await flag('stock_import')) throw bad('Stock import is switched off right now');
  if (!req.file) throw bad('Choose a file to upload');
  const parsed = await readStockFile(req.file.buffer, req.file.originalname, { table: req.body.table });
  let mapping = detectMapping(parsed.headers);
  if (req.body.mapping) {
    try { mapping = { ...mapping, ...JSON.parse(req.body.mapping) }; } catch { throw bad('Invalid column mapping'); }
    for (const k of Object.keys(mapping)) if (!mapping[k]) delete mapping[k];
  }
  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;
  const preview = { format: parsed.format, headers: parsed.headers, mapping, fields: Object.keys(COLUMN_ALIASES), table: parsed.table, tables: parsed.tables, sheet: parsed.sheet, totalRows: parsed.rows.length };
  let normalised;
  try {
    normalised = normaliseRows(parsed.rows, mapping);
  } catch (e) {
    if (dryRun) return res.json({ ...preview, items: [], errors: [e.message], ready: false });
    throw e;
  }
  if (dryRun) return res.json({ ...preview, items: normalised.items.slice(0, 50), validRows: normalised.items.length, errors: normalised.errors.slice(0, 50), ready: normalised.items.length > 0 });
  if (!normalised.items.length) throw bad('No valid rows found in the file', normalised.errors);
  const mode = req.body.mode === 'replace' ? 'replace' : 'merge';
  const result = await applyStock(req.user.id, normalised.items, { mode, source: `upload:${parsed.format}`, filename: req.file.originalname, errors: normalised.errors });
  res.json({ ...result, mapping });
});

r.get('/inventory/import-logs', async (req, res) => {
  res.json({ logs: (await db.all(`SELECT id, source, filename, rows_total AS "rowsTotal", created_count AS created, updated_count AS updated, zeroed_count AS zeroed, errors, created_at AS "createdAt" FROM import_logs WHERE pharmacy_id = ? ORDER BY id DESC LIMIT 30`, req.user.id))
    .map((l) => ({ ...l, errors: l.errors ? JSON.parse(l.errors) : [] })) });
});

// ---------- Sync key for the desktop stock-sync agent ----------
r.get('/sync-key', async (req, res) => {
  const p = await me(req);
  res.json({ syncKey: p.sync_key, lastSyncAt: p.last_sync_at, enabled: await flag('sync_agent') });
});
r.post('/sync-key/rotate', async (req, res) => {
  const key = `mfsync_${crypto.randomBytes(24).toString('hex')}`;
  (await db.run('UPDATE pharmacies SET sync_key = ? WHERE id = ?', key, req.user.id));
  res.json({ syncKey: key });
});

// ---------- Orders ----------
r.get('/orders', async (req, res) => {
  const status = String(req.query.status || '');
  let sql = 'SELECT id FROM orders WHERE pharmacy_id = ?';
  const args = [req.user.id];
  if (status === 'active') sql += ` AND status IN ('pending','accepted','preparing','ready','out_for_delivery')`;
  else if (status === 'history') sql += ` AND status IN ('completed','cancelled','rejected')`;
  else if (ORDER_STATUS_TEXT[status]) { sql += ' AND status = ?'; args.push(status); }
  sql += ' ORDER BY id DESC LIMIT 200';
  const counts = Object.fromEntries((await db.all('SELECT status, COUNT(*) AS n FROM orders WHERE pharmacy_id = ? GROUP BY status', req.user.id)).map((c) => [c.status, c.n]));
  res.json({ counts, orders: (await loadOrders((await db.all(sql, ...args)).map((o) => o.id))).map((o) => serializeOrder(o, { forPharmacy: true })) });
});

r.get('/orders/:id', async (req, res) => {
  const o = await loadOrder(Number(req.params.id));
  if (!o || o.pharmacy_id !== req.user.id) throw notFound('Order not found');
  const history = (await db.get(`SELECT COUNT(*) AS n FROM orders WHERE patient_id = ? AND pharmacy_id = ? AND status = 'completed'`, o.patient_id, o.pharmacy_id)).n;
  res.json({ order: { ...serializeOrder(o, { forPharmacy: true }), patientCompletedOrders: history } });
});

const PATIENT_MESSAGES = {
  accepted: (o) => [`Order ${o.code} accepted`, `${o.pharmacy_name} accepted your order and will start preparing it.`],
  rejected: (o, note) => [`Order ${o.code} declined`, `${o.pharmacy_name} could not fill your order${note ? `: ${note}` : '.'} Try another pharmacy.`],
  preparing: (o) => [`Preparing order ${o.code}`, `${o.pharmacy_name} is preparing your medicines.`],
  ready: (o) => [`Order ${o.code} is ready`, `Your order is ready for pickup at ${o.pharmacy_name}, ${o.pharmacy_address}.`],
  out_for_delivery: (o) => [`Order ${o.code} is on the way`, `${o.pharmacy_name} has sent out your delivery.`],
  completed: (o) => [`Order ${o.code} completed`, `Thanks for using MedFinder. Get well soon!`],
  cancelled: (o, note) => [`Order ${o.code} cancelled`, `${o.pharmacy_name} cancelled your order${note ? `: ${note}` : '.'}`],
};

r.post('/orders/:id/status', async (req, res) => {
  await requireApproved(req);
  const o = await loadOrder(Number(req.params.id));
  if (!o || o.pharmacy_id !== req.user.id) throw notFound('Order not found');
  const v = validate(req.body, { status: { required: true }, note: { max: 500 } });
  if (!nextStatuses(o).includes(v.status)) throw bad(`Cannot change from "${ORDER_STATUS_TEXT[o.status]}" to "${ORDER_STATUS_TEXT[v.status] || v.status}"`);
  await tx(async () => {
    if (v.status === 'accepted') {
      // Reserve stock now so it isn't sold twice.
      for (const it of o.items) {
        const inv = (await db.get('SELECT quantity FROM inventory WHERE pharmacy_id = ? AND medicine_id = ?', o.pharmacy_id, it.medicine_id));
        if (!inv || inv.quantity < it.quantity) throw bad(`Not enough ${it.name} in stock (${inv?.quantity ?? 0} left). Update your stock or decline the order.`);
        (await db.run(`UPDATE inventory SET quantity = quantity - ?, updated_at = now() WHERE pharmacy_id = ? AND medicine_id = ?`, it.quantity, o.pharmacy_id, it.medicine_id));
      }
    }
    if (v.status === 'cancelled' && ['accepted', 'preparing'].includes(o.status)) {
      for (const it of o.items) (await db.run('UPDATE inventory SET quantity = quantity + ? WHERE pharmacy_id = ? AND medicine_id = ?', it.quantity, o.pharmacy_id, it.medicine_id));
    }
    const paid = v.status === 'completed' ? `, payment_status = 'paid'` : '';
    (await db.run(`UPDATE orders SET status = ?, pharmacy_note = COALESCE(?, pharmacy_note), updated_at = now()${paid} WHERE id = ?`, v.status, v.note ?? null, o.id));
    (await db.run('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)', o.id, v.status, v.note ?? null));
  });
  if (v.status === 'accepted') await lowStockCheck(o.pharmacy_id, o.items.map((i) => i.medicine_id));
  const [title, body] = PATIENT_MESSAGES[v.status](o, v.note);
  await notify('patient', o.patient_id, 'order', title, body, { orderId: o.id, status: v.status });
  res.json({ order: serializeOrder(await loadOrder(o.id), { forPharmacy: true }) });
});

// ---------- Notifications ----------
r.get('/notifications', async (req, res) => {
  const list = (await db.all(`SELECT id, type, title, body, data, read, created_at AS "createdAt" FROM notifications WHERE recipient_type = 'pharmacy' AND recipient_id = ? ORDER BY id DESC LIMIT 50`, req.user.id));
  res.json({ unread: list.filter((n) => !n.read).length, notifications: list.map((n) => ({ ...n, read: !!n.read, data: n.data ? JSON.parse(n.data) : null })) });
});
r.post('/notifications/read', async (req, res) => {
  (await db.run(`UPDATE notifications SET read = 1 WHERE recipient_type = 'pharmacy' AND recipient_id = ?`, req.user.id));
  res.json({ ok: true });
});

// ---------- Subscription ----------
r.get('/subscription', async (req, res) => {
  const p = await me(req);
  res.json({
    status: p.subscription_status,
    expiresAt: p.subscription_expires_at,
    priceGhs: Number(await getSetting('subscription_price_ghs')),
    payments: (await db.all('SELECT id, amount, months, method, reference, period_start AS "periodStart", period_end AS "periodEnd", created_at AS "createdAt" FROM subscription_payments WHERE pharmacy_id = ? ORDER BY id DESC', p.id)),
  });
});

/**
 * Record a subscription payment. In production, call this from your payment
 * provider's webhook (e.g. Paystack / Hubtel MoMo) after verifying the charge.
 */
r.post('/subscription/pay', async (req, res) => {
  const v = validate(req.body, {
    months: { type: 'number', min: 1, max: 12, int: true, default: 1 },
    method: { required: true, enum: ['momo', 'card', 'bank'] },
    reference: { max: 100 },
  });
  const p = await me(req);
  const price = Number(await getSetting('subscription_price_ghs'));
  const start = p.subscription_expires_at && new Date(p.subscription_expires_at) > new Date() ? p.subscription_expires_at : null;
  await tx(async () => {
    const base = start ? new Date(start).toISOString() : new Date().toISOString();
    const end = (await db.get('SELECT (?::timestamptz + ?::interval) AS e, ?::timestamptz AS s', base, `${v.months} months`, base));
    (await db.run('INSERT INTO subscription_payments (pharmacy_id, amount, months, method, reference, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?, ?)', p.id, price * v.months, v.months, v.method, v.reference || `MF-SUB-${Date.now()}`, end.s, end.e));
    (await db.run(`UPDATE pharmacies SET subscription_status = 'active', subscription_expires_at = ? WHERE id = ?`, end.e, p.id));
  });
  await notify('pharmacy', p.id, 'subscription', 'Subscription renewed', `Thank you! Your MedFinder subscription is active for ${v.months} more month(s).`);
  res.json({ pharmacy: pharmacyProfile(await me(req)) });
});

export default r;
