import { createApp } from './app.js';
import { config } from './config.js';
import { ensureAdmin } from './seed.js';

await ensureAdmin();
createApp().listen(config.port, () => {
  console.log(`MedFinder API running on http://localhost:${config.port}/api`);
});
