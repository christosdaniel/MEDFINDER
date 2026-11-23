// Turns a pharmacy's existing stock records (Excel, CSV or Microsoft Access)
// into MedFinder inventory. Column names are detected automatically, so most
// existing spreadsheets work without changes.
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import MDBReader from 'mdb-reader';
import { db, tx } from '../db.js';
import { bad } from './http.js';
import { fireRestockAlerts, lowStockCheck } from './notify.js';

export const COLUMN_ALIASES = {
  name: ['name', 'medicine', 'medicine name', 'drug', 'drug name', 'product', 'product name', 'item', 'item name', 'description', 'brand', 'generic name'],
  strength: ['strength', 'dose', 'dosage', 'mg', 'size', 'pack size', 'pack'],
  form: ['form', 'dosage form', 'type', 'formulation', 'unit'],
  category: ['category', 'class', 'group', 'therapeutic class'],
  price: ['price', 'unit price', 'selling price', 'sale price', 'retail price', 'price (ghs)', 'price ghs', 'ghs', 'cost', 'amount', 'sp'],
  quantity: ['quantity', 'qty', 'stock', 'in stock', 'stock level', 'quantity on hand', 'qoh', 'on hand', 'balance', 'units', 'count', 'available'],
  sku: ['sku', 'code', 'item code', 'product code', 'barcode', 'id'],
  requires_prescription: ['prescription', 'rx', 'requires prescription', 'prescription only', 'pom'],
  low_stock_threshold: ['reorder level', 'reorder', 'min', 'minimum', 'low stock', 'threshold'],
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Work out which header maps to which MedFinder field. */
export function detectMapping(headers) {
  const mapping = {};
  const used = new Set();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    // exact match first, then "contains"
    let hit = headers.find((h) => !used.has(h) && aliases.includes(norm(h)));
    if (!hit) hit = headers.find((h) => !used.has(h) && aliases.some((a) => a.length > 3 && norm(h).includes(a)));
    if (hit) { mapping[field] = hit; used.add(hit); }
  }
  return mapping;
}

function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    if ('result' in v) return cellValue(v.result);           // formula
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return v.text;                          // hyperlink
  }
  return v;
}

async function readXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // Use the first sheet that has data.
  const sheet = wb.worksheets.find((ws) => ws.actualRowCount > 1) || wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const all = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = cellValue(cell.value); });
    all.push(vals);
  });
  // Header row = first row with at least 2 non-empty text cells.
  const hIdx = Math.max(0, all.findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 2));
  const headers = (all[hIdx] || []).map((h, i) => String(h || `Column ${i + 1}`).trim());
  const rows = all.slice(hIdx + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows, sheet: sheet.name };
}

function readCsv(buffer) {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const delimiter = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = parseCsv(text, { columns: true, skip_empty_lines: true, trim: true, delimiter, relax_column_count: true });
  return { headers: rows.length ? Object.keys(rows[0]) : [], rows };
}

function readAccess(buffer, tableName) {
  const reader = new MDBReader(buffer);
  const tables = reader.getTableNames();
  if (!tables.length) throw bad('No tables found in the Access database');
  let name = tableName && tables.includes(tableName) ? tableName : null;
  if (!name) {
    // Pick the table whose columns look most like a stock list.
    let best = -1;
    for (const t of tables) {
      const cols = reader.getTable(t).getColumnNames();
      const score = Object.keys(detectMapping(cols)).length;
      if (score > best) { best = score; name = t; }
    }
  }
  const table = reader.getTable(name);
  const rows = table.getData().map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v ?? ''])));
  return { headers: table.getColumnNames(), rows, table: name, tables };
}

/** Parse an uploaded file buffer into raw rows. */
export async function readStockFile(buffer, filename, opts = {}) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xlsm') return { ...(await readXlsx(buffer)), format: 'xlsx' };
  if (ext === 'csv' || ext === 'txt') return { ...readCsv(buffer), format: 'csv' };
  if (ext === 'mdb' || ext === 'accdb') return { ...readAccess(buffer, opts.table), format: 'access' };
  if (ext === 'xls') throw bad('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) and upload again.');
  throw bad('Unsupported file. Upload an Excel (.xlsx), CSV (.csv) or Access (.mdb / .accdb) file.');
}

const num = (v) => {
  if (typeof v === 'number') return v;
  const cleaned = String(v ?? '').replace(/[^0-9.\-]/g, '');
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};
const truthy = (v) => ['yes', 'y', 'true', '1', 'x', 'rx', 'pom'].includes(norm(v));

/** Split "Paracetamol 500mg" into name + strength when there's no strength column. */
function splitStrength(name) {
  const m = String(name).match(/^(.*?)[\s,]+(\d+(?:\.\d+)?\s?(?:mg|g|mcg|ml|iu|%)(?:\s?\/\s?\d+(?:\.\d+)?\s?(?:mg|g|mcg|ml)?)?.*)$/i);
  return m ? { name: m[1].trim(), strength: m[2].trim() } : { name: String(name).trim(), strength: '' };
}

/** Convert raw rows into clean stock records using a column mapping. */
export function normaliseRows(rows, mapping) {
  if (!mapping.name) throw bad('Could not find the medicine name column. Rename it to "Medicine" or choose it in the column mapping.');
  if (!mapping.price) throw bad('Could not find the price column. Rename it to "Price" or choose it in the column mapping.');
  if (!mapping.quantity) throw bad('Could not find the quantity column. Rename it to "Quantity" or choose it in the column mapping.');
  const items = [];
  const errors = [];
  rows.forEach((r, i) => {
    const rawName = String(r[mapping.name] ?? '').trim();
    if (!rawName) return; // skip blank lines silently
    let name = rawName;
    let strength = mapping.strength ? String(r[mapping.strength] ?? '').trim() : '';
    if (!mapping.strength) ({ name, strength } = splitStrength(rawName));
    const price = num(r[mapping.price]);
    const quantity = Math.max(0, Math.round(num(r[mapping.quantity])));
    if (!Number.isFinite(price) || price < 0) { errors.push(`Row ${i + 2}: invalid price for "${rawName}"`); return; }
    if (!Number.isFinite(quantity)) { errors.push(`Row ${i + 2}: invalid quantity for "${rawName}"`); return; }
    const threshold = mapping.low_stock_threshold ? num(r[mapping.low_stock_threshold]) : NaN;
    items.push({
      name,
      strength,
      form: mapping.form ? String(r[mapping.form] ?? '').trim() || null : null,
      category: mapping.category ? String(r[mapping.category] ?? '').trim() || null : null,
      sku: mapping.sku ? String(r[mapping.sku] ?? '').trim() || null : null,
      requires_prescription: mapping.requires_prescription ? truthy(r[mapping.requires_prescription]) : false,
      low_stock_threshold: Number.isFinite(threshold) ? Math.round(threshold) : null,
      price: Math.round(price * 100) / 100,
      quantity,
    });
  });
  return { items, errors };
}

/** Find or create a catalogue medicine and return its id. */
export function upsertMedicine({ name, strength = '', form = null, category = null, requires_prescription = false }) {
  const found = db.prepare('SELECT id FROM medicines WHERE name = ? COLLATE NOCASE AND strength = ? COLLATE NOCASE').get(name, strength || '');
  if (found) {
    db.prepare(`UPDATE medicines SET form = COALESCE(form, ?), category = COALESCE(category, ?) WHERE id = ?`).run(form, category, found.id);
    return found.id;
  }
  return Number(
    db.prepare('INSERT INTO medicines (name, strength, form, category, requires_prescription) VALUES (?, ?, ?, ?, ?)')
      .run(name, strength || '', form, category, requires_prescription ? 1 : 0).lastInsertRowid
  );
}

/**
 * Apply stock records to a pharmacy's inventory.
 * mode "merge": update/insert listed items, leave others alone.
 * mode "replace": also set quantity to 0 for items not in the file (full stock take).
 */
export function applyStock(pharmacyId, items, { mode = 'merge', source = 'manual', filename = null, errors = [] } = {}) {
  const result = tx(() => {
    let created = 0, updated = 0, zeroed = 0;
    const touched = [];
    const getInv = db.prepare('SELECT id FROM inventory WHERE pharmacy_id = ? AND medicine_id = ?');
    const ins = db.prepare(`INSERT INTO inventory (pharmacy_id, medicine_id, price, quantity, low_stock_threshold, sku) VALUES (?, ?, ?, ?, ?, ?)`);
    const upd = db.prepare(`UPDATE inventory SET price = ?, quantity = ?, low_stock_threshold = COALESCE(?, low_stock_threshold), sku = COALESCE(?, sku), updated_at = datetime('now') WHERE id = ?`);
    for (const it of items) {
      const mid = upsertMedicine(it);
      touched.push(mid);
      const row = getInv.get(pharmacyId, mid);
      if (row) { upd.run(it.price, it.quantity, it.low_stock_threshold, it.sku, row.id); updated++; }
      else { ins.run(pharmacyId, mid, it.price, it.quantity, it.low_stock_threshold ?? 10, it.sku); created++; }
    }
    if (mode === 'replace' && touched.length) {
      const placeholders = touched.map(() => '?').join(',');
      zeroed = Number(db.prepare(`UPDATE inventory SET quantity = 0, updated_at = datetime('now') WHERE pharmacy_id = ? AND quantity > 0 AND medicine_id NOT IN (${placeholders})`)
        .run(pharmacyId, ...touched).changes);
    }
    db.prepare(`INSERT INTO import_logs (pharmacy_id, source, filename, rows_total, created_count, updated_count, zeroed_count, errors) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(pharmacyId, source, filename, items.length, created, updated, zeroed, errors.length ? JSON.stringify(errors.slice(0, 50)) : null);
    db.prepare(`UPDATE pharmacies SET last_sync_at = datetime('now') WHERE id = ?`).run(pharmacyId);
    return { created, updated, zeroed, touched };
  });
  fireRestockAlerts(result.touched);
  lowStockCheck(pharmacyId, result.touched);
  return { created: result.created, updated: result.updated, zeroed: result.zeroed, total: items.length, errors };
}
