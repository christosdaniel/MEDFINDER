// Patient accounts (sign up, OTP verification, login that is remembered),
// orders, notifications, restock alerts and complaints.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { signToken, hashPassword, checkPassword, requireAuth, rateLimit } from '../lib/auth.js';
import { validate, normalizePhone, PHONE_RE, EMAIL_RE, bad, notFound, HttpError } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { sendSms } from '../lib/sms.js';
import { VISIBLE } from './public.js';
import { serializeOrder, loadOrder, loadOrders } from './orders-common.js';
import { imageUpload, saveImage, deleteImage } from '../lib/images.js';

const r = Router();

const flag = async (key) => !!(await db.get('SELECT enabled FROM feature_flags WHERE key = ?', key))?.enabled;

export function patientProfile(p) {
  return {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    phone: p.phone,
    email: p.email,
    age: p.age,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    phoneVerified: !!p.phone_verified,
    createdAt: p.created_at,
    avatarImageId: p.avatar_image_id ?? null,
  };
}

async function issueOtp(phone, purpose) {
  const code = String(crypto.randomInt(100000, 1000000));
  (await db.run(`UPDATE otp_codes SET used = 1 WHERE phone = ? AND purpose = ? AND used = 0`, phone, purpose));
  (await db.run(`INSERT INTO otp_codes (phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, now() + interval '10 minutes')`, phone, await bcrypt.hash(code, 8), purpose));
  await sendSms(phone, `Your MedFinder code is ${code}. It expires in 10 minutes.`);
  return config.exposeDevOtp ? { devOtp: code } : {};
}

async function consumeOtp(phone, purpose, code) {
  const row = (await db.get(`SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0 AND expires_at > now() ORDER BY id DESC LIMIT 1`, phone, purpose));
  if (!row) throw bad('Code expired. Request a new one.');
  if (row.attempts >= 5) throw bad('Too many wrong attempts. Request a new code.');
  if (!(await bcrypt.compare(String(code), row.code_hash))) {
    (await db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', row.id));
    throw bad('Incorrect code');
  }
  (await db.run('UPDATE otp_codes SET used = 1 WHERE id = ?', row.id));
}

async function session(p) {
  (await db.run(`UPDATE patients SET last_login_at = now() WHERE id = ?`, p.id));
  return { token: signToken('patient', p.id), patient: patientProfile(p) };
}

const phoneRule = { required: true, pattern: PHONE_RE, message: 'must be a valid phone number e.g. 024 123 4567' };

// ---------- Auth ----------
r.post('/auth/register', rateLimit({ max: 10 }), async (req, res) => {
  const body = { ...req.body, phone: normalizePhone(req.body?.phone) };
  const v = validate(body, {
    firstName: { required: true, max: 60 },
    lastName: { required: true, max: 60 },
    phone: phoneRule,
    password: { required: true, min: 6, max: 100 },
    email: { pattern: EMAIL_RE, message: 'must be a valid email' },
    age: { type: 'number', min: 1, max: 120, int: true },
  });
  const existing = (await db.get('SELECT * FROM patients WHERE phone = ?', v.phone));
  if (existing?.phone_verified) throw new HttpError(409, 'An account with this phone number already exists. Please log in.');
  const hash = await hashPassword(v.password);
  if (existing) {
    (await db.run(`UPDATE patients SET first_name = ?, last_name = ?, email = ?, age = ?, password_hash = ? WHERE id = ?`, v.firstName, v.lastName, v.email ?? null, v.age ?? null, hash, existing.id));
  } else {
    (await db.run(`INSERT INTO patients (first_name, last_name, phone, email, age, password_hash) VALUES (?, ?, ?, ?, ?, ?)`, v.firstName, v.lastName, v.phone, v.email ?? null, v.age ?? null, hash));
  }
  res.status(201).json({ needsVerification: true, phone: v.phone, ...(await issueOtp(v.phone, 'verify')) });
});

r.post('/auth/verify-otp', rateLimit({ max: 15 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const v = validate({ ...req.body, phone }, { phone: phoneRule, code: { required: true, pattern: /^\d{6}$/, message: 'must be 6 digits' } });
  const p = (await db.get('SELECT * FROM patients WHERE phone = ?', v.phone));
  if (!p) throw notFound('Account not found');
  await consumeOtp(v.phone, 'verify', v.code);
  (await db.run('UPDATE patients SET phone_verified = 1 WHERE id = ?', p.id));
  if (!p.phone_verified) {
    await notify('patient', p.id, 'welcome', `Welcome to MedFinder, ${p.first_name}!`, 'Search for any medicine to see which pharmacies near you have it in stock.');
  }
  res.json(await session({ ...p, phone_verified: 1 }));
});

r.post('/auth/resend-otp', rateLimit({ max: 5 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const purpose = req.body?.purpose === 'reset' ? 'reset' : 'verify';
  const p = (await db.get('SELECT id FROM patients WHERE phone = ?', phone));
  if (!p) throw notFound('Account not found');
  res.json({ sent: true, ...(await issueOtp(phone, purpose)) });
});

r.post('/auth/login', rateLimit({ max: 10 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const v = validate({ ...req.body, phone }, { phone: phoneRule, password: { required: true } });
  const p = (await db.get('SELECT * FROM patients WHERE phone = ?', v.phone));
  if (!p || !(await checkPassword(v.password, p.password_hash))) throw new HttpError(401, 'Wrong phone number or password');
  if (p.status === 'suspended') throw new HttpError(403, 'This account has been suspended. Contact support.');
  if (!p.phone_verified) {
    return res.json({ needsVerification: true, phone: p.phone, ...(await issueOtp(p.phone, 'verify')) });
  }
  res.json(await session(p));
});

r.post('/auth/forgot-password', rateLimit({ max: 5 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const p = (await db.get('SELECT id FROM patients WHERE phone = ?', phone));
  // Same response whether or not the account exists.
  const extra = p ? await issueOtp(phone, 'reset') : {};
  res.json({ sent: true, phone, ...extra });
});

r.post('/auth/reset-password', rateLimit({ max: 10 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const v = validate({ ...req.body, phone }, { phone: phoneRule, code: { required: true }, password: { required: true, min: 6, max: 100 } });
  const p = (await db.get('SELECT * FROM patients WHERE phone = ?', v.phone));
  if (!p) throw bad('Code expired. Request a new one.');
  await consumeOtp(v.phone, 'reset', v.code);
  (await db.run('UPDATE patients SET password_hash = ?, phone_verified = 1 WHERE id = ?', await hashPassword(v.password), p.id));
  res.json(await session({ ...p, phone_verified: 1 }));
});

// ---------- Everything below needs a signed-in patient ----------
r.use(requireAuth('patient'));

const me = async (req) => (await db.get('SELECT * FROM patients WHERE id = ?', req.user.id));

r.get('/me', async (req, res) => res.json({ patient: patientProfile(await me(req)) }));

r.patch('/me', async (req, res) => {
  const v = validate(req.body, {
    firstName: { max: 60 }, lastName: { max: 60 },
    email: { pattern: EMAIL_RE, message: 'must be a valid email' },
    age: { type: 'number', min: 1, max: 120, int: true },
    address: { max: 300 },
    lat: { type: 'number', min: -90, max: 90 }, lng: { type: 'number', min: -180, max: 180 },
    pushToken: { max: 300 },
  });
  const map = { firstName: 'first_name', lastName: 'last_name', email: 'email', age: 'age', address: 'address', lat: 'lat', lng: 'lng', pushToken: 'push_token' };
  const sets = Object.keys(v).filter((k) => map[k]);
  if (sets.length) {
    (await db.run(`UPDATE patients SET ${sets.map((k) => `${map[k]} = ?`).join(', ')} WHERE id = ?`, ...sets.map((k) => v[k]), req.user.id));
  }
  res.json({ patient: patientProfile(await me(req)) });
});

// ---------- Profile picture ----------
r.post('/me/avatar', imageUpload.single('image'), async (req, res) => {
  const p = await me(req);
  const id = await saveImage(req.file, 'patient_avatar', p.id, { preset: 'square', oldId: p.avatar_image_id });
  (await db.run('UPDATE patients SET avatar_image_id = ? WHERE id = ?', id, p.id));
  res.json({ patient: patientProfile(await me(req)) });
});
r.delete('/me/avatar', async (req, res) => {
  const p = await me(req);
  await deleteImage(p.avatar_image_id);
  (await db.run('UPDATE patients SET avatar_image_id = NULL WHERE id = ?', p.id));
  res.json({ patient: patientProfile(await me(req)) });
});

r.post('/me/password', async (req, res) => {
  const v = validate(req.body, { currentPassword: { required: true }, newPassword: { required: true, min: 6, max: 100 } });
  const p = await me(req);
  if (!(await checkPassword(v.currentPassword, p.password_hash))) throw bad('Current password is incorrect');
  (await db.run('UPDATE patients SET password_hash = ? WHERE id = ?', await hashPassword(v.newPassword), p.id));
  res.json({ ok: true });
});

r.delete('/me', async (req, res) => {
  const p = await me(req);
  if (!(await checkPassword(String(req.body?.password || ''), p.password_hash))) throw bad('Password is incorrect');
  const open = (await db.get(`SELECT COUNT(*) AS n FROM orders WHERE patient_id = ? AND status IN ('pending','accepted','preparing','ready','out_for_delivery')`, p.id)).n;
  if (open) throw bad('You have orders in progress. Cancel or complete them before deleting your account.');
  // Keep order history for pharmacies but remove personal details.
  await deleteImage(p.avatar_image_id);
  (await db.run(`UPDATE patients SET avatar_image_id = NULL, first_name = 'Deleted', last_name = 'User', phone = ?, email = NULL, address = NULL, lat = NULL, lng = NULL, push_token = NULL, status = 'suspended', password_hash = '' WHERE id = ?`, `deleted-${p.id}-${Date.now()}`, p.id));
  res.json({ ok: true });
});

// ---------- Orders ----------
r.post('/orders', async (req, res) => {
  if (await flag('maintenance_mode')) throw new HttpError(503, 'MedFinder is under maintenance. Ordering is paused for a short while.');
  const v = validate(req.body, {
    pharmacyId: { required: true, type: 'number', int: true },
    method: { required: true, enum: ['pickup', 'delivery'] },
    deliveryAddress: { max: 300 },
    deliveryLat: { type: 'number' }, deliveryLng: { type: 'number' },
    paymentMethod: { enum: ['cash', 'momo'], default: 'cash' },
    note: { max: 500 },
  });
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw bad('Add at least one medicine to your order');
  if (items.length > 30) throw bad('Too many items in one order');

  const pharmacy = (await db.get(`SELECT p.* FROM pharmacies p WHERE p.id = ? AND ${VISIBLE}`, v.pharmacyId));
  if (!pharmacy) throw notFound('This pharmacy is not available right now');
  if (v.method === 'delivery') {
    if (!await flag('delivery')) throw bad('Delivery is not available at the moment. Choose pickup.');
    if (!pharmacy.offers_delivery) throw bad(`${pharmacy.name} does not offer delivery. Choose pickup.`);
    if (!v.deliveryAddress) throw bad('Enter a delivery address');
  }
  if (v.paymentMethod === 'momo' && !await flag('momo_payments')) throw bad('Mobile Money is not available right now. Choose cash.');

  const order = await tx(async () => {
    const lines = [];
    for (const it of items) {
      const qty = Math.round(Number(it.quantity));
      if (!Number.isFinite(qty) || qty < 1 || qty > 100) throw bad('Each quantity must be between 1 and 100');
      const inv = (await db.get(`SELECT i.*, m.name, m.strength FROM inventory i JOIN medicines m ON m.id = i.medicine_id WHERE i.pharmacy_id = ? AND i.medicine_id = ?`, pharmacy.id, Number(it.medicineId)));
      if (!inv) throw bad('One of the medicines is not sold at this pharmacy');
      if (inv.quantity < qty) throw bad(`Only ${inv.quantity} of ${inv.name} ${inv.strength} left at ${pharmacy.name}`);
      lines.push({ inv, qty });
    }
    const subtotal = Math.round(lines.reduce((s, l) => s + l.inv.price * l.qty, 0) * 100) / 100;
    const fee = v.method === 'delivery' ? pharmacy.delivery_fee : 0;
    const code = `MF-${Date.now().toString(36).toUpperCase().slice(-5)}${crypto.randomInt(10, 99)}`;
    const id = Number((await db.get(`INSERT INTO orders (code, patient_id, pharmacy_id, method, delivery_address, delivery_lat, delivery_lng, payment_method, subtotal, delivery_fee, total, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, code, req.user.id, pharmacy.id, v.method, v.deliveryAddress ?? null,
      v.deliveryLat ?? null, v.deliveryLng ?? null, v.paymentMethod, subtotal, fee, subtotal + fee, v.note ?? null)).id);
    for (const l of lines) {
      await db.run('INSERT INTO order_items (order_id, medicine_id, name, strength, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?)', id, l.inv.medicine_id, l.inv.name, l.inv.strength, l.inv.price, l.qty);
    }
    (await db.run(`INSERT INTO order_events (order_id, status, note) VALUES (?, 'pending', 'Order placed')`, id));
    return { id, code, total: subtotal + fee };
  });

  const patient = await me(req);
  await notify('pharmacy', pharmacy.id, 'new_order', `New order ${order.code}`,
    `${patient.first_name} ${patient.last_name} placed a ${v.method} order (GH₵ ${order.total.toFixed(2)}).`, { orderId: order.id });
  await notify('patient', req.user.id, 'order', `Order ${order.code} placed`, `${pharmacy.name} will confirm your order shortly.`, { orderId: order.id });
  res.status(201).json({ order: serializeOrder(await loadOrder(order.id), { forPatient: true }) });
});

r.get('/orders', async (req, res) => {
  const rows = (await db.all('SELECT id FROM orders WHERE patient_id = ? ORDER BY id DESC LIMIT 100', req.user.id));
  res.json({ orders: (await loadOrders(rows.map((o) => o.id))).map((o) => serializeOrder(o, { forPatient: true })) });
});

r.get('/orders/:id', async (req, res) => {
  const o = await loadOrder(Number(req.params.id));
  if (!o || o.patient_id !== req.user.id) throw notFound('Order not found');
  res.json({ order: serializeOrder(o, { forPatient: true }) });
});

r.post('/orders/:id/cancel', async (req, res) => {
  const o = await loadOrder(Number(req.params.id));
  if (!o || o.patient_id !== req.user.id) throw notFound('Order not found');
  if (!['pending', 'accepted'].includes(o.status)) throw bad('This order is already being prepared and can no longer be cancelled. Please call the pharmacy.');
  await tx(async () => {
    if (o.status === 'accepted') {
      // stock was reserved on accept, give it back
      for (const it of o.items) (await db.run('UPDATE inventory SET quantity = quantity + ? WHERE pharmacy_id = ? AND medicine_id = ?', it.quantity, o.pharmacy_id, it.medicine_id));
    }
    (await db.run(`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ?`, o.id));
    (await db.run(`INSERT INTO order_events (order_id, status, note) VALUES (?, 'cancelled', ?)`, o.id, 'Cancelled by patient'));
  });
  await notify('pharmacy', o.pharmacy_id, 'order_cancelled', `Order ${o.code} cancelled`, 'The patient cancelled this order.', { orderId: o.id });
  res.json({ order: serializeOrder(await loadOrder(o.id), { forPatient: true }) });
});

// ---------- Notifications ----------
r.get('/notifications', async (req, res) => {
  const list = (await db.all(`SELECT id, type, title, body, data, read, created_at AS "createdAt" FROM notifications WHERE recipient_type = 'patient' AND recipient_id = ? ORDER BY id DESC LIMIT 50`, req.user.id));
  const unread = list.filter((n) => !n.read).length;
  res.json({ unread, notifications: list.map((n) => ({ ...n, read: !!n.read, data: n.data ? JSON.parse(n.data) : null })) });
});
r.post('/notifications/read', async (req, res) => {
  (await db.run(`UPDATE notifications SET read = 1 WHERE recipient_type = 'patient' AND recipient_id = ?`, req.user.id));
  res.json({ ok: true });
});

// ---------- Restock alerts ----------
r.get('/restock-alerts', async (req, res) => {
  res.json({ alerts: (await db.all(`SELECT ra.id, ra.created_at AS "createdAt", ra.notified_at AS "notifiedAt", m.id AS "medicineId", m.name, m.strength FROM restock_alerts ra JOIN medicines m ON m.id = ra.medicine_id WHERE ra.patient_id = ? ORDER BY ra.id DESC`, req.user.id)) });
});
r.post('/restock-alerts', async (req, res) => {
  if (!await flag('restock_alerts')) throw bad('Restock alerts are not available right now');
  const medicineId = Number(req.body?.medicineId);
  if (!(await db.get('SELECT id FROM medicines WHERE id = ?', medicineId))) throw notFound('Medicine not found');
  (await db.run(`INSERT INTO restock_alerts (patient_id, medicine_id) VALUES (?, ?) ON CONFLICT(patient_id, medicine_id) DO UPDATE SET notified_at = NULL, created_at = now()`, req.user.id, medicineId));
  res.status(201).json({ ok: true });
});
r.delete('/restock-alerts/:id', async (req, res) => {
  (await db.run('DELETE FROM restock_alerts WHERE id = ? AND patient_id = ?', Number(req.params.id), req.user.id));
  res.json({ ok: true });
});

// ---------- Recent searches & favourites ----------
r.get('/recent-searches', async (req, res) => {
  res.json({ searches: (await db.all('SELECT query FROM recent_searches WHERE patient_id = ? ORDER BY id DESC LIMIT 8', req.user.id)).map((s) => s.query) });
});
r.delete('/recent-searches', async (req, res) => {
  (await db.run('DELETE FROM recent_searches WHERE patient_id = ?', req.user.id));
  res.json({ ok: true });
});
r.get('/favorites', async (req, res) => {
  res.json({ pharmacyIds: (await db.all('SELECT pharmacy_id FROM favorites WHERE patient_id = ?', req.user.id)).map((f) => f.pharmacy_id) });
});
r.put('/favorites/:pharmacyId', async (req, res) => {
  (await db.run('INSERT INTO favorites (patient_id, pharmacy_id) VALUES (?, ?) ON CONFLICT DO NOTHING', req.user.id, Number(req.params.pharmacyId)));
  res.json({ ok: true });
});
r.delete('/favorites/:pharmacyId', async (req, res) => {
  (await db.run('DELETE FROM favorites WHERE patient_id = ? AND pharmacy_id = ?', req.user.id, Number(req.params.pharmacyId)));
  res.json({ ok: true });
});

// ---------- Complaints ----------
r.post('/complaints', async (req, res) => {
  if (!await flag('complaints')) throw bad('Reporting is not available right now');
  const v = validate(req.body, {
    pharmacyId: { required: true, type: 'number', int: true },
    orderId: { type: 'number', int: true },
    subject: { required: true, max: 150 },
    details: { required: true, min: 10, max: 2000 },
  });
  if (!(await db.get('SELECT id FROM pharmacies WHERE id = ?', v.pharmacyId))) throw notFound('Pharmacy not found');
  const id = Number((await db.get('INSERT INTO complaints (patient_id, pharmacy_id, order_id, subject, details) VALUES (?, ?, ?, ?, ?) RETURNING id', req.user.id, v.pharmacyId, v.orderId ?? null, v.subject, v.details)).id);
  res.status(201).json({ id, message: 'Thanks. Our team will look into this.' });
});

export default r;
