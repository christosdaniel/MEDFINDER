import { createApp } from './app.js';
import { config } from './config.js';
import { ensureAdmin, seedDemo } from './seed.js';
import { db } from './db.js';
import { enqueuePhotoLookup } from './lib/photoLookup.js';

await ensureAdmin();
if (process.env.SEED_DEMO === 'true') await seedDemo();
createApp().listen(config.port, () => {
  console.log(`MedFinder API running on http://localhost:${config.port}/api`);
  // Fill in missing medicine photos in the background (slowly, to respect Wikimedia's limits).
  const missing = db.prepare('SELECT id FROM medicines WHERE image_id IS NULL').all().map((m) => m.id);
  const n = enqueuePhotoLookup(missing);
  if (n) console.log(`Looking up photos for ${n} medicines in the background`);
});
