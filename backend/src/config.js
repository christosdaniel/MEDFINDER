import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  // Supabase / Postgres connection string. When empty, an embedded Postgres (PGlite) is used.
  databaseUrl: process.env.DATABASE_URL || '',
  // Where PGlite keeps its data locally; 'memory://' for a throwaway database (tests).
  pgliteDir: process.env.PGLITE_DIR || path.join(root, 'data', 'pglite'),
  // Comma separated list; "*" allows any origin (fine for local development).
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  // In development the OTP is returned in the API response so you can test without SMS.
  // Set EXPOSE_DEV_OTP=true on a hosted demo until an SMS provider is connected.
  exposeDevOtp: process.env.EXPOSE_DEV_OTP === 'true' || (!isProd && process.env.EXPOSE_DEV_OTP !== 'false'),
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@medfinder.gh',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
    name: process.env.ADMIN_NAME || 'MedFinder Admin',
  },
  sms: {
    // Plug in an SMS provider (e.g. Hubtel, Arkesel, Twilio) in lib/sms.js
    provider: process.env.SMS_PROVIDER || 'console',
  },
};
