// Turns a pharmacy's existing stock records (Excel, CSV or Microsoft Access)
// into MedFinder inventory. Column names are detected automatically, so most
// existing spreadsheets work without changes.
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import MDBReader from 'mdb-reader';
import { db, tx } from '../db.js';
import { bad, HttpError } from './http.js';
import { fireRestockAlerts, lowStockCheck } from './notify.js';
import { enqueuePhotoLookup } from './photoLookup.js';

export const COLUMN_ALIASES = {
  name: ['name', 'medicine', 'medicine name', 'drug', 'drug name', 'product', 'product name', 'item', 'item name', 'description', 'brand', 'generic name'],
  strength: ['strength', 'dose', 'dosage', 'mg'],
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
  // Pass 1: exact header matches for every field. Pass 2: "contains" matches
  // for fields still missing, in priority order (so "Unit Price" is a price, not a form).
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const hit = headers.find((h) => !used.has(h) && aliases.includes(norm(h)));
    if (hit) { mapping[field] = hit; used.add(hit); }
  }
  const priority = ['name', 'price', 'quantity', 'strength', 'sku', 'category', 'form', 'requires_prescription', 'low_stock_threshold'];
  for (const field of priority) {
    if (mapping[field]) continue;
    const aliases = COLUMN_ALIASES[field];
    const hit = headers.find((h) => !used.has(h) && aliases.some((a) => a.length > 3 && norm(h).includes(a)));
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
  const known = ['xlsx', 'xlsm', 'csv', 'txt', 'mdb', 'accdb'];
  if (known.includes(ext)) {
    let parsed;
    try {
      if (ext === 'xlsx' || ext === 'xlsm') parsed = { ...(await readXlsx(buffer)), format: 'xlsx' };
      else if (ext === 'csv' || ext === 'txt') parsed = { ...readCsv(buffer), format: 'csv' };
      else parsed = { ...readAccess(buffer, opts.table), format: 'access' };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const how = ext.startsWith('xls')
        ? 'Open it in Excel and choose File → Save As → Excel Workbook (.xlsx), or save it as CSV, then upload again. Password-protected files can\'t be read.'
        : ext === 'csv' || ext === 'txt'
          ? 'Make sure it is a comma-separated text file with a header row.'
          : 'Make sure the database is not password-protected, or export the stock table from Access to Excel and upload that.';
      throw bad(`We couldn't read "${filename}". ${how}`);
    }
    if (!parsed.rows.length) throw bad(`"${filename}" has no rows under the header. Check you saved the sheet that contains your stock list.`);
    return parsed;
  }
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
const DOSE_RE = /(\d+(?:\.\d+)?(?:\s?(?:mg|mcg|g|ml))?\s?\/\s?\d+(?:\.\d+)?(?:\s?(?:mg|mcg|g|ml))?|\d+(?:\.\d+)?\s?(?:mg|g|mcg|µg|ml|iu|%))(?![a-z0-9])/i;
const FORMS = {
  tablets: 'Tablets', tablet: 'Tablets', tabs: 'Tablets', tab: 'Tablets', caplets: 'Tablets',
  capsules: 'Capsules', capsule: 'Capsules', caps: 'Capsules', cap: 'Capsules',
  syrup: 'Syrup', syr: 'Syrup', suspension: 'Suspension', susp: 'Suspension',
  injection: 'Injection', inj: 'Injection', cream: 'Cream', ointment: 'Ointment', oint: 'Ointment',
  drops: 'Drops', inhaler: 'Inhaler', sachets: 'Sachets', sachet: 'Sachets', gel: 'Gel',
};
const FORM_RE = new RegExp(`\\s(${Object.keys(FORMS).join('|')})\\.?\\s*$`, 'i'); // only as the last word

/** "Paracetamol 500mg Tablets" → { name: "Paracetamol", strength: "500mg", form: "Tablets" }. */
export function splitStrength(raw) {
  let name = String(raw).trim();
  let strength = '';
  let form = null;
  const d = name.match(DOSE_RE);
  if (d && d.index > 0) { strength = d[1].replace(/\s+/g, ''); name = (name.slice(0, d.index) + ' ' + name.slice(d.index + d[0].length)); }
  name = name.replace(/\s{2,}/g, ' ').trim();
  const f = name.match(FORM_RE);
  if (f && f.index > 0) { form = FORMS[f[1].toLowerCase()]; name = name.slice(0, f.index); }
  name = name.replace(/\s*[,\-–(]+\s*$/, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  return { name: name || String(raw).trim(), strength, form };
}
const TOTAL_RE = /^(grand\s+)?(sub\s*)?totals?\b/i;

/** Convert raw rows into clean stock records using a column mapping. */
export function normaliseRows(rows, mapping) {
  if (!mapping.name) throw bad('Could not find the medicine name column. Rename it to "Medicine" or choose it in the column mapping.');
  if (!mapping.price) throw bad('Could not find the price column. Rename it to "Price" or choose it in the column mapping.');
  if (!mapping.quantity) throw bad('Could not find the quantity column. Rename it to "Quantity" or choose it in the column mapping.');
  const items = [];
  const errors = [];
  rows.forEach((r, i) => {
    const rawName = String(r[mapping.name] ?? '').trim();
    if (!rawName || TOTAL_RE.test(rawName)) return; // skip blank and total lines silently
    let name = rawName;
    let strength = mapping.strength ? String(r[mapping.strength] ?? '').trim() : '';
    let guessedForm = null;
    if (!strength) ({ name, strength, form: guessedForm } = splitStrength(rawName));
    const price = num(r[mapping.price]);
    const quantity = Math.max(0, Math.round(num(r[mapping.quantity])));
    if (!Number.isFinite(price) || price < 0) { errors.push(`Row ${i + 2}: invalid price for "${rawName}"`); return; }
    if (!Number.isFinite(quantity)) { errors.push(`Row ${i + 2}: invalid quantity for "${rawName}"`); return; }
    const threshold = mapping.low_stock_threshold ? num(r[mapping.low_stock_threshold]) : NaN;
    items.push({
      name,
      strength,
      form: (mapping.form ? String(r[mapping.form] ?? '').trim() || null : null) || guessedForm,
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
export async function upsertMedicine({ name, strength = '', form = null, category = null, requires_prescription = false }) {
  const row = await db.get(`
    INSERT INTO medicines (name, strength, form, category, requires_prescription) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT ((lower(name)), (lower(strength))) DO UPDATE
      SET form = COALESCE(medicines.form, EXCLUDED.form), category = COALESCE(medicines.category, EXCLUDED.category)
    RETURNING id`, name, strength || '', form, category, requires_prescription ? 1 : 0);
  return row.id;
}

const key = (name, strength) => `${String(name).toLowerCase()}|${String(strength || '').toLowerCase()}`;

/**
 * Apply stock records to a pharmacy's inventory, in a few bulk statements
 * (fast even when the database is far away, e.g. on Supabase).
 * mode "merge": update/insert listed items, leave others alone.
 * mode "replace": also set quantity to 0 for items not in the file (full stock take).
 */
export async function applyStock(pharmacyId, items, { mode = 'merge', source = 'manual', filename = null, errors = [] } = {}) {
  // One entry per medicine (the last row wins if a file lists a medicine twice).
  const unique = new Map();
  for (const it of items) unique.set(key(it.name, it.strength), it);
  const list = [...unique.values()];

  const result = await tx(async () => {
    const meds = list.length ? await db.all(`
      INSERT INTO medicines (name, strength, form, category, requires_prescription)
      SELECT * FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::int[])
      ON CONFLICT ((lower(name)), (lower(strength))) DO UPDATE
        SET form = COALESCE(medicines.form, EXCLUDED.form), category = COALESCE(medicines.category, EXCLUDED.category)
      RETURNING id, name, strength`,
      list.map((i) => i.name), list.map((i) => i.strength || ''), list.map((i) => i.form ?? null),
      list.map((i) => i.category ?? null), list.map((i) => (i.requires_prescription ? 1 : 0))) : [];
    const idByKey = new Map(meds.map((m) => [key(m.name, m.strength), m.id]));
    const mids = list.map((i) => idByKey.get(key(i.name, i.strength)));
    const cols = [mids, list.map((i) => i.price), list.map((i) => i.quantity), list.map((i) => i.low_stock_threshold ?? null), list.map((i) => i.sku ?? null)];
    let updated = 0, created = 0, zeroed = 0;
    if (list.length) {
      updated = (await db.run(`
        UPDATE inventory i SET price = t.price, quantity = t.qty, low_stock_threshold = COALESCE(t.thr, i.low_stock_threshold),
          sku = COALESCE(t.sku, i.sku), updated_at = now()
        FROM unnest(?::int[], ?::float8[], ?::int[], ?::int[], ?::text[]) AS t(mid, price, qty, thr, sku)
        WHERE i.pharmacy_id = ? AND i.medicine_id = t.mid`, ...cols, pharmacyId)).rowCount;
      created = (await db.run(`
        INSERT INTO inventory (pharmacy_id, medicine_id, price, quantity, low_stock_threshold, sku)
        SELECT ?, t.mid, t.price, t.qty, COALESCE(t.thr, 10), t.sku
        FROM unnest(?::int[], ?::float8[], ?::int[], ?::int[], ?::text[]) AS t(mid, price, qty, thr, sku)
        ON CONFLICT (pharmacy_id, medicine_id) DO NOTHING`, pharmacyId, ...cols)).rowCount;
    }
    if (mode === 'replace' && mids.length) {
      zeroed = (await db.run(`UPDATE inventory SET quantity = 0, updated_at = now()
        WHERE pharmacy_id = ? AND quantity > 0 AND NOT (medicine_id = ANY(?::int[]))`, pharmacyId, mids)).rowCount;
    }
    await db.run(`INSERT INTO import_logs (pharmacy_id, source, filename, rows_total, created_count, updated_count, zeroed_count, errors) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      pharmacyId, source, filename, items.length, created, updated, zeroed, errors.length ? JSON.stringify(errors.slice(0, 50)) : null);
    await db.run('UPDATE pharmacies SET last_sync_at = now() WHERE id = ?', pharmacyId);
    return { created, updated, zeroed, touched: mids };
  });
  await fireRestockAlerts(result.touched);
  await lowStockCheck(pharmacyId, result.touched);
  await enqueuePhotoLookup(result.touched);
  return { created: result.created, updated: result.updated, zeroed: result.zeroed, total: items.length, errors };
}
