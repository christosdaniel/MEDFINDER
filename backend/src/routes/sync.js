// Endpoint used by the MedFinder Stock Sync agent (tools/stock-sync-agent),
// which runs on the pharmacy's computer and uploads their Excel / Access
// stock file whenever it changes. Authenticated with the pharmacy's sync key.
import { Router } from 'express';
import { db } from '../db.js';
import { bad, HttpError } from '../lib/http.js';
import { readStockFile, detectMapping, normaliseRows, applyStock } from '../lib/stockImport.js';
import { upload } from './pharmacy.js';

const r = Router();

function pharmacyFromKey(req) {
  const key = req.headers['x-sync-key'];
  if (!key) throw new HttpError(401, 'Missing X-Sync-Key header');
  const p = db.prepare('SELECT id, name, approval_status FROM pharmacies WHERE sync_key = ?').get(String(key));
  if (!p) throw new HttpError(401, 'Invalid sync key. Copy the key again from Stock → Link your database.');
  if (!db.prepare(`SELECT enabled FROM feature_flags WHERE key = 'sync_agent'`).get()?.enabled) throw new HttpError(503, 'Automatic sync is switched off by MedFinder right now');
  return p;
}

r.get('/ping', (req, res) => {
  const p = pharmacyFromKey(req);
  res.json({ ok: true, pharmacy: p.name, approvalStatus: p.approval_status });
});

r.post('/stock', upload.single('file'), async (req, res) => {
  const p = pharmacyFromKey(req);
  if (!req.file) throw bad('Attach the stock file as "file"');
  const parsed = await readStockFile(req.file.buffer, req.file.originalname, { table: req.body.table });
  let mapping = detectMapping(parsed.headers);
  if (req.body.mapping) {
    try { mapping = { ...mapping, ...JSON.parse(req.body.mapping) }; } catch { throw bad('Invalid mapping JSON'); }
  }
  const { items, errors } = normaliseRows(parsed.rows, mapping);
  if (!items.length) throw bad('No valid rows found', errors);
  const result = applyStock(p.id, items, { mode: req.body.mode === 'replace' ? 'replace' : 'merge', source: 'sync-agent', filename: req.file.originalname, errors });
  res.json({ ...result, mapping, pharmacy: p.name });
});

export default r;
