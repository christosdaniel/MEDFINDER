import { db } from '../db.js';

/** Store an in-app notification (apps poll /notifications). */
export async function notify(recipientType, recipientId, type, title, body, data) {
  await db.run(
    `INSERT INTO notifications (recipient_type, recipient_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)`,
    recipientType, recipientId, type, title, body, data ? JSON.stringify(data) : null,
  );
  // Hook for real push notifications (Expo push / FCM) can be added here using patients.push_token.
}

/** After stock changes, tell patients waiting on a restock alert. */
export async function fireRestockAlerts(medicineIds) {
  if (!medicineIds?.length) return 0;
  // Only medicines someone is actually waiting for (one query, then a few).
  const wanted = await db.all('SELECT DISTINCT medicine_id FROM restock_alerts WHERE notified_at IS NULL AND medicine_id = ANY(?::int[])', [...new Set(medicineIds)]);
  let n = 0;
  for (const { medicine_id: mid } of wanted) {
    const waiting = await db.all(`
      SELECT ra.id, ra.patient_id, m.name, m.strength, m.id AS medicine_id
      FROM restock_alerts ra JOIN medicines m ON m.id = ra.medicine_id
      WHERE ra.notified_at IS NULL AND ra.medicine_id = ?
        AND EXISTS (SELECT 1 FROM inventory i JOIN pharmacies p ON p.id = i.pharmacy_id
                    WHERE i.medicine_id = ra.medicine_id AND i.quantity > 0 AND p.approval_status = 'approved')`, mid);
    for (const r of waiting) {
      await notify('patient', r.patient_id, 'restock', `${r.name} is back in stock`,
        `${r.name} ${r.strength} is now available at a pharmacy near you.`, { medicineId: r.medicine_id });
      await db.run('UPDATE restock_alerts SET notified_at = now() WHERE id = ?', r.id);
      n++;
    }
  }
  return n;
}

/** Tell a pharmacy about items that fell under their low-stock threshold. */
export async function lowStockCheck(pharmacyId, medicineIds) {
  if (!medicineIds?.length) return;
  const low = await db.all(`SELECT m.name, m.strength, i.quantity FROM inventory i JOIN medicines m ON m.id = i.medicine_id
                            WHERE i.pharmacy_id = ? AND i.medicine_id = ANY(?::int[]) AND i.quantity <= i.low_stock_threshold
                            ORDER BY i.quantity`, pharmacyId, [...new Set(medicineIds)]);
  if (!low.length) return;
  const list = low.slice(0, 5).map((l) => `${l.name} ${l.strength} (${l.quantity} left)`).join(', ');
  await notify('pharmacy', pharmacyId, 'low_stock', 'Low stock', `Running low: ${list}${low.length > 5 ? '…' : ''}`);
}
