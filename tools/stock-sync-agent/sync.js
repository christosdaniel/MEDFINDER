#!/usr/bin/env node
// MedFinder Stock Sync agent.
// Runs on the pharmacy's computer, watches the stock file they already use
// (Excel .xlsx, .csv, or Access .mdb/.accdb) and uploads it to MedFinder
// whenever it changes. The server reads the file and updates prices/stock.
// No dependencies: needs Node.js 18 or newer.
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true; else { out[key] = next; i++; }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || path.join(path.dirname(new URL(import.meta.url).pathname), 'config.json');
let fileConfig = {};
if (fs.existsSync(configPath)) {
  try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { console.error(`Could not read ${configPath}: ${e.message}`); process.exit(1); }
}
const cfg = {
  api: process.env.MEDFINDER_API || 'http://localhost:4000/api',
  key: process.env.MEDFINDER_SYNC_KEY,
  mode: 'merge',
  interval: 60,
  ...fileConfig,
  ...args,
};

if (args.help || !cfg.key || !cfg.file) {
  console.log(`MedFinder Stock Sync

Usage:
  node sync.js --api https://api.medfinder.gh/api --key <SYNC_KEY> --file "C:\\Pharmacy\\stock.xlsx"

Options:
  --api        MedFinder API URL (default http://localhost:4000/api)
  --key        Your sync key (Pharmacy portal → Import / link database)
  --file       Path to your stock file (.xlsx, .csv, .mdb, .accdb)
  --table      Access table name (if the database has several tables)
  --mode       merge (default) or replace (file is your full stock list)
  --interval   How often to check the file for changes, in seconds (default 60)
  --once       Upload once and exit (use with Windows Task Scheduler / cron)
  --config     Path to a JSON config file with the same options

You can also put these options in config.json next to this script.`);
  process.exit(cfg.key && cfg.file ? 0 : 1);
}

const api = String(cfg.api).replace(/\/$/, '');
const file = path.resolve(String(cfg.file));
const log = (...m) => console.log(`[${new Date().toLocaleString()}]`, ...m);

async function upload() {
  const buf = fs.readFileSync(file);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), path.basename(file));
  fd.append('mode', cfg.mode === 'replace' ? 'replace' : 'merge');
  if (cfg.table) fd.append('table', String(cfg.table));
  if (cfg.mapping) fd.append('mapping', typeof cfg.mapping === 'string' ? cfg.mapping : JSON.stringify(cfg.mapping));
  const res = await fetch(`${api}/sync/stock`, { method: 'POST', headers: { 'X-Sync-Key': String(cfg.key) }, body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  log(`Synced ${path.basename(file)} → ${json.pharmacy}: ${json.created} new, ${json.updated} updated${json.zeroed ? `, ${json.zeroed} set to 0` : ''}${json.errors?.length ? `, ${json.errors.length} rows skipped` : ''}`);
  if (json.errors?.length) json.errors.slice(0, 5).forEach((e) => log('  skipped:', e));
}

async function main() {
  if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
  const ping = await fetch(`${api}/sync/ping`, { headers: { 'X-Sync-Key': String(cfg.key) } }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))).catch((e) => ({ ok: false, j: { error: e.message } }));
  if (!ping.ok) { console.error(`Cannot connect to MedFinder: ${ping.j.error}`); process.exit(1); }
  log(`Connected as ${ping.j.pharmacy} (${ping.j.approvalStatus}). Watching ${file}`);

  let lastMtime = 0;
  let busy = false;
  const check = async () => {
    if (busy) return;
    try {
      const { mtimeMs } = fs.statSync(file);
      if (mtimeMs === lastMtime) return;
      busy = true;
      // Wait for the program (Excel / Access) to finish writing the file.
      await new Promise((r) => setTimeout(r, 2000));
      await upload();
      lastMtime = mtimeMs;
    } catch (e) {
      log('Sync failed:', e.message, '(will retry)');
    } finally { busy = false; }
  };
  await check();
  if (cfg.once) process.exit(lastMtime ? 0 : 1);
  setInterval(check, Math.max(10, Number(cfg.interval)) * 1000);
  fs.watch(path.dirname(file), (_e, name) => { if (name === path.basename(file)) setTimeout(check, 500); });
}

main();
