// Manual one-off Clarity snapshot for all sites: npm run sync-clarity
import { syncAllClarity } from '../lib/scheduler.js';
const n = await syncAllClarity();
console.log(`Done — ${n} site(s) snapshotted.`);
process.exit(0);
