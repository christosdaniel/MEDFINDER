// Public endpoints used by the patient app (and anyone browsing):
// app config, home feed, medicine search, pharmacy directory.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db, getSetting } from '../db.js';
import { config } from '../config.js';
import { distanceKm, notFound } from '../lib/http.js';

const r = Router();

// Only pharmacies that are approved and whose subscription hasn't lapsed are shown to patients.
export const VISIBLE = `p.approval_status = 'approved' AND p.subscription_status != 'expired'`;

function coords(req) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null;
}

/** Decode an optional patient token without failing the request. */
function optionalPatient(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(h.slice(7), config.jwtSecret);
    return p.role === 'patient' ? Number(p.sub) : null;
  } catch { return null; }
}

export function stockLabel(qty, threshold = 10) {
  if (qty <= 0) return 'Out of stock';
  if (qty <= threshold) return 'Low stock';
  return 'Available';
}

export function publicPharmacy(p, here) {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    area: p.area,
    city: p.city,
    region: p.region,
    phone: p.phone,
    whatsapp: p.whatsapp,
    lat: p.lat,
    lng: p.lng,
    bio: p.bio,
    openingHours: p.opening_hours,
    offersDelivery: !!p.offers_delivery,
    deliveryFee: p.delivery_fee,
    distanceKm: here ? distanceKm(here.lat, here.lng, p.lat, p.lng) : null,
  };
}

const sortByDistance = (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);

r.get('/config', (req, res) => {
  const app = ['patient', 'pharmacy', 'admin'].includes(req.query.app) ? req.query.app : 'patient';
  const flags = db.prepare(`SELECT key, enabled FROM feature_flags WHERE audience IN ('all', ?)`).all(app);
  const announcements = db.prepare(
    `SELECT id, title, body, created_at AS createdAt FROM announcements WHERE active = 1 AND audience IN ('all', ?) ORDER BY id DESC LIMIT 5`
  ).all(app);
  res.json({
    features: Object.fromEntries(flags.map((f) => [f.key, !!f.enabled])),
    announcements,
    settings: {
      supportPhone: getSetting('support_phone'),
      minAppVersion: getSetting('min_app_version'),
      subscriptionPriceGhs: Number(getSetting('subscription_price_ghs')),
    },
  });
});

/** Home feed: nearby pharmacies, popular medicines and prices near you. */
r.get('/home', (req, res) => {
  const here = coords(req);
  const pharmacies = db.prepare(`SELECT p.* FROM pharmacies p WHERE ${VISIBLE}`).all()
    .map((p) => publicPharmacy(p, here)).sort(sortByDistance);
  const nearby = pharmacies.slice(0, 8);
  const nearbyIds = new Set(nearby.map((p) => p.id));

  const popular = db.prepare(`
    SELECT m.id, m.name, m.strength, m.form, m.category,
           COUNT(CASE WHEN i.quantity > 0 THEN 1 END) AS pharmacies,
           MIN(CASE WHEN i.quantity > 0 THEN i.price END) AS minPrice,
           (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.medicine_id = m.id) AS sold
    FROM medicines m
    JOIN inventory i ON i.medicine_id = m.id
    JOIN pharmacies p ON p.id = i.pharmacy_id AND ${VISIBLE}
    GROUP BY m.id ORDER BY sold DESC, pharmacies DESC, m.name LIMIT 10
  `).all();

  // Medicine + price cards from nearby pharmacies first, then others.
  const offers = db.prepare(`
    SELECT i.id AS inventoryId, i.price, i.quantity, i.low_stock_threshold AS threshold,
           m.id AS medicineId, m.name, m.strength, m.form, p.*
    FROM inventory i JOIN medicines m ON m.id = i.medicine_id
    JOIN pharmacies p ON p.id = i.pharmacy_id AND ${VISIBLE}
    WHERE i.quantity > 0 ORDER BY i.updated_at DESC LIMIT 200
  `).all().map((o) => ({
    inventoryId: o.inventoryId,
    medicine: { id: o.medicineId, name: o.name, strength: o.strength, form: o.form },
    price: o.price,
    stock: stockLabel(o.quantity, o.threshold),
    pharmacy: publicPharmacy(o, here),
  }));
  offers.sort((a, b) => (nearbyIds.has(b.pharmacy.id) - nearbyIds.has(a.pharmacy.id)) || sortByDistance(a.pharmacy, b.pharmacy));

  const seen = new Set();
  const nearbyOffers = [];
  for (const o of offers) {
    if (seen.has(o.medicine.id)) continue; // one card per medicine, closest pharmacy first
    seen.add(o.medicine.id);
    nearbyOffers.push(o);
    if (nearbyOffers.length >= 12) break;
  }

  res.json({
    nearbyPharmacies: nearby,
    otherPharmacies: pharmacies.slice(8, 20),
    popularMedicines: popular,
    offers: nearbyOffers,
  });
});

/** Search medicines by name. Returns availability summary per medicine. */
r.get('/medicines/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const results = db.prepare(`
    SELECT m.id, m.name, m.strength, m.form, m.category, m.requires_prescription AS requiresPrescription,
           COUNT(DISTINCT CASE WHEN i.quantity > 0 AND ${VISIBLE} THEN p.id END) AS pharmacies,
           MIN(CASE WHEN i.quantity > 0 AND ${VISIBLE} THEN i.price END) AS minPrice
    FROM medicines m
    LEFT JOIN inventory i ON i.medicine_id = m.id
    LEFT JOIN pharmacies p ON p.id = i.pharmacy_id
    WHERE m.name LIKE ? OR m.category LIKE ? OR (m.name || ' ' || m.strength) LIKE ?
    GROUP BY m.id
    ORDER BY (m.name LIKE ?) DESC, pharmacies DESC, m.name
    LIMIT 40
  `).all(like, like, like, `${q.replace(/[%_]/g, '')}%`);

  const patientId = optionalPatient(req);
  if (patientId) {
    db.prepare('DELETE FROM recent_searches WHERE patient_id = ? AND query = ? COLLATE NOCASE').run(patientId, q);
    db.prepare('INSERT INTO recent_searches (patient_id, query) VALUES (?, ?)').run(patientId, q);
  }
  res.json({ results: results.map((m) => ({ ...m, requiresPrescription: !!m.requiresPrescription })) });
});

/** Which pharmacies stock a medicine, with price, stock level and distance. */
r.get('/medicines/:id/pharmacies', (req, res) => {
  const here = coords(req);
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id);
  if (!med) throw notFound('Medicine not found');
  const rows = db.prepare(`
    SELECT i.id AS inventoryId, i.price, i.quantity, i.low_stock_threshold AS threshold, i.updated_at AS stockUpdatedAt, p.*
    FROM inventory i JOIN pharmacies p ON p.id = i.pharmacy_id
    WHERE i.medicine_id = ? AND ${VISIBLE}
  `).all(med.id);
  let list = rows.map((x) => ({
    inventoryId: x.inventoryId,
    price: x.price,
    quantity: x.quantity,
    stock: stockLabel(x.quantity, x.threshold),
    stockUpdatedAt: x.stockUpdatedAt,
    pharmacy: publicPharmacy(x, here),
  }));
  const sort = req.query.sort === 'price' ? 'price' : 'distance';
  list.sort((a, b) => (b.quantity > 0) - (a.quantity > 0) ||
    (sort === 'price' ? a.price - b.price : sortByDistance(a.pharmacy, b.pharmacy)));
  const inStock = list.filter((l) => l.quantity > 0);
  res.json({
    medicine: { id: med.id, name: med.name, strength: med.strength, form: med.form, category: med.category, description: med.description, requiresPrescription: !!med.requires_prescription },
    available: inStock.length > 0,
    cheapest: inStock.length ? Math.min(...inStock.map((l) => l.price)) : null,
    pharmacies: list.map(({ quantity, ...rest }) => rest),
  });
});

/** Pharmacy directory / search by name or area. */
r.get('/pharmacies', (req, res) => {
  const here = coords(req);
  const q = String(req.query.q || '').trim();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = q
    ? db.prepare(`SELECT p.* FROM pharmacies p WHERE ${VISIBLE} AND (p.name LIKE ? OR p.area LIKE ? OR p.city LIKE ? OR p.address LIKE ?)`).all(like, like, like, like)
    : db.prepare(`SELECT p.* FROM pharmacies p WHERE ${VISIBLE}`).all();
  let list = rows.map((p) => publicPharmacy(p, here));
  if (req.query.delivery === 'true') list = list.filter((p) => p.offersDelivery);
  list.sort(sortByDistance);
  res.json({ pharmacies: list });
});

/** Full pharmacy profile with its stock and prices. */
r.get('/pharmacies/:id', (req, res) => {
  const here = coords(req);
  const p = db.prepare(`SELECT p.* FROM pharmacies p WHERE p.id = ? AND ${VISIBLE}`).get(req.params.id);
  if (!p) throw notFound('Pharmacy not found');
  const q = String(req.query.q || '').trim();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const stock = db.prepare(`
    SELECT i.id AS inventoryId, i.price, i.quantity, i.low_stock_threshold AS threshold, i.updated_at AS updatedAt,
           m.id AS medicineId, m.name, m.strength, m.form, m.category, m.requires_prescription AS rx
    FROM inventory i JOIN medicines m ON m.id = i.medicine_id
    WHERE i.pharmacy_id = ? AND (? = '' OR m.name LIKE ?)
    ORDER BY (i.quantity > 0) DESC, m.name
  `).all(p.id, q, like).map((s) => ({
    inventoryId: s.inventoryId,
    medicine: { id: s.medicineId, name: s.name, strength: s.strength, form: s.form, category: s.category, requiresPrescription: !!s.rx },
    price: s.price,
    stock: stockLabel(s.quantity, s.threshold),
    updatedAt: s.updatedAt,
  }));
  const ratingRow = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE pharmacy_id = ? AND status = 'completed'`).get(p.id);
  res.json({ pharmacy: { ...publicPharmacy(p, here), completedOrders: ratingRow.n, lastStockUpdate: p.last_sync_at }, stock });
});

export default r;
