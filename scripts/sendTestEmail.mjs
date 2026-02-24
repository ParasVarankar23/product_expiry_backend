import { sendMail } from '../src/utils/mailer.utils.js';

(async () => {
    const to = process.env.TEST_EMAIL || process.argv[2];
    if (!to) {
        console.error('Usage: TEST_EMAIL=you@example.com node ./scripts/sendTestEmail.mjs OR provide email as first arg');
        process.exit(1);
    }

    try {
        console.log('Sending test email to', to);
        await sendMail({ to, subject: 'Product Expiry Reminder - Test Email', html: '<p>This is a test email from Product Expiry Reminder app.</p>' });
        console.log('Test email sent — check inbox and spam folder.');
        process.exit(0);
    } catch (err) {
        console.error('Test email failed:', err.message || err);
        process.exit(1);
    }
})();
