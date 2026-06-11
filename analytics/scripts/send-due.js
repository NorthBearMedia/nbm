// Manual one-off "send anything that's due now": npm run send-due
import { initialiseSchedules, sendDueReports } from '../lib/scheduler.js';
initialiseSchedules();
const n = await sendDueReports();
console.log(`Done — ${n} report(s) were due and processed.`);
process.exit(0);
