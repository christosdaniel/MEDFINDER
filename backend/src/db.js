// SQLite database (Node's built-in node:sqlite, no native build step).
// Everything about patients, pharmacies, stock, orders and admin lives here,
// so the apps can "remember" users between sessions.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  age INTEGER,
  password_hash TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',           -- active | suspended
  push_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,                           -- verify | login | reset
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pharmacies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  password_hash TEXT NOT NULL,
  license_number TEXT NOT NULL,
  address TEXT NOT NULL,
  area TEXT,
  city TEXT NOT NULL DEFAULT 'Accra',
  region TEXT NOT NULL DEFAULT 'Greater Accra',
  lat REAL,
  lng REAL,
  bio TEXT,
  opening_hours TEXT,
  offers_delivery INTEGER NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0,
  delivery_radius_km REAL NOT NULL DEFAULT 5,
  approval_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | suspended
  rejection_reason TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial', -- trial | active | expired
  subscription_expires_at TEXT,
  sync_key TEXT UNIQUE,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  strength TEXT NOT NULL DEFAULT '',
  form TEXT,                                        -- tablets, capsules, syrup...
  category TEXT,
  requires_prescription INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name COLLATE NOCASE, strength COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  sku TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pharmacy_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id),
  method TEXT NOT NULL,                             -- pickup | delivery
  delivery_address TEXT,
  delivery_lat REAL,
  delivery_lng REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'cash',      -- cash | momo
  payment_status TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | paid
  subtotal REAL NOT NULL,
  delivery_fee REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  note TEXT,
  pharmacy_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  name TEXT NOT NULL,
  strength TEXT,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_type TEXT NOT NULL,                     -- patient | pharmacy | admin
  recipient_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_type, recipient_id, read);

CREATE TABLE IF NOT EXISTS restock_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notified_at TEXT,
  UNIQUE (patient_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS recent_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favorites (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (patient_id, pharmacy_id)
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  pharmacy_id INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',              -- open | investigating | resolved
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  method TEXT NOT NULL,
  reference TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                             -- upload:xlsx | upload:csv | upload:access | sync-agent | manual
  filename TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  zeroed_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin-controlled feature switches. Both apps read /api/config on start
-- so the admin can roll out (or switch off) features without an app update.
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',             -- patient | pharmacy | all
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',             -- patient | pharmacy | all
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Pictures (pharmacy logos, patient profile photos, medicine photos) are stored
// in the database so they live and get backed up with everything else.
db.exec(`
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,                         -- pharmacy_logo | patient_avatar | inventory | medicine
  owner_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/** Add a column to an existing table if it isn't there yet (simple migrations). */
function addColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
addColumn('pharmacies', 'logo_image_id', 'INTEGER');
addColumn('patients', 'avatar_image_id', 'INTEGER');
addColumn('inventory', 'image_id', 'INTEGER');
addColumn('medicines', 'image_id', 'INTEGER');
addColumn('medicines', 'photo_checked_at', 'TEXT');
// Credit for photos imported from Wikimedia Commons (their licences require it).
addColumn('images', 'source_url', 'TEXT');
addColumn('images', 'author', 'TEXT');
addColumn('images', 'license', 'TEXT');
addColumn('images', 'auto', 'INTEGER NOT NULL DEFAULT 0');

const defaultFlags = [
  ['delivery', 'Home delivery', 'Patients can choose delivery when the pharmacy offers it', 'all'],
  ['momo_payments', 'Mobile Money payments', 'Show Mobile Money as a payment option at checkout', 'patient'],
  ['restock_alerts', 'Restock alerts', 'Patients can ask to be notified when a medicine is back in stock', 'patient'],
  ['complaints', 'Report a pharmacy', 'Patients can file complaints about listings or orders', 'patient'],
  ['stock_import', 'Excel / Access stock import', 'Pharmacies can upload spreadsheets or Access databases', 'pharmacy'],
  ['sync_agent', 'Automatic stock sync agent', 'Pharmacies can link a local stock file that syncs automatically', 'pharmacy'],
  ['auto_medicine_photos', 'Automatic medicine photos', 'Find a free photo on Wikimedia Commons when a medicine has no picture', 'all'],
  ['maintenance_mode', 'Maintenance mode', 'Show a maintenance banner and block new orders', 'all'],
];
const insFlag = db.prepare(
  `INSERT OR IGNORE INTO feature_flags (key, label, description, audience, enabled) VALUES (?, ?, ?, ?, ?)`
);
for (const [k, l, d, a] of defaultFlags) insFlag.run(k, l, d, a, k === 'maintenance_mode' ? 0 : 1);

const defaultSettings = {
  subscription_price_ghs: '150',
  trial_days: '30',
  support_phone: '+233 30 000 0000',
  min_app_version: '1.0.0',
};
const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) insSetting.run(k, v);

export function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

/** Run fn inside a transaction; rolls back on throw. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
