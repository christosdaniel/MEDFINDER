// Admin console API: verify pharmacies, oversee patients & orders, handle
// complaints, switch features on/off for both apps, announcements, settings.
import { Router } from 'express';
import { db } from '../db.js';
import { signToken, hashPassword, checkPassword, requireAuth, rateLimit } from '../lib/auth.js';
import { validate, EMAIL_RE, bad, notFound, HttpError } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { pharmacyProfile } from './pharmacy.js';
import { patientProfile } from './patient.js';
import { loadOrder, serializeOrder } from './orders-common.js';

const r = Router();

function audit(req, action, target, details) {
  db.prepare('INSERT INTO audit_log (admin_id, action, target, details) VALUES (?, ?, ?, ?)')
    .run(req.user.id, action, target ?? null, details ? JSON.stringify(details) : null);
}

r.post('/auth/login', rateLimit({ max: 10 }), async (req, res) => {
  const v = validate(req.body, { email: { required: true }, password: { required: true } });
  const a = db.prepare('SELECT * FROM admins WHERE email = ?').get(v.email.toLowerCase());
  if (!a || !(await checkPassword(v.password, a.password_hash))) throw new HttpError(401, 'Wrong email or password');
  res.json({ token: signToken('admin', a.id), admin: { id: a.id, name: a.name, email: a.email } });
});

r.use(requireAuth('admin'));

r.get('/me', (req, res) => {
  const a = db.prepare('SELECT id, name, email FROM admins WHERE id = ?').get(req.user.id);
  res.json({ admin: a });
});

r.get('/stats', (_req, res) => {
  const n = (sql) => db.prepare(sql).get().n;
  res.json({
    patients: n('SELECT COUNT(*) AS n FROM patients WHERE phone_verified = 1'),
    pharmacies: n(`SELECT COUNT(*) AS n FROM pharmacies WHERE approval_status = 'approved'`),
    pendingPharmacies: n(`SELECT COUNT(*) AS n FROM pharmacies WHERE approval_status = 'pending'`),
    ordersToday: n(`SELECT COUNT(*) AS n FROM orders WHERE date(created_at) = date('now')`),
    ordersTotal: n('SELECT COUNT(*) AS n FROM orders'),
    gmv: db.prepare(`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status = 'completed'`).get().n,
    openComplaints: n(`SELECT COUNT(*) AS n FROM complaints WHERE status != 'resolved'`),
    medicines: n('SELECT COUNT(*) AS n FROM medicines'),
    subscriptionRevenue: db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM subscription_payments').get().n,
    staleListings: n(`SELECT COUNT(*) AS n FROM pharmacies WHERE approval_status = 'approved' AND (last_sync_at IS NULL OR last_sync_at < datetime('now','-7 days'))`),
    ordersByDay: db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS orders FROM orders WHERE created_at >= date('now','-13 days') GROUP BY day ORDER BY day`).all(),
    topSearches: db.prepare(`SELECT query, COUNT(*) AS n FROM recent_searches GROUP BY lower(query) ORDER BY n DESC LIMIT 8`).all(),
    unmetDemand: db.prepare(`SELECT m.name, m.strength, COUNT(*) AS patients FROM restock_alerts ra JOIN medicines m ON m.id = ra.medicine_id WHERE ra.notified_at IS NULL GROUP BY m.id ORDER BY patients DESC LIMIT 8`).all(),
  });
});

// ---------- Pharmacies ----------
r.get('/pharmacies', (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  let sql = `SELECT p.*, (SELECT COUNT(*) FROM inventory i WHERE i.pharmacy_id = p.id) AS stock_items,
             (SELECT COUNT(*) FROM orders o WHERE o.pharmacy_id = p.id) AS orders_count,
             (SELECT COUNT(*) FROM complaints c WHERE c.pharmacy_id = p.id AND c.status != 'resolved') AS open_complaints
             FROM pharmacies p WHERE 1=1`;
  const args = [];
  if (status) { sql += ' AND p.approval_status = ?'; args.push(status); }
  if (q) { sql += ' AND (p.name LIKE ? OR p.email LIKE ? OR p.area LIKE ? OR p.license_number LIKE ?)'; args.push(...Array(4).fill(`%${q}%`)); }
  sql += ` ORDER BY CASE p.approval_status WHEN 'pending' THEN 0 ELSE 1 END, p.created_at DESC`;
  res.json({
    pharmacies: db.prepare(sql).all(...args).map((p) => ({ ...pharmacyProfile(p), stockItems: p.stock_items, ordersCount: p.orders_count, openComplaints: p.open_complaints })),
  });
});

r.get('/pharmacies/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(Number(req.params.id));
  if (!p) throw notFound('Pharmacy not found');
  const stock = db.prepare(`SELECT i.id, m.name, m.strength, i.price, i.quantity, i.updated_at AS updatedAt FROM inventory i JOIN medicines m ON m.id = i.medicine_id WHERE i.pharmacy_id = ? ORDER BY m.name`).all(p.id);
  const complaints = db.prepare(`SELECT id, subject, status, created_at AS createdAt FROM complaints WHERE pharmacy_id = ? ORDER BY id DESC`).all(p.id);
  const imports = db.prepare(`SELECT source, filename, rows_total AS rowsTotal, created_at AS createdAt FROM import_logs WHERE pharmacy_id = ? ORDER BY id DESC LIMIT 10`).all(p.id);
  const orderStats = db.prepare(`SELECT status, COUNT(*) AS n FROM orders WHERE pharmacy_id = ? GROUP BY status`).all(p.id);
  res.json({ pharmacy: pharmacyProfile(p), stock, complaints, imports, orderStats });
});

r.post('/pharmacies/:id/decision', (req, res) => {
  const v = validate(req.body, { action: { required: true, enum: ['approve', 'reject', 'suspend', 'reinstate'] }, reason: { max: 500 } });
  const p = db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(Number(req.params.id));
  if (!p) throw notFound('Pharmacy not found');
  if ((v.action === 'reject' || v.action === 'suspend') && !v.reason) throw bad('Give a reason so the pharmacy knows what to fix');
  const status = { approve: 'approved', reject: 'rejected', suspend: 'suspended', reinstate: 'approved' }[v.action];
  db.prepare(`UPDATE pharmacies SET approval_status = ?, rejection_reason = ?, approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END WHERE id = ?`)
    .run(status, v.reason ?? null, status, p.id);
  const msg = {
    approve: ['Your pharmacy is approved 🎉', 'Your listing is now live. Patients can find your stock and place orders.'],
    reinstate: ['Your listing is active again', 'MedFinder has reinstated your pharmacy listing.'],
    reject: ['Registration not approved', `Reason: ${v.reason}. Update your details and we'll review again.`],
    suspend: ['Listing suspended', `Your pharmacy is hidden from patients. Reason: ${v.reason}`],
  }[v.action];
  notify('pharmacy', p.id, 'approval', msg[0], msg[1]);
  audit(req, `pharmacy.${v.action}`, `pharmacy:${p.id}`, { reason: v.reason });
  res.json({ pharmacy: pharmacyProfile(db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(p.id)) });
});

r.post('/pharmacies/:id/subscription', (req, res) => {
  const v = validate(req.body, { status: { required: true, enum: ['trial', 'active', 'expired'] }, extendDays: { type: 'number', min: 0, max: 3650, int: true } });
  const p = db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(Number(req.params.id));
  if (!p) throw notFound('Pharmacy not found');
  if (v.extendDays) {
    db.prepare(`UPDATE pharmacies SET subscription_expires_at = datetime(CASE WHEN subscription_expires_at > datetime('now') THEN subscription_expires_at ELSE 'now' END, ?) WHERE id = ?`)
      .run(`+${v.extendDays} days`, p.id);
  }
  db.prepare('UPDATE pharmacies SET subscription_status = ? WHERE id = ?').run(v.status, p.id);
  audit(req, 'pharmacy.subscription', `pharmacy:${p.id}`, v);
  res.json({ pharmacy: pharmacyProfile(db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(p.id)) });
});

// ---------- Patients ----------
r.get('/patients', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.patient_id = p.id) AS orders_count FROM patients p
                           WHERE (? = '' OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.phone LIKE ?) ORDER BY p.id DESC LIMIT 300`)
    .all(q, `%${q}%`, `%${q}%`, `%${q}%`);
  res.json({ patients: rows.map((p) => ({ ...patientProfile(p), status: p.status, ordersCount: p.orders_count, lastLoginAt: p.last_login_at })) });
});

r.post('/patients/:id/status', (req, res) => {
  const v = validate(req.body, { status: { required: true, enum: ['active', 'suspended'] } });
  const out = db.prepare('UPDATE patients SET status = ? WHERE id = ?').run(v.status, Number(req.params.id));
  if (!out.changes) throw notFound('Patient not found');
  audit(req, `patient.${v.status}`, `patient:${req.params.id}`);
  res.json({ ok: true });
});

// ---------- Orders ----------
r.get('/orders', (req, res) => {
  const status = String(req.query.status || '');
  const rows = status
    ? db.prepare('SELECT id FROM orders WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 200').all();
  res.json({ orders: rows.map((o) => serializeOrder(loadOrder(o.id))) });
});

// ---------- Complaints ----------
r.get('/complaints', (req, res) => {
  const status = String(req.query.status || '');
  const rows = db.prepare(`
    SELECT c.*, ph.name AS pharmacy_name, ph.approval_status, pt.first_name, pt.last_name, pt.phone AS patient_phone, o.code AS order_code
    FROM complaints c LEFT JOIN pharmacies ph ON ph.id = c.pharmacy_id LEFT JOIN patients pt ON pt.id = c.patient_id LEFT JOIN orders o ON o.id = c.order_id
    WHERE (? = '' OR c.status = ?) ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 ELSE 2 END, c.id DESC`).all(status, status);
  res.json({
    complaints: rows.map((c) => ({
      id: c.id, subject: c.subject, details: c.details, status: c.status, adminNote: c.admin_note, createdAt: c.created_at, resolvedAt: c.resolved_at,
      pharmacy: c.pharmacy_id ? { id: c.pharmacy_id, name: c.pharmacy_name, approvalStatus: c.approval_status } : null,
      patient: c.patient_id ? { id: c.patient_id, name: `${c.first_name} ${c.last_name}`, phone: c.patient_phone } : null,
      orderCode: c.order_code,
    })),
  });
});

r.patch('/complaints/:id', (req, res) => {
  const v = validate(req.body, { status: { enum: ['open', 'investigating', 'resolved'] }, adminNote: { max: 2000 } });
  const c = db.prepare('SELECT * FROM complaints WHERE id = ?').get(Number(req.params.id));
  if (!c) throw notFound('Complaint not found');
  db.prepare(`UPDATE complaints SET status = COALESCE(?, status), admin_note = COALESCE(?, admin_note), resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE resolved_at END WHERE id = ?`)
    .run(v.status ?? null, v.adminNote ?? null, v.status ?? null, c.id);
  if (v.status === 'resolved' && c.patient_id) {
    notify('patient', c.patient_id, 'complaint', 'Your report has been resolved', v.adminNote || 'Thanks for helping keep MedFinder accurate.');
  }
  if (req.body.warnPharmacy && c.pharmacy_id) {
    notify('pharmacy', c.pharmacy_id, 'warning', 'Message from MedFinder', v.adminNote || `A patient reported: ${c.subject}. Please keep your stock list up to date.`);
  }
  audit(req, 'complaint.update', `complaint:${c.id}`, v);
  res.json({ ok: true });
});

// ---------- Feature flags (control both apps) ----------
r.get('/features', (_req, res) => {
  res.json({ features: db.prepare('SELECT key, label, description, audience, enabled, updated_at AS updatedAt FROM feature_flags ORDER BY audience, label').all().map((f) => ({ ...f, enabled: !!f.enabled })) });
});
r.patch('/features/:key', (req, res) => {
  const v = validate(req.body, { enabled: { type: 'boolean' }, label: { max: 80 }, description: { max: 300 }, audience: { enum: ['patient', 'pharmacy', 'all'] } });
  const out = db.prepare(`UPDATE feature_flags SET enabled = COALESCE(?, enabled), label = COALESCE(?, label), description = COALESCE(?, description), audience = COALESCE(?, audience), updated_at = datetime('now') WHERE key = ?`)
    .run(v.enabled === undefined ? null : v.enabled ? 1 : 0, v.label ?? null, v.description ?? null, v.audience ?? null, req.params.key);
  if (!out.changes) throw notFound('Feature not found');
  audit(req, 'feature.update', req.params.key, v);
  res.json({ ok: true });
});
r.post('/features', (req, res) => {
  const v = validate(req.body, {
    key: { required: true, pattern: /^[a-z0-9_]{2,40}$/, message: 'use lowercase letters, numbers and _' },
    label: { required: true, max: 80 }, description: { max: 300 },
    audience: { enum: ['patient', 'pharmacy', 'all'], default: 'all' }, enabled: { type: 'boolean', default: false },
  });
  if (db.prepare('SELECT key FROM feature_flags WHERE key = ?').get(v.key)) throw new HttpError(409, 'A feature with this key already exists');
  db.prepare('INSERT INTO feature_flags (key, label, description, audience, enabled) VALUES (?, ?, ?, ?, ?)').run(v.key, v.label, v.description ?? null, v.audience, v.enabled ? 1 : 0);
  audit(req, 'feature.create', v.key, v);
  res.status(201).json({ ok: true });
});

// ---------- Announcements ----------
r.get('/announcements', (_req, res) => {
  res.json({ announcements: db.prepare('SELECT id, title, body, audience, active, created_at AS createdAt FROM announcements ORDER BY id DESC').all().map((a) => ({ ...a, active: !!a.active })) });
});
r.post('/announcements', (req, res) => {
  const v = validate(req.body, { title: { required: true, max: 120 }, body: { required: true, max: 1000 }, audience: { enum: ['patient', 'pharmacy', 'all'], default: 'all' } });
  const id = Number(db.prepare('INSERT INTO announcements (title, body, audience) VALUES (?, ?, ?)').run(v.title, v.body, v.audience).lastInsertRowid);
  // Also drop it in pharmacy inboxes so they see it on the dashboard.
  if (v.audience !== 'patient') {
    for (const p of db.prepare(`SELECT id FROM pharmacies WHERE approval_status = 'approved'`).all()) notify('pharmacy', p.id, 'announcement', v.title, v.body);
  }
  audit(req, 'announcement.create', `announcement:${id}`, v);
  res.status(201).json({ id });
});
r.patch('/announcements/:id', (req, res) => {
  const v = validate(req.body, { active: { type: 'boolean' } });
  db.prepare('UPDATE announcements SET active = ? WHERE id = ?').run(v.active ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});
r.delete('/announcements/:id', (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Settings ----------
r.get('/settings', (_req, res) => {
  res.json({ settings: Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((s) => [s.key, s.value])) });
});
r.patch('/settings', (req, res) => {
  const allowed = ['subscription_price_ghs', 'trial_days', 'support_phone', 'min_app_version'];
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, val] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if (['subscription_price_ghs', 'trial_days'].includes(k) && !(Number(val) >= 0)) throw bad(`${k} must be a number`);
    up.run(k, String(val));
  }
  audit(req, 'settings.update', null, req.body);
  res.json({ ok: true });
});

// ---------- Medicine catalogue ----------
r.get('/medicines', (req, res) => {
  const q = String(req.query.q || '').trim();
  res.json({ medicines: db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM inventory i WHERE i.medicine_id = m.id) AS listings FROM medicines m WHERE (? = '' OR m.name LIKE ?) ORDER BY m.name LIMIT 500`).all(q, `%${q}%`)
    .map((m) => ({ id: m.id, name: m.name, strength: m.strength, form: m.form, category: m.category, requiresPrescription: !!m.requires_prescription, description: m.description, listings: m.listings })) });
});
r.patch('/medicines/:id', (req, res) => {
  const v = validate(req.body, { name: { max: 120 }, strength: { max: 60 }, form: { max: 60 }, category: { max: 60 }, description: { max: 1000 }, requiresPrescription: { type: 'boolean' } });
  db.prepare(`UPDATE medicines SET name = COALESCE(?, name), strength = COALESCE(?, strength), form = COALESCE(?, form), category = COALESCE(?, category), description = COALESCE(?, description),
              requires_prescription = COALESCE(?, requires_prescription) WHERE id = ?`)
    .run(v.name ?? null, v.strength ?? null, v.form ?? null, v.category ?? null, v.description ?? null, v.requiresPrescription === undefined ? null : v.requiresPrescription ? 1 : 0, Number(req.params.id));
  audit(req, 'medicine.update', `medicine:${req.params.id}`, v);
  res.json({ ok: true });
});

// ---------- Admin users & audit ----------
r.get('/admins', (_req, res) => res.json({ admins: db.prepare('SELECT id, name, email, created_at AS createdAt FROM admins').all() }));
r.post('/admins', async (req, res) => {
  const v = validate(req.body, { name: { required: true, max: 80 }, email: { required: true, pattern: EMAIL_RE, message: 'must be a valid email' }, password: { required: true, min: 8 } });
  if (db.prepare('SELECT id FROM admins WHERE email = ?').get(v.email.toLowerCase())) throw new HttpError(409, 'Admin already exists');
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)').run(v.name, v.email.toLowerCase(), await hashPassword(v.password));
  audit(req, 'admin.create', v.email);
  res.status(201).json({ ok: true });
});
r.post('/me/password', async (req, res) => {
  const v = validate(req.body, { currentPassword: { required: true }, newPassword: { required: true, min: 8 } });
  const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.user.id);
  if (!(await checkPassword(v.currentPassword, a.password_hash))) throw bad('Current password is incorrect');
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(await hashPassword(v.newPassword), a.id);
  res.json({ ok: true });
});
r.get('/audit', (_req, res) => {
  res.json({ entries: db.prepare(`SELECT l.id, l.action, l.target, l.details, l.created_at AS createdAt, a.name AS admin FROM audit_log l LEFT JOIN admins a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 200`).all() });
});
r.get('/notifications', (req, res) => {
  const list = db.prepare(`SELECT id, type, title, body, data, read, created_at AS createdAt FROM notifications WHERE recipient_type = 'admin' AND recipient_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  res.json({ unread: list.filter((n) => !n.read).length, notifications: list.map((n) => ({ ...n, read: !!n.read, data: n.data ? JSON.parse(n.data) : null })) });
});
r.post('/notifications/read', (req, res) => {
  db.prepare(`UPDATE notifications SET read = 1 WHERE recipient_type = 'admin' AND recipient_id = ?`).run(req.user.id);
  res.json({ ok: true });
});

export default r;
