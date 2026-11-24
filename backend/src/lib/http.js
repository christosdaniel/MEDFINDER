export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);

/** Small schema validator: rules = { field: { required, type, min, max, enum, trim } } */
export function validate(body, rules) {
  const out = {};
  const errors = {};
  for (const [field, r] of Object.entries(rules)) {
    let v = body?.[field];
    if (typeof v === 'string') v = v.trim();
    if (v === undefined || v === null || v === '') {
      if (r.required) errors[field] = 'is required';
      else if (r.default !== undefined) out[field] = r.default;
      continue;
    }
    if (r.type === 'number') {
      v = Number(v);
      if (Number.isNaN(v)) { errors[field] = 'must be a number'; continue; }
      if (r.min !== undefined && v < r.min) { errors[field] = `must be at least ${r.min}`; continue; }
      if (r.max !== undefined && v > r.max) { errors[field] = `must be at most ${r.max}`; continue; }
      if (r.int) v = Math.round(v);
    } else if (r.type === 'boolean') {
      v = v === true || v === 'true' || v === 1 || v === '1';
    } else {
      v = String(v);
      if (r.min !== undefined && v.length < r.min) { errors[field] = `must be at least ${r.min} characters`; continue; }
      if (r.max !== undefined && v.length > r.max) { errors[field] = `must be at most ${r.max} characters`; continue; }
      if (r.pattern && !r.pattern.test(v)) { errors[field] = r.message || 'is invalid'; continue; }
    }
    if (r.enum && !r.enum.includes(v)) { errors[field] = `must be one of ${r.enum.join(', ')}`; continue; }
    out[field] = v;
  }
  if (Object.keys(errors).length) {
    const first = Object.entries(errors)[0];
    throw bad(`${first[0]} ${first[1]}`, errors);
  }
  return out;
}

/** Normalise Ghana phone numbers to +233XXXXXXXXX. */
export function normalizePhone(raw) {
  if (!raw) return raw;
  let p = String(raw).replace(/[\s\-()]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (/^0\d{9}$/.test(p)) p = '+233' + p.slice(1);
  if (/^233\d{9}$/.test(p)) p = '+' + p;
  return p;
}
export const PHONE_RE = /^\+\d{10,15}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Great-circle distance in km. */
export function distanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined || Number.isNaN(Number(v)))) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
