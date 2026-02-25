import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/init/db.js';

const run = async () => {
    try {
        await connectDB();
        const { triggerExpiryCheckManually } = await import('../src/jobs/expiry.job.js');
        console.log('🔁 Triggering expiry check manually...');
        const res = await triggerExpiryCheckManually();
        console.log('📝 Manual expiry check result:', JSON.stringify(res, null, 2));
        process.exit(0);
    } catch (e) {
        console.error('❌ Manual trigger failed:', e?.message || e);
        process.exit(1);
    }
};

run();
