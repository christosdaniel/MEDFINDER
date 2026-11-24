import { db } from '../db.js';

/** Store an in-app notification (apps poll /notifications). */
export function notify(recipientType, recipientId, type, title, body, data) {
  db.prepare(
    `INSERT INTO notifications (recipient_type, recipient_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(recipientType, recipientId, type, title, body, data ? JSON.stringify(data) : null);
  // Hook for real push notifications (Expo push / FCM) can be added here using patients.push_token.
}

/** After stock changes, tell patients waiting on a restock alert. */
export function fireRestockAlerts(medicineIds) {
  if (!medicineIds?.length) return 0;
  const waiting = db.prepare(`
    SELECT ra.id, ra.patient_id, m.name, m.strength, m.id AS medicine_id
    FROM restock_alerts ra JOIN medicines m ON m.id = ra.medicine_id
    WHERE ra.notified_at IS NULL AND ra.medicine_id = ?
      AND EXISTS (SELECT 1 FROM inventory i JOIN pharmacies p ON p.id = i.pharmacy_id
                  WHERE i.medicine_id = ra.medicine_id AND i.quantity > 0 AND p.approval_status = 'approved')
  `);
  const mark = db.prepare(`UPDATE restock_alerts SET notified_at = datetime('now') WHERE id = ?`);
  let n = 0;
  for (const mid of new Set(medicineIds)) {
    for (const r of waiting.all(mid)) {
      notify('patient', r.patient_id, 'restock', `${r.name} is back in stock`,
        `${r.name} ${r.strength} is now available at a pharmacy near you.`, { medicineId: r.medicine_id });
      mark.run(r.id);
      n++;
    }
  }
  return n;
}

/** Tell a pharmacy about items that fell under their low-stock threshold. */
export function lowStockCheck(pharmacyId, medicineIds) {
  if (!medicineIds?.length) return;
  const q = db.prepare(`SELECT m.name, m.strength, i.quantity FROM inventory i JOIN medicines m ON m.id = i.medicine_id
                        WHERE i.pharmacy_id = ? AND i.medicine_id = ? AND i.quantity <= i.low_stock_threshold`);
  const low = medicineIds.map((id) => q.get(pharmacyId, id)).filter(Boolean);
  if (!low.length) return;
  const list = low.slice(0, 5).map((l) => `${l.name} ${l.strength} (${l.quantity} left)`).join(', ');
  notify('pharmacy', pharmacyId, 'low_stock', 'Low stock', `Running low: ${list}${low.length > 5 ? '…' : ''}`);
}
