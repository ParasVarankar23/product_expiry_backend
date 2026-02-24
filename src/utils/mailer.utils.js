import nodemailer from "nodemailer";

/* ================= CREATE TRANSPORTER ================= */
const createTransporter = () => {
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });
};

/* ================= SEND MAIL ================= */
export const sendMail = async ({ to, subject, html }) => {
    try {
        const transporter = createTransporter(); // create here
        // verify transporter connection configuration
        try {
            await transporter.verify();
            console.log('SMTP transporter verified');
        } catch (verifyErr) {
            console.warn('SMTP transporter verification failed:', verifyErr?.message || verifyErr);
        }

        const info = await transporter.sendMail({
            from: `"Product Expiry" <${process.env.SMTP_EMAIL}>`,
            to,
            subject,
            html,
        });

        console.log("✅ Email sent successfully", info?.messageId || '');
    } catch (error) {
        // Log full error for clearer diagnosis
        console.error("Mail error:", error.message || error);
        if (error.response) console.error('SMTP response:', error.response);
        throw error;
    }
};

// Send Generated Password Email
export const sendGeneratedPassword = async (email, password, companyCode = "") => {
    const subject = "Your Account Password";
    const codeBlock = companyCode ? `<p>Company Code: <b>${companyCode}</b></p>` : "";
    const html = `
        <p>Your account has been created. Your password is: <b>${password}</b></p>
        ${codeBlock}
        <p>Please login and change your password after first login.</p>
    `;

    await sendMail({ to: email, subject, html });
};

// Send Reset OTP Email
export const sendResetOTP = async (email, otp) => {
    const subject = "Your OTP for Password Reset";
    const html = `
        <p>Your OTP for password reset is: <b>${otp}</b></p>
        <p>This OTP is valid for 10 minutes.</p>
    `;

    await sendMail({ to: email, subject, html });
};
