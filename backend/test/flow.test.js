// End-to-end flow test matching the activity diagram:
// pharmacy signs up → admin approves → pharmacy publishes stock (Excel / CSV)
// → patient signs up + OTP → searches → orders → pharmacy updates status → patient tracks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medfinder-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.ADMIN_EMAIL = 'admin@test.gh';
process.env.ADMIN_PASSWORD = 'Admin@12345';

const { createApp } = await import('../src/app.js');
const { ensureAdmin } = await import('../src/seed.js');

let server, base;
before(async () => {
  await ensureAdmin();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, { token, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

const S = {};

test('pharmacy registers and is pending', async () => {
  const r = await call('POST', '/pharmacy/auth/register', { body: {
    name: 'Test Pharmacy', ownerName: 'Kojo', email: 'TEST@ph.gh', phone: '0201112222', password: 'secret123',
    licenseNumber: 'PC/1', address: '1 Ring Road', area: 'Osu', lat: 5.556, lng: -0.18, offersDelivery: true, deliveryFee: 10,
  } });
  assert.equal(r.status, 201, r.error);
  assert.equal(r.pharmacy.approvalStatus, 'pending');
  assert.equal(r.pharmacy.phone, '+233201112222');
  S.ph = r.token;
  S.phId = r.pharmacy.id;
});

test('pharmacy imports stock from Excel and CSV', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Stock');
  ws.addRow(['Drug Name', 'Selling Price', 'Qty on hand', 'Reorder level']);
  ws.addRow(['Paracetamol 500mg', 9.5, 100, 20]);
  ws.addRow(['Coartem 20/120mg', 38, 3, 5]);
  ws.addRow(['', '', '', '']);
  ws.addRow(['Bad Row', 'abc', 1, 1]);
  const buf = await wb.xlsx.writeBuffer();

  const preview = new FormData();
  preview.append('file', new Blob([buf]), 'stock.xlsx');
  preview.append('dryRun', 'true');
  const p = await call('POST', '/pharmacy/inventory/import', { token: S.ph, form: preview });
  assert.equal(p.status, 200, p.error);
  assert.equal(p.mapping.name, 'Drug Name');
  assert.equal(p.mapping.price, 'Selling Price');
  assert.equal(p.mapping.quantity, 'Qty on hand');
  assert.equal(p.validRows, 2);
  assert.equal(p.items[0].strength, '500mg');
  assert.equal(p.errors.length, 1);

  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'stock.xlsx');
  const r = await call('POST', '/pharmacy/inventory/import', { token: S.ph, form: fd });
  assert.equal(r.status, 200, r.error);
  assert.equal(r.created, 2);

  const csv = new FormData();
  csv.append('file', new Blob(['Medicine,Strength,Price,Quantity\nParacetamol,500mg,10,80\nAmoxicillin,500mg,24,40\n']), 'stock.csv');
  const c = await call('POST', '/pharmacy/inventory/import', { token: S.ph, form: csv });
  assert.equal(c.status, 200, c.error);
  assert.equal(c.updated, 1);
  assert.equal(c.created, 1);

  const inv = await call('GET', '/pharmacy/inventory', { token: S.ph });
  assert.equal(inv.items.length, 3);
  assert.equal(inv.items.find((i) => i.name === 'Paracetamol').price, 10);
});

test('pending pharmacy is hidden from patients', async () => {
  const r = await call('GET', '/medicines/search?q=para');
  assert.equal(r.results[0].pharmacies, 0);
});

test('admin approves the pharmacy', async () => {
  const login = await call('POST', '/admin/auth/login', { body: { email: 'admin@test.gh', password: 'Admin@12345' } });
  assert.equal(login.status, 200, login.error);
  S.admin = login.token;
  const list = await call('GET', '/admin/pharmacies?status=pending', { token: S.admin });
  assert.equal(list.pharmacies.length, 1);
  const noReason = await call('POST', `/admin/pharmacies/${S.phId}/decision`, { token: S.admin, body: { action: 'reject' } });
  assert.equal(noReason.status, 400);
  const ok = await call('POST', `/admin/pharmacies/${S.phId}/decision`, { token: S.admin, body: { action: 'approve' } });
  assert.equal(ok.pharmacy.approvalStatus, 'approved');
  const notes = await call('GET', '/pharmacy/notifications', { token: S.ph });
  assert.ok(notes.notifications.some((n) => n.type === 'approval'));
});

test('patient signs up with OTP and is remembered', async () => {
  const reg = await call('POST', '/patient/auth/register', { body: { firstName: 'Ama', lastName: 'Mensah', phone: '024 123 4567', password: 'pass123' } });
  assert.equal(reg.status, 201, reg.error);
  assert.equal(reg.phone, '+233241234567');
  assert.match(reg.devOtp, /^\d{6}$/);
  const wrong = await call('POST', '/patient/auth/verify-otp', { body: { phone: reg.phone, code: '000000' === reg.devOtp ? '111111' : '000000' } });
  assert.equal(wrong.status, 400);
  const v = await call('POST', '/patient/auth/verify-otp', { body: { phone: reg.phone, code: reg.devOtp } });
  assert.equal(v.status, 200, v.error);
  S.pt = v.token;
  const me = await call('GET', '/patient/me', { token: S.pt });
  assert.equal(me.patient.firstName, 'Ama');
  const login = await call('POST', '/patient/auth/login', { body: { phone: '0241234567', password: 'pass123' } });
  assert.ok(login.token);
  const dup = await call('POST', '/patient/auth/register', { body: { firstName: 'A', lastName: 'B', phone: '0241234567', password: 'pass123' } });
  assert.equal(dup.status, 409);
});

test('patient searches, compares and orders; pharmacy fulfils', async () => {
  const s = await call('GET', '/medicines/search?q=para&lat=5.55&lng=-0.18', { token: S.pt });
  const para = s.results[0];
  assert.equal(para.pharmacies, 1);
  const list = await call('GET', `/medicines/${para.id}/pharmacies?lat=5.55&lng=-0.18`);
  assert.equal(list.pharmacies[0].pharmacy.name, 'Test Pharmacy');
  assert.ok(list.pharmacies[0].pharmacy.distanceKm < 2);
  const recent = await call('GET', '/patient/recent-searches', { token: S.pt });
  assert.deepEqual(recent.searches, ['para']);

  const tooMany = await call('POST', '/patient/orders', { token: S.pt, body: { pharmacyId: S.phId, method: 'pickup', items: [{ medicineId: para.id, quantity: 99 }] } });
  assert.equal(tooMany.status, 400);
  const noAddr = await call('POST', '/patient/orders', { token: S.pt, body: { pharmacyId: S.phId, method: 'delivery', items: [{ medicineId: para.id, quantity: 2 }] } });
  assert.equal(noAddr.status, 400);

  const o = await call('POST', '/patient/orders', { token: S.pt, body: { pharmacyId: S.phId, method: 'delivery', deliveryAddress: 'Osu Badu St', items: [{ medicineId: para.id, quantity: 2 }] } });
  assert.equal(o.status, 201, o.error);
  assert.equal(o.order.total, 30);
  S.order = o.order.id;

  const pend = await call('GET', '/pharmacy/orders?status=pending', { token: S.ph });
  assert.equal(pend.orders.length, 1);
  assert.equal(pend.orders[0].patient.phone, '+233241234567');

  const skip = await call('POST', `/pharmacy/orders/${S.order}/status`, { token: S.ph, body: { status: 'completed' } });
  assert.equal(skip.status, 400);
  for (const st of ['accepted', 'preparing', 'out_for_delivery', 'completed']) {
    const r = await call('POST', `/pharmacy/orders/${S.order}/status`, { token: S.ph, body: { status: st } });
    assert.equal(r.status, 200, r.error);
  }
  const inv = await call('GET', '/pharmacy/inventory?q=Paracetamol', { token: S.ph });
  assert.equal(inv.items[0].quantity, 78);

  const tracked = await call('GET', `/patient/orders/${S.order}`, { token: S.pt });
  assert.equal(tracked.order.status, 'completed');
  assert.equal(tracked.order.timeline.length, 5);
  const notes = await call('GET', '/patient/notifications', { token: S.pt });
  assert.ok(notes.notifications.some((n) => n.title.includes('on the way')));
});

test('restock alert fires when stock returns', async () => {
  const s = await call('GET', '/medicines/search?q=amox');
  const amox = s.results[0];
  const inv = await call('GET', '/pharmacy/inventory?q=Amox', { token: S.ph });
  await call('PATCH', `/pharmacy/inventory/${inv.items[0].id}`, { token: S.ph, body: { quantity: 0 } });
  const a = await call('POST', '/patient/restock-alerts', { token: S.pt, body: { medicineId: amox.id } });
  assert.equal(a.status, 201);
  await call('PATCH', `/pharmacy/inventory/${inv.items[0].id}`, { token: S.ph, body: { quantity: 15 } });
  const notes = await call('GET', '/patient/notifications', { token: S.pt });
  assert.ok(notes.notifications.some((n) => n.type === 'restock'));
});

test('sync agent endpoint accepts a stock file with the sync key', async () => {
  const key = (await call('GET', '/pharmacy/sync-key', { token: S.ph })).syncKey;
  const bad = await call('GET', '/sync/ping', { headers: { 'X-Sync-Key': 'nope' } });
  assert.equal(bad.status, 401);
  const fd = new FormData();
  fd.append('file', new Blob(['Product,Price,Stock\nVitamin C 1000mg,35,50\n']), 'export.csv');
  const r = await call('POST', '/sync/stock', { form: fd, headers: { 'X-Sync-Key': key } });
  assert.equal(r.status, 200, r.error);
  assert.equal(r.created, 1);
});

test('admin feature flags reach the apps', async () => {
  await call('PATCH', '/admin/features/delivery', { token: S.admin, body: { enabled: false } });
  const cfg = await call('GET', '/config?app=patient');
  assert.equal(cfg.features.delivery, false);
  const s = await call('GET', '/medicines/search?q=para');
  const o = await call('POST', '/patient/orders', { token: S.pt, body: { pharmacyId: S.phId, method: 'delivery', deliveryAddress: 'x', items: [{ medicineId: s.results[0].id, quantity: 1 }] } });
  assert.equal(o.status, 400);
  await call('PATCH', '/admin/features/delivery', { token: S.admin, body: { enabled: true } });
});

test('complaints flow to admin', async () => {
  const c = await call('POST', '/patient/complaints', { token: S.pt, body: { pharmacyId: S.phId, subject: 'Wrong stock', details: 'Listed as available but was out.' } });
  assert.equal(c.status, 201, c.error);
  const list = await call('GET', '/admin/complaints', { token: S.admin });
  assert.equal(list.complaints[0].subject, 'Wrong stock');
  const u = await call('PATCH', `/admin/complaints/${c.id}`, { token: S.admin, body: { status: 'resolved', adminNote: 'Pharmacy warned' } });
  assert.equal(u.status, 200);
});

test('role separation is enforced', async () => {
  const r = await call('GET', '/admin/stats', { token: S.pt });
  assert.equal(r.status, 403);
  const r2 = await call('GET', '/pharmacy/orders', { token: S.pt });
  assert.equal(r2.status, 403);
});
