import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { HttpError } from './lib/http.js';
import publicRoutes from './routes/public.js';
import patientRoutes from './routes/patient.js';
import pharmacyRoutes from './routes/pharmacy.js';
import adminRoutes from './routes/admin.js';
import syncRoutes from './routes/sync.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'medfinder-api', time: new Date().toISOString() }));
  app.use('/api', publicRoutes);
  app.use('/api/patient', patientRoutes);
  app.use('/api/pharmacy', pharmacyRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/sync', syncRoutes);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') err = new HttpError(400, 'File is too large. Photos can be up to 10 MB and stock files up to 25 MB.');
    if (err?.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON body');
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message, details: err.details });
  });
  return app;
}
