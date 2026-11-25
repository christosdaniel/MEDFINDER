// Admin console API: verify pharmacies, oversee patients & orders, handle
// complaints, switch features on/off for both apps, announcements, settings.
import { Router } from 'express';
import { db } from '../db.js';
import { signToken, hashPassword, checkPassword, requireAuth, rateLimit } from '../lib/auth.js';
import { validate, EMAIL_RE, bad, notFound, HttpError } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { pharmacyProfile } from './pharmacy.js';
import { patientProfile } from './patient.js';
import { loadOrder, loadOrders, serializeOrder } from './orders-common.js';
import { imageUpload, saveImage } from '../lib/images.js';
import { suggestPhotos, importPhoto, enqueuePhotoLookup, lookupStatus, creditText } from '../lib/photoLookup.js';

const r = Router();

async function audit(req, action, target, details) {
  (await db.run('INSERT INTO audit_log (admin_id, action, target, details) VALUES (?, ?, ?, ?)', req.user.id, action, target ?? null, details ? JSON.stringify(details) : null));
}

r.post('/auth/login', rateLimit({ max: 10 }), async (req, res) => {
  const v = validate(req.body, { email: { required: true }, password: { required: true } });
  const a = (await db.get('SELECT * FROM admins WHERE email = ?', v.email.toLowerCase()));
  if (!a || !(await checkPassword(v.password, a.password_hash))) throw new HttpError(401, 'Wrong email or password');
  res.json({ token: signToken('admin', a.id), admin: { id: a.id, name: a.name, email: a.email } });
});

r.use(requireAuth('admin'));

r.get('/me', async (req, res) => {
  const a = (await db.get('SELECT id, name, email FROM admins WHERE id = ?', req.user.id));
  res.json({ admin: a });
});

r.get('/stats', async (_req, res) => {
  const n = async (sql) => (await db.get(sql)).n;
  res.json({
    patients: await n('SELECT COUNT(*) AS n FROM patients WHERE phone_verified = 1'),
    pharmacies: await n(`SELECT COUNT(*) AS n FROM pharmacies WHERE approval_status = 'approved'`),
    pendingPharmacies: await n(`SELECT COUNT(*) AS n FROM pharmacies WHERE approval_status = 'pending'`),
    ordersToday: await n(`SELECT COUNT(*) AS n FROM orders WHERE created_at::date = current_date`),
    ordersTotal: await n('SELECT COUNT(*) AS n FROM orders'),
    gmv: (await db.get(`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status = 'completed'`)).n,
    openComplaints: await n(`SELECT COUNT(*) AS n FROM complaints WHERE status != 'resolved'`),
    medicines: await n('SELECT COUNT(*) AS n FROM medicines'),
    subscriptionRevenue: (await db.get('SELECT COALESCE(SUM(amount),0) AS n FROM subscription_payments')).n,
    staleListings: await n(`SELECT COUNT(*) AS n FROM pharmacies WHERE approval_status = 'approved' AND (last_sync_at IS NULL OR last_sync_at < now() - interval '7 days')`),
    ordersByDay: (await db.all(`SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS orders FROM orders WHERE created_at >= current_date - 13 GROUP BY day ORDER BY day`)),
    topSearches: (await db.all(`SELECT min(query) AS query, COUNT(*) AS n FROM recent_searches GROUP BY lower(query) ORDER BY n DESC LIMIT 8`)),
    unmetDemand: (await db.all(`SELECT m.name, m.strength, COUNT(*) AS patients FROM restock_alerts ra JOIN medicines m ON m.id = ra.medicine_id WHERE ra.notified_at IS NULL GROUP BY m.id ORDER BY patients DESC LIMIT 8`)),
  });
});

// ---------- Pharmacies ----------
r.get('/pharmacies', async (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  let sql = `SELECT p.*, (SELECT COUNT(*) FROM inventory i WHERE i.pharmacy_id = p.id) AS stock_items,
             (SELECT COUNT(*) FROM orders o WHERE o.pharmacy_id = p.id) AS orders_count,
             (SELECT COUNT(*) FROM complaints c WHERE c.pharmacy_id = p.id AND c.status != 'resolved') AS open_complaints
             FROM pharmacies p WHERE 1=1`;
  const args = [];
  if (status) { sql += ' AND p.approval_status = ?'; args.push(status); }
  if (q) { sql += ' AND (p.name ILIKE ? OR p.email ILIKE ? OR p.area ILIKE ? OR p.license_number ILIKE ?)'; args.push(...Array(4).fill(`%${q}%`)); }
  sql += ` ORDER BY CASE p.approval_status WHEN 'pending' THEN 0 ELSE 1 END, p.created_at DESC`;
  res.json({
    pharmacies: (await db.all(sql, ...args)).map((p) => ({ ...pharmacyProfile(p), stockItems: p.stock_items, ordersCount: p.orders_count, openComplaints: p.open_complaints })),
  });
});

r.get('/pharmacies/:id', async (req, res) => {
  const p = (await db.get('SELECT * FROM pharmacies WHERE id = ?', Number(req.params.id)));
  if (!p) throw notFound('Pharmacy not found');
  const stock = (await db.all(`SELECT i.id, m.name, m.strength, i.price, i.quantity, i.updated_at AS "updatedAt", COALESCE(i.image_id, m.image_id) AS "imageId" FROM inventory i JOIN medicines m ON m.id = i.medicine_id WHERE i.pharmacy_id = ? ORDER BY m.name`, p.id));
  const complaints = (await db.all(`SELECT id, subject, status, created_at AS "createdAt" FROM complaints WHERE pharmacy_id = ? ORDER BY id DESC`, p.id));
  const imports = (await db.all(`SELECT source, filename, rows_total AS "rowsTotal", created_at AS "createdAt" FROM import_logs WHERE pharmacy_id = ? ORDER BY id DESC LIMIT 10`, p.id));
  const orderStats = (await db.all(`SELECT status, COUNT(*) AS n FROM orders WHERE pharmacy_id = ? GROUP BY status`, p.id));
  res.json({ pharmacy: pharmacyProfile(p), stock, complaints, imports, orderStats });
});

r.post('/pharmacies/:id/decision', async (req, res) => {
  const v = validate(req.body, { action: { required: true, enum: ['approve', 'reject', 'suspend', 'reinstate'] }, reason: { max: 500 } });
  const p = (await db.get('SELECT * FROM pharmacies WHERE id = ?', Number(req.params.id)));
  if (!p) throw notFound('Pharmacy not found');
  if ((v.action === 'reject' || v.action === 'suspend') && !v.reason) throw bad('Give a reason so the pharmacy knows what to fix');
  const status = { approve: 'approved', reject: 'rejected', suspend: 'suspended', reinstate: 'approved' }[v.action];
  (await db.run(`UPDATE pharmacies SET approval_status = ?, rejection_reason = ?, approved_at = CASE WHEN ? = 'approved' THEN now() ELSE approved_at END WHERE id = ?`, status, v.reason ?? null, status, p.id));
  const msg = {
    approve: ['Your pharmacy is approved 🎉', 'Your listing is now live. Patients can find your stock and place orders.'],
    reinstate: ['Your listing is active again', 'MedFinder has reinstated your pharmacy listing.'],
    reject: ['Registration not approved', `Reason: ${v.reason}. Update your details and we'll review again.`],
    suspend: ['Listing suspended', `Your pharmacy is hidden from patients. Reason: ${v.reason}`],
  }[v.action];
  await notify('pharmacy', p.id, 'approval', msg[0], msg[1]);
  await audit(req, `pharmacy.${v.action}`, `pharmacy:${p.id}`, { reason: v.reason });
  res.json({ pharmacy: pharmacyProfile((await db.get('SELECT * FROM pharmacies WHERE id = ?', p.id))) });
});

r.post('/pharmacies/:id/subscription', async (req, res) => {
  const v = validate(req.body, { status: { required: true, enum: ['trial', 'active', 'expired'] }, extendDays: { type: 'number', min: 0, max: 3650, int: true } });
  const p = (await db.get('SELECT * FROM pharmacies WHERE id = ?', Number(req.params.id)));
  if (!p) throw notFound('Pharmacy not found');
  if (v.extendDays) {
    (await db.run(`UPDATE pharmacies SET subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, now()), now()) + ?::interval WHERE id = ?`, `${v.extendDays} days`, p.id));
  }
  (await db.run('UPDATE pharmacies SET subscription_status = ? WHERE id = ?', v.status, p.id));
  await audit(req, 'pharmacy.subscription', `pharmacy:${p.id}`, v);
  res.json({ pharmacy: pharmacyProfile((await db.get('SELECT * FROM pharmacies WHERE id = ?', p.id))) });
});

// ---------- Patients ----------
r.get('/patients', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = (await db.all(`SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.patient_id = p.id) AS orders_count FROM patients p
                           WHERE (? = '' OR p.first_name ILIKE ? OR p.last_name ILIKE ? OR p.phone ILIKE ?) ORDER BY p.id DESC LIMIT 300`, q, `%${q}%`, `%${q}%`, `%${q}%`));
  res.json({ patients: rows.map((p) => ({ ...patientProfile(p), status: p.status, ordersCount: p.orders_count, lastLoginAt: p.last_login_at })) });
});

r.post('/patients/:id/status', async (req, res) => {
  const v = validate(req.body, { status: { required: true, enum: ['active', 'suspended'] } });
  const out = (await db.run('UPDATE patients SET status = ? WHERE id = ?', v.status, Number(req.params.id)));
  if (!out.changes) throw notFound('Patient not found');
  await audit(req, `patient.${v.status}`, `patient:${req.params.id}`);
  res.json({ ok: true });
});

// ---------- Orders ----------
r.get('/orders', async (req, res) => {
  const status = String(req.query.status || '');
  const rows = status
    ? (await db.all('SELECT id FROM orders WHERE status = ? ORDER BY id DESC LIMIT 200', status))
    : (await db.all('SELECT id FROM orders ORDER BY id DESC LIMIT 200'));
  res.json({ orders: (await loadOrders(rows.map((o) => o.id))).map((o) => serializeOrder(o)) });
});

// ---------- Complaints ----------
r.get('/complaints', async (req, res) => {
  const status = String(req.query.status || '');
  const rows = (await db.all(`
    SELECT c.*, ph.name AS pharmacy_name, ph.approval_status, pt.first_name, pt.last_name, pt.phone AS patient_phone, o.code AS order_code
    FROM complaints c LEFT JOIN pharmacies ph ON ph.id = c.pharmacy_id LEFT JOIN patients pt ON pt.id = c.patient_id LEFT JOIN orders o ON o.id = c.order_id
    WHERE (? = '' OR c.status = ?) ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 ELSE 2 END, c.id DESC`, status, status));
  res.json({
    complaints: rows.map((c) => ({
      id: c.id, subject: c.subject, details: c.details, status: c.status, adminNote: c.admin_note, createdAt: c.created_at, resolvedAt: c.resolved_at,
      pharmacy: c.pharmacy_id ? { id: c.pharmacy_id, name: c.pharmacy_name, approvalStatus: c.approval_status } : null,
      patient: c.patient_id ? { id: c.patient_id, name: `${c.first_name} ${c.last_name}`, phone: c.patient_phone } : null,
      orderCode: c.order_code,
    })),
  });
});

r.patch('/complaints/:id', async (req, res) => {
  const v = validate(req.body, { status: { enum: ['open', 'investigating', 'resolved'] }, adminNote: { max: 2000 } });
  const c = (await db.get('SELECT * FROM complaints WHERE id = ?', Number(req.params.id)));
  if (!c) throw notFound('Complaint not found');
  (await db.run(`UPDATE complaints SET status = COALESCE(?, status), admin_note = COALESCE(?, admin_note), resolved_at = CASE WHEN ? = 'resolved' THEN now() ELSE resolved_at END WHERE id = ?`, v.status ?? null, v.adminNote ?? null, v.status ?? null, c.id));
  if (v.status === 'resolved' && c.patient_id) {
    await notify('patient', c.patient_id, 'complaint', 'Your report has been resolved', v.adminNote || 'Thanks for helping keep MedFinder accurate.');
  }
  if (req.body.warnPharmacy && c.pharmacy_id) {
    await notify('pharmacy', c.pharmacy_id, 'warning', 'Message from MedFinder', v.adminNote || `A patient reported: ${c.subject}. Please keep your stock list up to date.`);
  }
  await audit(req, 'complaint.update', `complaint:${c.id}`, v);
  res.json({ ok: true });
});

// ---------- Feature flags (control both apps) ----------
r.get('/features', async (_req, res) => {
  res.json({ features: (await db.all('SELECT key, label, description, audience, enabled, updated_at AS "updatedAt" FROM feature_flags ORDER BY audience, label')).map((f) => ({ ...f, enabled: !!f.enabled })) });
});
r.patch('/features/:key', async (req, res) => {
  const v = validate(req.body, { enabled: { type: 'boolean' }, label: { max: 80 }, description: { max: 300 }, audience: { enum: ['patient', 'pharmacy', 'all'] } });
  const out = (await db.run(`UPDATE feature_flags SET enabled = COALESCE(?, enabled), label = COALESCE(?, label), description = COALESCE(?, description), audience = COALESCE(?, audience), updated_at = now() WHERE key = ?`, v.enabled === undefined ? null : v.enabled ? 1 : 0, v.label ?? null, v.description ?? null, v.audience ?? null, req.params.key));
  if (!out.changes) throw notFound('Feature not found');
  await audit(req, 'feature.update', req.params.key, v);
  res.json({ ok: true });
});
r.post('/features', async (req, res) => {
  const v = validate(req.body, {
    key: { required: true, pattern: /^[a-z0-9_]{2,40}$/, message: 'use lowercase letters, numbers and _' },
    label: { required: true, max: 80 }, description: { max: 300 },
    audience: { enum: ['patient', 'pharmacy', 'all'], default: 'all' }, enabled: { type: 'boolean', default: false },
  });
  if ((await db.get('SELECT key FROM feature_flags WHERE key = ?', v.key))) throw new HttpError(409, 'A feature with this key already exists');
  (await db.run('INSERT INTO feature_flags (key, label, description, audience, enabled) VALUES (?, ?, ?, ?, ?)', v.key, v.label, v.description ?? null, v.audience, v.enabled ? 1 : 0));
  await audit(req, 'feature.create', v.key, v);
  res.status(201).json({ ok: true });
});

// ---------- Announcements ----------
r.get('/announcements', async (_req, res) => {
  res.json({ announcements: (await db.all('SELECT id, title, body, audience, active, created_at AS "createdAt" FROM announcements ORDER BY id DESC')).map((a) => ({ ...a, active: !!a.active })) });
});
r.post('/announcements', async (req, res) => {
  const v = validate(req.body, { title: { required: true, max: 120 }, body: { required: true, max: 1000 }, audience: { enum: ['patient', 'pharmacy', 'all'], default: 'all' } });
  const id = Number((await db.get('INSERT INTO announcements (title, body, audience) VALUES (?, ?, ?) RETURNING id', v.title, v.body, v.audience)).id);
  // Also drop it in pharmacy inboxes so they see it on the dashboard.
  if (v.audience !== 'patient') {
    for (const p of (await db.all(`SELECT id FROM pharmacies WHERE approval_status = 'approved'`))) await notify('pharmacy', p.id, 'announcement', v.title, v.body);
  }
  await audit(req, 'announcement.create', `announcement:${id}`, v);
  res.status(201).json({ id });
});
r.patch('/announcements/:id', async (req, res) => {
  const v = validate(req.body, { active: { type: 'boolean' } });
  (await db.run('UPDATE announcements SET active = ? WHERE id = ?', v.active ? 1 : 0, Number(req.params.id)));
  res.json({ ok: true });
});
r.delete('/announcements/:id', async (req, res) => {
  (await db.run('DELETE FROM announcements WHERE id = ?', Number(req.params.id)));
  res.json({ ok: true });
});

// ---------- Settings ----------
r.get('/settings', async (_req, res) => {
  res.json({ settings: Object.fromEntries((await db.all('SELECT key, value FROM settings')).map((s) => [s.key, s.value])) });
});
r.patch('/settings', async (req, res) => {
  const allowed = ['subscription_price_ghs', 'trial_days', 'support_phone', 'min_app_version'];
  for (const [k, val] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if (['subscription_price_ghs', 'trial_days'].includes(k) && !(Number(val) >= 0)) throw bad(`${k} must be a number`);
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', k, String(val));
  }
  await audit(req, 'settings.update', null, req.body);
  res.json({ ok: true });
});

// ---------- Medicine catalogue ----------
r.get('/medicines', async (req, res) => {
  const q = String(req.query.q || '').trim();
  res.json({ medicines: (await db.all(`SELECT m.*, (SELECT COUNT(*) FROM inventory i WHERE i.medicine_id = m.id) AS listings, ci.author AS credit_author, ci.license AS credit_license
      FROM medicines m LEFT JOIN images ci ON ci.id = m.image_id AND ci.auto = 1
      WHERE (? = '' OR m.name ILIKE ?) ORDER BY m.name LIMIT 500`, q, `%${q}%`))
    .map((m) => ({ id: m.id, name: m.name, strength: m.strength, form: m.form, category: m.category, requiresPrescription: !!m.requires_prescription, description: m.description, listings: m.listings, imageId: m.image_id ?? null, imageCredit: creditText(m.credit_author, m.credit_license) })) });
});
r.patch('/medicines/:id', async (req, res) => {
  const v = validate(req.body, { name: { max: 120 }, strength: { max: 60 }, form: { max: 60 }, category: { max: 60 }, description: { max: 1000 }, requiresPrescription: { type: 'boolean' } });
  (await db.run(`UPDATE medicines SET name = COALESCE(?, name), strength = COALESCE(?, strength), form = COALESCE(?, form), category = COALESCE(?, category), description = COALESCE(?, description),
              requires_prescription = COALESCE(?, requires_prescription) WHERE id = ?`, v.name ?? null, v.strength ?? null, v.form ?? null, v.category ?? null, v.description ?? null, v.requiresPrescription === undefined ? null : v.requiresPrescription ? 1 : 0, Number(req.params.id)));
  await audit(req, 'medicine.update', `medicine:${req.params.id}`, v);
  res.json({ ok: true });
});

/** Set the default (catalogue) photo of a medicine, shown wherever a pharmacy hasn't added its own. */
r.post('/medicines/:id/image', imageUpload.single('image'), async (req, res) => {
  const m = (await db.get('SELECT * FROM medicines WHERE id = ?', Number(req.params.id)));
  if (!m) throw notFound('Medicine not found');
  const id = await saveImage(req.file, 'medicine', m.id, { preset: 'product', oldId: m.image_id });
  (await db.run('UPDATE medicines SET image_id = ? WHERE id = ?', id, m.id));
  await audit(req, 'medicine.image', `medicine:${m.id}`);
  res.json({ imageId: id });
});

r.get('/medicines/:id/photo-suggestions', async (req, res) => {
  const m = (await db.get('SELECT * FROM medicines WHERE id = ?', Number(req.params.id)));
  if (!m) throw notFound('Medicine not found');
  try { res.json({ suggestions: await suggestPhotos(m) }); }
  catch (e) { throw new HttpError(503, e.message || 'Could not search for photos right now'); }
});
r.post('/medicines/:id/photo-from-suggestion', async (req, res) => {
  const m = (await db.get('SELECT * FROM medicines WHERE id = ?', Number(req.params.id)));
  if (!m) throw notFound('Medicine not found');
  const id = await importPhoto(req.body || {}, 'medicine', m.id, m.image_id);
  (await db.run('UPDATE medicines SET image_id = ? WHERE id = ?', id, m.id));
  await audit(req, 'medicine.image_commons', `medicine:${m.id}`);
  res.json({ imageId: id });
});
/** Look up photos for every medicine that still has none (runs in the background). */
r.post('/medicines/fill-photos', async (req, res) => {
  const ids = (await db.all('SELECT id FROM medicines WHERE image_id IS NULL')).map((m) => m.id);
  const queued = await enqueuePhotoLookup(ids, { force: true });
  await audit(req, 'medicine.fill_photos', null, { queued });
  res.json({ queued, progress: lookupStatus });
});
r.get('/medicines/photo-status', async (_req, res) => {
  const missing = (await db.get('SELECT COUNT(*) AS n FROM medicines WHERE image_id IS NULL')).n;
  res.json({ missing, ...lookupStatus });
});

// ---------- Admin users & audit ----------
r.get('/admins', async (_req, res) => res.json({ admins: (await db.all('SELECT id, name, email, created_at AS "createdAt" FROM admins')) }));
r.post('/admins', async (req, res) => {
  const v = validate(req.body, { name: { required: true, max: 80 }, email: { required: true, pattern: EMAIL_RE, message: 'must be a valid email' }, password: { required: true, min: 8 } });
  if ((await db.get('SELECT id FROM admins WHERE email = ?', v.email.toLowerCase()))) throw new HttpError(409, 'Admin already exists');
  (await db.run('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)', v.name, v.email.toLowerCase(), await hashPassword(v.password)));
  await audit(req, 'admin.create', v.email);
  res.status(201).json({ ok: true });
});
r.post('/me/password', async (req, res) => {
  const v = validate(req.body, { currentPassword: { required: true }, newPassword: { required: true, min: 8 } });
  const a = (await db.get('SELECT * FROM admins WHERE id = ?', req.user.id));
  if (!(await checkPassword(v.currentPassword, a.password_hash))) throw bad('Current password is incorrect');
  (await db.run('UPDATE admins SET password_hash = ? WHERE id = ?', await hashPassword(v.newPassword), a.id));
  res.json({ ok: true });
});
r.get('/audit', async (_req, res) => {
  res.json({ entries: (await db.all(`SELECT l.id, l.action, l.target, l.details, l.created_at AS "createdAt", a.name AS admin FROM audit_log l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 200`)) });
});
r.get('/notifications', async (req, res) => {
  const list = (await db.all(`SELECT id, type, title, body, data, read, created_at AS "createdAt" FROM notifications WHERE recipient_type = 'admin' AND recipient_id = ? ORDER BY id DESC LIMIT 50`, req.user.id));
  res.json({ unread: list.filter((n) => !n.read).length, notifications: list.map((n) => ({ ...n, read: !!n.read, data: n.data ? JSON.parse(n.data) : null })) });
});
r.post('/notifications/read', async (req, res) => {
  (await db.run(`UPDATE notifications SET read = 1 WHERE recipient_type = 'admin' AND recipient_id = ?`, req.user.id));
  res.json({ ok: true });
});

export default r;
