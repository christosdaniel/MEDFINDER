// PostgreSQL database.
// - Production: Supabase (or any Postgres) via DATABASE_URL.
// - Local development and tests: PGlite, an embedded Postgres that runs inside
//   Node (data in backend/data/pglite, or in memory for tests), so the same SQL
//   runs everywhere.
// Everything about patients, pharmacies, stock, orders and admin lives here,
// so the apps "remember" users and nothing is lost when the server restarts.
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import { config } from './config.js';
import { SCHEMA } from './schema.js';

/** Convert `?` placeholders to Postgres `$1, $2…` (our SQL never uses ? in literals). */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let driver; // { query(sql, params) -> {rows, rowCount}, transaction(fn), end() }

async function connect() {
  if (config.databaseUrl) {
    const pg = (await import('pg')).default;
    pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // COUNT(*) etc. as numbers
    pg.types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC as numbers
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_SIZE || 5),
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (e) => console.error('Postgres pool error:', e.message));
    return {
      kind: 'postgres',
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn({ query: (s, p) => client.query(s, p) });
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally { client.release(); }
      },
      end: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = config.pgliteDir;
  if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir === 'memory://' ? undefined : dir);
  await lite.waitReady;
  return {
    kind: 'pglite',
    query: async (sql, params) => {
      const r = await lite.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    exec: (sql) => lite.exec(sql),
    transaction: (fn) => lite.transaction((t) => fn({
      query: async (s, p) => { const r = await t.query(s, p); return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }; },
    })),
    end: () => lite.close(),
  };
}

// Queries made inside tx() automatically use the transaction's connection.
const txStore = new AsyncLocalStorage();
let ready;

async function run(sql, params = []) {
  await ready;
  const conn = txStore.getStore() || driver;
  return conn.query(toPg(sql), params.map((v) => (v === undefined ? null : v)));
}

export const db = {
  /** All matching rows. */
  all: async (sql, ...params) => (await run(sql, params)).rows,
  /** First matching row (or undefined). */
  get: async (sql, ...params) => (await run(sql, params)).rows[0],
  /** Run a statement; returns { rowCount, rows } (add RETURNING id to get new ids). */
  run: async (sql, ...params) => { const r = await run(sql, params); return { rowCount: r.rowCount, changes: r.rowCount, rows: r.rows }; },
  /** Execute several statements (no parameters). */
  exec: async (sql) => { await ready; return driver.exec(sql); },
  get kind() { return driver?.kind; },
};

/** Run fn inside a transaction; everything rolls back if it throws. */
export async function tx(fn) {
  await ready;
  if (txStore.getStore()) return fn(); // already inside one
  return driver.transaction((conn) => txStore.run(conn, fn));
}

export async function getSetting(key) {
  return (await db.get('SELECT value FROM settings WHERE key = ?', key))?.value;
}

export async function closeDb() {
  await ready;
  await driver.end();
}

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
const defaultSettings = {
  subscription_price_ghs: '150',
  trial_days: '30',
  support_phone: '+233 30 000 0000',
  min_app_version: '1.0.0',
};

async function init() {
  driver = await connect();
  await driver.exec(SCHEMA);
  for (const [k, l, d, a] of defaultFlags) {
    await driver.query('INSERT INTO feature_flags (key, label, description, audience, enabled) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO NOTHING',
      [k, l, d, a, k === 'maintenance_mode' ? 0 : 1]);
  }
  for (const [k, v] of Object.entries(defaultSettings)) {
    await driver.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
}

ready = init();
/** Resolves once the database is connected and the schema is in place. */
export const dbReady = ready;
