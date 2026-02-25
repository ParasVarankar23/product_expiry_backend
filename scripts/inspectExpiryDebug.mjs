import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/init/db.js';
import companyModel from '../src/models/users/company.model.js';
import Order from '../src/models/users/order.model.js';
import Product from '../src/models/users/product.model.js';
import User from '../src/models/users/user.model.js';

const run = async () => {
    try {
        await connectDB();

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const threeDaysFromNow = new Date(now);
        threeDaysFromNow.setDate(now.getDate() + 3);
        threeDaysFromNow.setHours(23, 59, 59, 999);

        const expiringProducts = await Product.find({ expiryDate: { $lte: threeDaysFromNow } })
            .populate('addedBy', 'name email phoneNumber phone')
            .populate('assignedUsers', 'name email phoneNumber phone')
            .limit(10);

        console.log(`Found ${expiringProducts.length} products expiring within 3 days\n`);

        for (const p of expiringProducts) {
            console.log('--- Product ---');
            console.log('id:', p._id.toString());
            console.log('name:', p.name);
            console.log('expiryDate:', p.expiryDate);
            console.log('status:', p.status);
            console.log('notificationsSent:', JSON.stringify(p.notificationsSent));
            console.log('companyId:', p.companyId);
            console.log('addedBy:', p.addedBy ? { id: p.addedBy._id, name: p.addedBy.name, email: p.addedBy.email, phoneNumber: p.addedBy.phoneNumber, phone: p.addedBy.phone } : null);
            console.log('assignedUsers count:', (p.assignedUsers || []).length);
            (p.assignedUsers || []).forEach(u => console.log('  -', u._id ? u._id.toString() : '(no id)', u.name, u.email, u.phoneNumber, u.phone));

            // company users
            if (p.companyId) {
                const companyUsers = await User.find({ companyId: p.companyId }).select('name email phoneNumber phone role');
                console.log('company users count:', companyUsers.length);
                companyUsers.forEach(u => console.log('  -', u._id.toString(), u.name, u.email, u.phoneNumber, u.phone, u.role));

                const company = await companyModel.findById(p.companyId).select('ownerEmail ownerName');
                console.log('company owner:', company ? { ownerEmail: company.ownerEmail, ownerName: company.ownerName } : null);
            }

            // ordering users via orders
            const orders = await Order.find({ 'items.productId': p._id }).select('userId');
            console.log('orders found:', orders.length);
            const orderingUserIds = Array.from(new Set(orders.map(o => o.userId && o.userId.toString()).filter(Boolean)));
            if (orderingUserIds.length > 0) {
                const orderingUsers = await User.find({ _id: { $in: orderingUserIds } }).select('name email phoneNumber phone');
                console.log('ordering users:');
                orderingUsers.forEach(u => console.log('  -', u._id.toString(), u.name, u.email, u.phoneNumber, u.phone));
            }

            console.log('\n');
        }

        console.log('Env checks:');
        console.log('RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
        console.log('TWILIO_ACCOUNT_SID present:', !!process.env.TWILIO_ACCOUNT_SID);
        console.log('TWILIO_AUTH_TOKEN present:', !!process.env.TWILIO_AUTH_TOKEN);
        console.log('TWILIO_PHONE_NUMBER present:', !!process.env.TWILIO_PHONE_NUMBER);

        process.exit(0);
    } catch (e) {
        console.error('Error in inspect script:', e?.message || e);
        process.exit(1);
    }
};

run();
