import { createApp } from './app.js';
import { config } from './config.js';
import { ensureAdmin, seedDemo } from './seed.js';
import { db, dbReady } from './db.js';
import { enqueuePhotoLookup } from './lib/photoLookup.js';

await dbReady;
console.log(`Database: ${db.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'embedded PGlite (local)'}`);
await ensureAdmin();
if (process.env.SEED_DEMO === 'true') await seedDemo();
createApp().listen(config.port, async () => {
  console.log(`MedFinder API running on http://localhost:${config.port}/api`);
  // Fill in missing medicine photos in the background (slowly, to respect Wikimedia's limits).
  const missing = (await db.all('SELECT id FROM medicines WHERE image_id IS NULL')).map((m) => m.id);
  const n = await enqueuePhotoLookup(missing);
  if (n) console.log(`Looking up photos for ${n} medicines in the background`);
});
