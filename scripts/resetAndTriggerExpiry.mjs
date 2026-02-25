import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/init/db.js';
import Product from '../src/models/users/product.model.js';

const PRODUCT_ID = '699eca507008a3d997df5e9f'; // Good Day

const run = async () => {
    try {
        await connectDB();

        const p = await Product.findById(PRODUCT_ID);
        if (!p) {
            console.error('Product not found:', PRODUCT_ID);
            process.exit(1);
        }

        console.log('Before:', p.notificationsSent);
        p.notificationsSent = p.notificationsSent || {};
        p.notificationsSent.threeDays = false;
        await p.save();
        console.log('After:', p.notificationsSent);

        // trigger expiry check
        const { triggerExpiryCheckManually } = await import('../src/jobs/expiry.job.js');
        console.log('Triggering expiry check...');
        const res = await triggerExpiryCheckManually();
        console.log('Result:', JSON.stringify(res, null, 2));
        process.exit(0);
    } catch (e) {
        console.error('Error:', e?.message || e);
        process.exit(1);
    }
};

run();
