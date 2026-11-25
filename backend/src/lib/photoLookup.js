// Automatic medicine photos from Wikimedia Commons (freely licensed images).
//
// When a medicine is added to the catalogue without a picture, it is queued
// here. A background worker searches Commons slowly (Wikimedia rate-limits
// busy clients), keeps only real photos whose title/description mention the
// medicine and whose licence allows reuse (CC0, public domain, CC BY, CC BY-SA),
// and saves the best one with credit to the photographer.
// Pharmacies and the admin can also browse the suggestions and pick one.
import { db } from '../db.js';
import { bad } from './http.js';
import { saveImage } from './images.js';

const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia asks API clients to identify themselves with a way to learn more.
const USER_AGENT = 'MedFinderGhana/1.0 (https://github.com/christosdaniel/MEDFINDER) medicine-photo-lookup';
const MIN_GAP_MS = Number(process.env.PHOTO_LOOKUP_GAP_MS ?? 3000);
const RECHECK_DAYS = 14;
// Automatic filling only uses confident matches (name in the title plus more evidence).
const AUTO_MIN_SCORE = 7;
const ALLOWED_IMAGE_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];

let fetchImpl = (...a) => fetch(...a);
/** Tests replace the network with a fake. */
export function setFetch(fn) { fetchImpl = fn; }

const flagOn = () => !!db.prepare(`SELECT enabled FROM feature_flags WHERE key = 'auto_medicine_photos'`).get()?.enabled;

// ---------- talking to Commons, politely ----------
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeGet(url, { json = true } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } });
    if (res.status === 429 || res.status === 503) {
      const retry = Number(res.headers?.get?.('retry-after')) || 30 * (attempt + 1);
      await sleep(Math.min(retry, 120) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Commons responded ${res.status}`);
    return json ? res.json() : Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Wikimedia is busy right now (rate limited). Try again in a few minutes.');
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

async function searchCommons(query, limit = 12) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: query,
    gsrlimit: String(limit), prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '800',
  });
  const data = await politeGet(`${API}?${params}`);
  return Object.values(data?.query?.pages || {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const ii = p.imageinfo?.[0] || {};
      const m = ii.extmetadata || {};
      return {
        title: String(p.title || '').replace(/^File:/, ''),
        mime: ii.mime,
        width: ii.width,
        height: ii.height,
        thumbUrl: ii.thumburl,
        sourceUrl: ii.descriptionurl,
        description: stripHtml(m.ImageDescription?.value).slice(0, 300),
        author: stripHtml(m.Artist?.value).slice(0, 120) || 'Unknown',
        license: stripHtml(m.LicenseShortName?.value),
      };
    });
}

// ---------- deciding whether a picture is a good match ----------
const SYNONYMS = { paracetamol: ['acetaminophen', 'panadol'], acetaminophen: ['paracetamol'], ors: ['oral rehydration'], 'vitamin c': ['ascorbic acid'] };
const REJECT = /\b(structure|formula|molecule|molecular|skeletal|3d|ball[- ]and[- ]stick|space[- ]?filling|model|chemical|synthesis|chart|graph|diagram|map|logo|crystal|spectrum|mechanism|pathway|plant|flower|tree|leaf|leaves|herb|patent|poster|advert|statue|portrait|bioart|illustration|icon|clipart|cartoon|drawing|vector|infographic)\b/i;
const PACK_WORDS = /\b(tablets?|capsules?|caps|pills?|pack|packet|box|blister|bottle|sachets?|syrup|suspension|inhaler|vial|ampoules?|medicine|drug|medication|pharmacy)\b/i;
const LICENSE_OK = /^(cc0|public domain|pd\b|pd-|cc by(-sa)?\b|cc-by(-sa)?\b|attribution)/i;
const norm = (s) => String(s || '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\.(jpe?g|png|webp|tiff?)$/i, '').replace(/\s+/g, ' ');

/** The words that must appear for a photo to count as this medicine. */
function nameKeys(name) {
  const n = norm(name).replace(/\(.*?\)/g, '').replace(/\b(tablets?|capsules?|syrup|sachets?|inhaler|cough)\b/g, '').trim();
  const keys = [n, ...(SYNONYMS[n] || [])];
  const first = n.split(' ')[0];
  if (first && first.length >= 4 && first !== n) keys.push(first, ...(SYNONYMS[first] || []));
  return [...new Set(keys.filter(Boolean))];
}

export function scoreCandidate(c, med) {
  if (!/^image\/(jpeg|png|webp)$/.test(c.mime || '')) return -1;
  if (!c.thumbUrl || (c.width && c.width < 300)) return -1;
  if (!LICENSE_OK.test(c.license || '')) return -1;
  const title = norm(c.title);
  const text = `${title} ${norm(c.description)}`;
  if (REJECT.test(title)) return -1;
  const keys = nameKeys(med.name);
  const inTitle = keys.some((k) => title.includes(k));
  if (!inTitle && !keys.some((k) => text.includes(k))) return -1;
  let score = inTitle ? 5 : 2;
  // Combination products ("Hydrocodone-paracetamol", "X + Paracetamol") are different medicines.
  const isCombo = /[\/+&]/.test(med.name) || /\b(and|with)\b/i.test(med.name);
  if (!isCombo) {
    const raw = String(c.title).toLowerCase();
    if (keys.some((k) => new RegExp(`[a-z]{4,}\\s*[-+/&]\\s*${k}|${k}\\s*[-+/&]\\s*[a-z]{4,}|\\b(and|with|plus)\\s+${k}|${k}\\s+(and|with|plus)\\s+[a-z]`).test(raw))) return -1;
  }
  if (keys.some((k) => title.startsWith(k))) score += 2;
  const strength = norm(med.strength).replace(/\s/g, '');
  if (strength && text.replace(/\s/g, '').includes(strength)) score += 3;
  if (med.form && text.includes(norm(med.form).replace(/s$/, ''))) score += 2;
  if (PACK_WORDS.test(text)) score += 2;
  if (c.mime === 'image/jpeg') score += 1;
  if (/^cc0|public domain/i.test(c.license)) score += 0.5;
  return score;
}

/** Ranked, licence-checked photo suggestions for a medicine. */
export async function suggestPhotos(med, limit = 8) {
  const queries = [...new Set([
    `${med.name} ${med.form || 'tablets'}`.trim(),
    med.name,
    ...(SYNONYMS[norm(med.name)] || []).map((s) => `${s} ${med.form || 'tablets'}`),
  ])];
  const seen = new Map();
  for (const q of queries) {
    for (const c of await searchCommons(q)) {
      if (seen.has(c.sourceUrl)) continue;
      const score = scoreCandidate(c, med);
      if (score > 0) seen.set(c.sourceUrl, { ...c, score });
    }
    if (seen.size >= limit) break;
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit)
    .map((c) => ({ ...c, credit: `${c.author}, ${c.license}, via Wikimedia Commons` }));
}

/** Download a chosen Commons photo and store it (with credit). */
export async function importPhoto({ thumbUrl, sourceUrl, author, license }, ownerType, ownerId, oldId) {
  let host;
  try { host = new URL(thumbUrl).hostname; } catch { throw bad('Invalid photo address'); }
  if (!ALLOWED_IMAGE_HOSTS.includes(host)) throw bad('Photos can only be imported from Wikimedia Commons');
  if (!LICENSE_OK.test(license || '')) throw bad('That photo’s licence does not allow reuse');
  const buffer = await politeGet(thumbUrl, { json: false });
  const id = await saveImage({ buffer }, ownerType, ownerId, { preset: 'product', oldId });
  db.prepare('UPDATE images SET source_url = ?, author = ?, license = ?, auto = 1 WHERE id = ?')
    .run(String(sourceUrl || '').slice(0, 500), String(author || 'Unknown').slice(0, 120), String(license).slice(0, 60), id);
  return id;
}

/** Credit line for a picture that came from Wikimedia (null for pharmacy-uploaded photos). */
export function imageCredit(imageId) {
  if (!imageId) return null;
  const r = db.prepare('SELECT author, license, source_url FROM images WHERE id = ? AND auto = 1').get(imageId);
  return r ? { text: `Photo: ${r.author}, ${r.license}, via Wikimedia Commons`, sourceUrl: r.source_url } : null;
}

// ---------- background worker ----------
const queue = new Set();
let running = false;
export const lookupStatus = { queued: 0, done: 0, found: 0, lastError: null, running: false };

/** Queue medicines (ids) that have no picture for an automatic lookup. */
export function enqueuePhotoLookup(ids, { force = false } = {}) {
  if (!flagOn() || process.env.PHOTO_LOOKUP === 'off') return 0;
  let n = 0;
  for (const id of ids) {
    const m = db.prepare('SELECT image_id, photo_checked_at FROM medicines WHERE id = ?').get(id);
    if (!m || m.image_id) continue;
    if (!force && m.photo_checked_at && Date.parse(m.photo_checked_at + 'Z') > Date.now() - RECHECK_DAYS * 86400000) continue;
    if (!queue.has(id)) { queue.add(id); n++; }
  }
  lookupStatus.queued = queue.size;
  if (n && !running) setImmediate(runQueue);
  return n;
}

async function runQueue() {
  if (running) return;
  running = true; lookupStatus.running = true;
  try {
    while (queue.size) {
      const id = queue.values().next().value;
      queue.delete(id);
      lookupStatus.queued = queue.size;
      try { await autoFill(id); lookupStatus.lastError = null; }
      catch (e) { lookupStatus.lastError = e.message; }
      lookupStatus.done++;
    }
  } finally { running = false; lookupStatus.running = false; }
}

/** Find and attach the best Commons photo for one medicine. Returns true if one was added. */
export async function autoFill(medicineId) {
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId);
  if (!med || med.image_id) return false;
  const [best] = await suggestPhotos(med, 3);
  db.prepare(`UPDATE medicines SET photo_checked_at = datetime('now') WHERE id = ?`).run(med.id);
  if (!best || best.score < AUTO_MIN_SCORE) return false;
  const imageId = await importPhoto(best, 'medicine', med.id);
  // Only attach if nobody uploaded a picture in the meantime.
  const out = db.prepare('UPDATE medicines SET image_id = ? WHERE id = ? AND image_id IS NULL').run(imageId, med.id);
  if (!out.changes) { db.prepare('DELETE FROM images WHERE id = ?').run(imageId); return false; }
  lookupStatus.found++;
  return true;
}

/** Wait for the background queue to finish (used by tests). */
export async function drainPhotoQueue() {
  while (running || queue.size) await sleep(20);
}
