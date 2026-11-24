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
import { serializeOrder, loadOrder } from './orders-common.js';
import { imageUpload, saveImage, deleteImage } from '../lib/images.js';

const r = Router();

const flag = (key) => !!db.prepare('SELECT enabled FROM feature_flags WHERE key = ?').get(key)?.enabled;

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
  db.prepare(`UPDATE otp_codes SET used = 1 WHERE phone = ? AND purpose = ? AND used = 0`).run(phone, purpose);
  db.prepare(`INSERT INTO otp_codes (phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))`)
    .run(phone, await bcrypt.hash(code, 8), purpose);
  await sendSms(phone, `Your MedFinder code is ${code}. It expires in 10 minutes.`);
  return config.exposeDevOtp ? { devOtp: code } : {};
}

async function consumeOtp(phone, purpose, code) {
  const row = db.prepare(`SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`).get(phone, purpose);
  if (!row) throw bad('Code expired. Request a new one.');
  if (row.attempts >= 5) throw bad('Too many wrong attempts. Request a new code.');
  if (!(await bcrypt.compare(String(code), row.code_hash))) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw bad('Incorrect code');
  }
  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
}

function session(p) {
  db.prepare(`UPDATE patients SET last_login_at = datetime('now') WHERE id = ?`).run(p.id);
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
  const existing = db.prepare('SELECT * FROM patients WHERE phone = ?').get(v.phone);
  if (existing?.phone_verified) throw new HttpError(409, 'An account with this phone number already exists. Please log in.');
  const hash = await hashPassword(v.password);
  if (existing) {
    db.prepare(`UPDATE patients SET first_name = ?, last_name = ?, email = ?, age = ?, password_hash = ? WHERE id = ?`)
      .run(v.firstName, v.lastName, v.email ?? null, v.age ?? null, hash, existing.id);
  } else {
    db.prepare(`INSERT INTO patients (first_name, last_name, phone, email, age, password_hash) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(v.firstName, v.lastName, v.phone, v.email ?? null, v.age ?? null, hash);
  }
  res.status(201).json({ needsVerification: true, phone: v.phone, ...(await issueOtp(v.phone, 'verify')) });
});

r.post('/auth/verify-otp', rateLimit({ max: 15 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const v = validate({ ...req.body, phone }, { phone: phoneRule, code: { required: true, pattern: /^\d{6}$/, message: 'must be 6 digits' } });
  const p = db.prepare('SELECT * FROM patients WHERE phone = ?').get(v.phone);
  if (!p) throw notFound('Account not found');
  await consumeOtp(v.phone, 'verify', v.code);
  db.prepare('UPDATE patients SET phone_verified = 1 WHERE id = ?').run(p.id);
  if (!p.phone_verified) {
    notify('patient', p.id, 'welcome', `Welcome to MedFinder, ${p.first_name}!`, 'Search for any medicine to see which pharmacies near you have it in stock.');
  }
  res.json(session({ ...p, phone_verified: 1 }));
});

r.post('/auth/resend-otp', rateLimit({ max: 5 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const purpose = req.body?.purpose === 'reset' ? 'reset' : 'verify';
  const p = db.prepare('SELECT id FROM patients WHERE phone = ?').get(phone);
  if (!p) throw notFound('Account not found');
  res.json({ sent: true, ...(await issueOtp(phone, purpose)) });
});

r.post('/auth/login', rateLimit({ max: 10 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const v = validate({ ...req.body, phone }, { phone: phoneRule, password: { required: true } });
  const p = db.prepare('SELECT * FROM patients WHERE phone = ?').get(v.phone);
  if (!p || !(await checkPassword(v.password, p.password_hash))) throw new HttpError(401, 'Wrong phone number or password');
  if (p.status === 'suspended') throw new HttpError(403, 'This account has been suspended. Contact support.');
  if (!p.phone_verified) {
    return res.json({ needsVerification: true, phone: p.phone, ...(await issueOtp(p.phone, 'verify')) });
  }
  res.json(session(p));
});

r.post('/auth/forgot-password', rateLimit({ max: 5 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const p = db.prepare('SELECT id FROM patients WHERE phone = ?').get(phone);
  // Same response whether or not the account exists.
  const extra = p ? await issueOtp(phone, 'reset') : {};
  res.json({ sent: true, phone, ...extra });
});

r.post('/auth/reset-password', rateLimit({ max: 10 }), async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const v = validate({ ...req.body, phone }, { phone: phoneRule, code: { required: true }, password: { required: true, min: 6, max: 100 } });
  const p = db.prepare('SELECT * FROM patients WHERE phone = ?').get(v.phone);
  if (!p) throw bad('Code expired. Request a new one.');
  await consumeOtp(v.phone, 'reset', v.code);
  db.prepare('UPDATE patients SET password_hash = ?, phone_verified = 1 WHERE id = ?').run(await hashPassword(v.password), p.id);
  res.json(session({ ...p, phone_verified: 1 }));
});

// ---------- Everything below needs a signed-in patient ----------
r.use(requireAuth('patient'));

const me = (req) => db.prepare('SELECT * FROM patients WHERE id = ?').get(req.user.id);

r.get('/me', (req, res) => res.json({ patient: patientProfile(me(req)) }));

r.patch('/me', (req, res) => {
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
    db.prepare(`UPDATE patients SET ${sets.map((k) => `${map[k]} = ?`).join(', ')} WHERE id = ?`).run(...sets.map((k) => v[k]), req.user.id);
  }
  res.json({ patient: patientProfile(me(req)) });
});

// ---------- Profile picture ----------
r.post('/me/avatar', imageUpload.single('image'), async (req, res) => {
  const p = me(req);
  const id = await saveImage(req.file, 'patient_avatar', p.id, { preset: 'square', oldId: p.avatar_image_id });
  db.prepare('UPDATE patients SET avatar_image_id = ? WHERE id = ?').run(id, p.id);
  res.json({ patient: patientProfile(me(req)) });
});
r.delete('/me/avatar', (req, res) => {
  const p = me(req);
  deleteImage(p.avatar_image_id);
  db.prepare('UPDATE patients SET avatar_image_id = NULL WHERE id = ?').run(p.id);
  res.json({ patient: patientProfile(me(req)) });
});

r.post('/me/password', async (req, res) => {
  const v = validate(req.body, { currentPassword: { required: true }, newPassword: { required: true, min: 6, max: 100 } });
  const p = me(req);
  if (!(await checkPassword(v.currentPassword, p.password_hash))) throw bad('Current password is incorrect');
  db.prepare('UPDATE patients SET password_hash = ? WHERE id = ?').run(await hashPassword(v.newPassword), p.id);
  res.json({ ok: true });
});

r.delete('/me', async (req, res) => {
  const p = me(req);
  if (!(await checkPassword(String(req.body?.password || ''), p.password_hash))) throw bad('Password is incorrect');
  const open = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE patient_id = ? AND status IN ('pending','accepted','preparing','ready','out_for_delivery')`).get(p.id).n;
  if (open) throw bad('You have orders in progress. Cancel or complete them before deleting your account.');
  // Keep order history for pharmacies but remove personal details.
  deleteImage(p.avatar_image_id);
  db.prepare(`UPDATE patients SET avatar_image_id = NULL, first_name = 'Deleted', last_name = 'User', phone = ?, email = NULL, address = NULL, lat = NULL, lng = NULL, push_token = NULL, status = 'suspended', password_hash = '' WHERE id = ?`)
    .run(`deleted-${p.id}-${Date.now()}`, p.id);
  res.json({ ok: true });
});

// ---------- Orders ----------
r.post('/orders', (req, res) => {
  if (flag('maintenance_mode')) throw new HttpError(503, 'MedFinder is under maintenance. Ordering is paused for a short while.');
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

  const pharmacy = db.prepare(`SELECT p.* FROM pharmacies p WHERE p.id = ? AND ${VISIBLE}`).get(v.pharmacyId);
  if (!pharmacy) throw notFound('This pharmacy is not available right now');
  if (v.method === 'delivery') {
    if (!flag('delivery')) throw bad('Delivery is not available at the moment. Choose pickup.');
    if (!pharmacy.offers_delivery) throw bad(`${pharmacy.name} does not offer delivery. Choose pickup.`);
    if (!v.deliveryAddress) throw bad('Enter a delivery address');
  }
  if (v.paymentMethod === 'momo' && !flag('momo_payments')) throw bad('Mobile Money is not available right now. Choose cash.');

  const order = tx(() => {
    const lines = items.map((it) => {
      const qty = Math.round(Number(it.quantity));
      if (!Number.isFinite(qty) || qty < 1 || qty > 100) throw bad('Each quantity must be between 1 and 100');
      const inv = db.prepare(`SELECT i.*, m.name, m.strength FROM inventory i JOIN medicines m ON m.id = i.medicine_id WHERE i.pharmacy_id = ? AND i.medicine_id = ?`)
        .get(pharmacy.id, Number(it.medicineId));
      if (!inv) throw bad('One of the medicines is not sold at this pharmacy');
      if (inv.quantity < qty) throw bad(`Only ${inv.quantity} of ${inv.name} ${inv.strength} left at ${pharmacy.name}`);
      return { inv, qty };
    });
    const subtotal = Math.round(lines.reduce((s, l) => s + l.inv.price * l.qty, 0) * 100) / 100;
    const fee = v.method === 'delivery' ? pharmacy.delivery_fee : 0;
    const code = `MF-${Date.now().toString(36).toUpperCase().slice(-5)}${crypto.randomInt(10, 99)}`;
    const id = Number(db.prepare(`INSERT INTO orders (code, patient_id, pharmacy_id, method, delivery_address, delivery_lat, delivery_lng, payment_method, subtotal, delivery_fee, total, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(code, req.user.id, pharmacy.id, v.method, v.deliveryAddress ?? null,
      v.deliveryLat ?? null, v.deliveryLng ?? null, v.paymentMethod, subtotal, fee, subtotal + fee, v.note ?? null).lastInsertRowid);
    const insItem = db.prepare('INSERT INTO order_items (order_id, medicine_id, name, strength, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?)');
    for (const l of lines) insItem.run(id, l.inv.medicine_id, l.inv.name, l.inv.strength, l.inv.price, l.qty);
    db.prepare(`INSERT INTO order_events (order_id, status, note) VALUES (?, 'pending', 'Order placed')`).run(id);
    return { id, code, total: subtotal + fee };
  });

  const patient = me(req);
  notify('pharmacy', pharmacy.id, 'new_order', `New order ${order.code}`,
    `${patient.first_name} ${patient.last_name} placed a ${v.method} order (GH₵ ${order.total.toFixed(2)}).`, { orderId: order.id });
  notify('patient', req.user.id, 'order', `Order ${order.code} placed`, `${pharmacy.name} will confirm your order shortly.`, { orderId: order.id });
  res.status(201).json({ order: serializeOrder(loadOrder(order.id), { forPatient: true }) });
});

r.get('/orders', (req, res) => {
  const rows = db.prepare('SELECT id FROM orders WHERE patient_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({ orders: rows.map((o) => serializeOrder(loadOrder(o.id), { forPatient: true })) });
});

r.get('/orders/:id', (req, res) => {
  const o = loadOrder(Number(req.params.id));
  if (!o || o.patient_id !== req.user.id) throw notFound('Order not found');
  res.json({ order: serializeOrder(o, { forPatient: true }) });
});

r.post('/orders/:id/cancel', (req, res) => {
  const o = loadOrder(Number(req.params.id));
  if (!o || o.patient_id !== req.user.id) throw notFound('Order not found');
  if (!['pending', 'accepted'].includes(o.status)) throw bad('This order is already being prepared and can no longer be cancelled. Please call the pharmacy.');
  tx(() => {
    if (o.status === 'accepted') {
      // stock was reserved on accept, give it back
      for (const it of o.items) db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE pharmacy_id = ? AND medicine_id = ?').run(it.quantity, o.pharmacy_id, it.medicine_id);
    }
    db.prepare(`UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(o.id);
    db.prepare(`INSERT INTO order_events (order_id, status, note) VALUES (?, 'cancelled', ?)`).run(o.id, 'Cancelled by patient');
  });
  notify('pharmacy', o.pharmacy_id, 'order_cancelled', `Order ${o.code} cancelled`, 'The patient cancelled this order.', { orderId: o.id });
  res.json({ order: serializeOrder(loadOrder(o.id), { forPatient: true }) });
});

// ---------- Notifications ----------
r.get('/notifications', (req, res) => {
  const list = db.prepare(`SELECT id, type, title, body, data, read, created_at AS createdAt FROM notifications WHERE recipient_type = 'patient' AND recipient_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  const unread = list.filter((n) => !n.read).length;
  res.json({ unread, notifications: list.map((n) => ({ ...n, read: !!n.read, data: n.data ? JSON.parse(n.data) : null })) });
});
r.post('/notifications/read', (req, res) => {
  db.prepare(`UPDATE notifications SET read = 1 WHERE recipient_type = 'patient' AND recipient_id = ?`).run(req.user.id);
  res.json({ ok: true });
});

// ---------- Restock alerts ----------
r.get('/restock-alerts', (req, res) => {
  res.json({ alerts: db.prepare(`SELECT ra.id, ra.created_at AS createdAt, ra.notified_at AS notifiedAt, m.id AS medicineId, m.name, m.strength FROM restock_alerts ra JOIN medicines m ON m.id = ra.medicine_id WHERE ra.patient_id = ? ORDER BY ra.id DESC`).all(req.user.id) });
});
r.post('/restock-alerts', (req, res) => {
  if (!flag('restock_alerts')) throw bad('Restock alerts are not available right now');
  const medicineId = Number(req.body?.medicineId);
  if (!db.prepare('SELECT id FROM medicines WHERE id = ?').get(medicineId)) throw notFound('Medicine not found');
  db.prepare(`INSERT INTO restock_alerts (patient_id, medicine_id) VALUES (?, ?) ON CONFLICT(patient_id, medicine_id) DO UPDATE SET notified_at = NULL, created_at = datetime('now')`).run(req.user.id, medicineId);
  res.status(201).json({ ok: true });
});
r.delete('/restock-alerts/:id', (req, res) => {
  db.prepare('DELETE FROM restock_alerts WHERE id = ? AND patient_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------- Recent searches & favourites ----------
r.get('/recent-searches', (req, res) => {
  res.json({ searches: db.prepare('SELECT query FROM recent_searches WHERE patient_id = ? ORDER BY id DESC LIMIT 8').all(req.user.id).map((s) => s.query) });
});
r.delete('/recent-searches', (req, res) => {
  db.prepare('DELETE FROM recent_searches WHERE patient_id = ?').run(req.user.id);
  res.json({ ok: true });
});
r.get('/favorites', (req, res) => {
  res.json({ pharmacyIds: db.prepare('SELECT pharmacy_id FROM favorites WHERE patient_id = ?').all(req.user.id).map((f) => f.pharmacy_id) });
});
r.put('/favorites/:pharmacyId', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO favorites (patient_id, pharmacy_id) VALUES (?, ?)').run(req.user.id, Number(req.params.pharmacyId));
  res.json({ ok: true });
});
r.delete('/favorites/:pharmacyId', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE patient_id = ? AND pharmacy_id = ?').run(req.user.id, Number(req.params.pharmacyId));
  res.json({ ok: true });
});

// ---------- Complaints ----------
r.post('/complaints', (req, res) => {
  if (!flag('complaints')) throw bad('Reporting is not available right now');
  const v = validate(req.body, {
    pharmacyId: { required: true, type: 'number', int: true },
    orderId: { type: 'number', int: true },
    subject: { required: true, max: 150 },
    details: { required: true, min: 10, max: 2000 },
  });
  if (!db.prepare('SELECT id FROM pharmacies WHERE id = ?').get(v.pharmacyId)) throw notFound('Pharmacy not found');
  const id = Number(db.prepare('INSERT INTO complaints (patient_id, pharmacy_id, order_id, subject, details) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, v.pharmacyId, v.orderId ?? null, v.subject, v.details).lastInsertRowid);
  res.status(201).json({ id, message: 'Thanks. Our team will look into this.' });
});

export default r;
