import { triggerExpiryCheckManually } from "../src/jobs/expiry.job.js";

(async () => {
    try {
        const res = await triggerExpiryCheckManually();
        console.log('Manual expiry check result:', res);
        process.exit(0);
    } catch (err) {
        console.error('Manual expiry check failed:', err);
        process.exit(1);
    }
})();
