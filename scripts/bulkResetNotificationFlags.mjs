import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/init/db.js';
import Product from '../src/models/users/product.model.js';

const run = async () => {
    try {
        await connectDB();

        const resetObj = {
            threeDays: false,
            twoDays: false,
            oneDay: false,
            oneHour: false,
            expired: false,
        };

        const result = await Product.updateMany(
            {},
            { notificationsSent: resetObj }
        );

        console.log(`✅ Reset notificationsSent for ${result.modifiedCount} products`);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e?.message || e);
        process.exit(1);
    }
};

run();
