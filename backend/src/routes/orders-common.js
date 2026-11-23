import { db } from '../db.js';

export const ORDER_STATUS_TEXT = {
  pending: 'Waiting for pharmacy',
  accepted: 'Accepted',
  preparing: 'Being prepared',
  ready: 'Ready for pickup',
  out_for_delivery: 'On the way',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Declined by pharmacy',
};

/** Allowed next statuses for the pharmacy, by current status and method. */
export function nextStatuses(order) {
  switch (order.status) {
    case 'pending': return ['accepted', 'rejected'];
    case 'accepted': return ['preparing', order.method === 'delivery' ? 'out_for_delivery' : 'ready', 'cancelled'];
    case 'preparing': return [order.method === 'delivery' ? 'out_for_delivery' : 'ready', 'cancelled'];
    case 'ready': return ['completed'];
    case 'out_for_delivery': return ['completed'];
    default: return [];
  }
}

export function loadOrder(id) {
  const o = db.prepare(`
    SELECT o.*, p.name AS pharmacy_name, p.phone AS pharmacy_phone, p.address AS pharmacy_address, p.area AS pharmacy_area,
           p.lat AS pharmacy_lat, p.lng AS pharmacy_lng,
           pt.first_name, pt.last_name, pt.phone AS patient_phone, pt.email AS patient_email, pt.address AS patient_address
    FROM orders o JOIN pharmacies p ON p.id = o.pharmacy_id JOIN patients pt ON pt.id = o.patient_id
    WHERE o.id = ?`).get(id);
  if (!o) return null;
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  o.events = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(id);
  return o;
}

export function serializeOrder(o, { forPatient = false, forPharmacy = false } = {}) {
  const base = {
    id: o.id,
    code: o.code,
    status: o.status,
    statusText: ORDER_STATUS_TEXT[o.status] || o.status,
    method: o.method,
    deliveryAddress: o.delivery_address,
    deliveryLat: o.delivery_lat,
    deliveryLng: o.delivery_lng,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    subtotal: o.subtotal,
    deliveryFee: o.delivery_fee,
    total: o.total,
    note: o.note,
    pharmacyNote: o.pharmacy_note,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    items: o.items.map((i) => ({ medicineId: i.medicine_id, name: i.name, strength: i.strength, unitPrice: i.unit_price, quantity: i.quantity })),
    timeline: o.events.map((e) => ({ status: e.status, statusText: ORDER_STATUS_TEXT[e.status] || e.status, note: e.note, at: e.created_at })),
    pharmacy: { id: o.pharmacy_id, name: o.pharmacy_name, phone: o.pharmacy_phone, address: o.pharmacy_address, area: o.pharmacy_area, lat: o.pharmacy_lat, lng: o.pharmacy_lng },
  };
  if (forPatient) base.canCancel = ['pending', 'accepted'].includes(o.status);
  if (forPharmacy || !forPatient) {
    base.patient = { id: o.patient_id, name: `${o.first_name} ${o.last_name}`, phone: o.patient_phone, email: o.patient_email, address: o.patient_address };
    base.nextStatuses = nextStatuses(o);
  }
  return base;
}
