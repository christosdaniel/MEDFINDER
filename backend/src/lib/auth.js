import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db } from '../db.js';
import { HttpError } from './http.js';

const TTL = { patient: '90d', pharmacy: '30d', admin: '12h' };

export function signToken(role, id) {
  return jwt.sign({ role }, config.jwtSecret, { subject: String(id), expiresIn: TTL[role] });
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

/** Express middleware: require a valid token for one of the given roles. */
export function requireAuth(...roles) {
  return async (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Please sign in'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (roles.length && !roles.includes(payload.role)) throw new HttpError(403, 'Not allowed');
      const id = Number(payload.sub);
      if (payload.role === 'patient') {
        const p = (await db.get('SELECT id, status FROM patients WHERE id = ?', id));
        if (!p) throw new HttpError(401, 'Account not found');
        if (p.status === 'suspended') throw new HttpError(403, 'This account has been suspended. Contact support.');
      } else if (payload.role === 'pharmacy') {
        const p = (await db.get('SELECT id FROM pharmacies WHERE id = ?', id));
        if (!p) throw new HttpError(401, 'Account not found');
      } else if (payload.role === 'admin') {
        const a = (await db.get('SELECT id FROM admins WHERE id = ?', id));
        if (!a) throw new HttpError(401, 'Account not found');
      }
      req.user = { role: payload.role, id };
      next();
    } catch (e) {
      if (e instanceof HttpError) return next(e);
      next(new HttpError(401, 'Session expired, please sign in again'));
    }
  };
}

/** Simple in-memory rate limiter keyed by ip+route. */
const buckets = new Map();
export function rateLimit({ windowMs = 60_000, max = 10 } = {}) {
  return (req, _res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const b = buckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count++;
    buckets.set(key, b);
    if (b.count > max) return next(new HttpError(429, 'Too many attempts, please wait a minute and try again'));
    next();
  };
}
