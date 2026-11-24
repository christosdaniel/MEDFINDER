import { createApp } from './app.js';
import { config } from './config.js';
import { ensureAdmin, seedDemo } from './seed.js';

await ensureAdmin();
if (process.env.SEED_DEMO === 'true') await seedDemo();
createApp().listen(config.port, () => {
  console.log(`MedFinder API running on http://localhost:${config.port}/api`);
});
