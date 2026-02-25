// import nodemailer from "nodemailer";

// /* ================= CREATE TRANSPORTER ================= */
// const createTransporter = () => {
//     return nodemailer.createTransport({
//         host: "smtp.gmail.com",
//         port: 587,          // 🔥 use 587 instead of 465
//         secure: false,      // false for 587
//         requireTLS: true,
//         auth: {
//             user: process.env.SMTP_EMAIL,
//             pass: process.env.SMTP_PASS,
//         },
//     });
// }

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendMail = async ({ to, subject, html }) => {
    if (!process.env.RESEND_API_KEY) {
        const msg = "RESEND_API_KEY is not set in environment variables.";
        console.error("❌ Email error:", msg);
        throw new Error(msg);
    }

    try {
        const data = await resend.emails.send({
            from: "Product Expiry <onboarding@resend.dev>",
            to,
            subject,
            html,
        });

        // Log the response for debugging (don't log twice; sendEmailNotification will log the final result)
        console.log(`   📬 Resend API response:`, {
            id: data.id || 'no-id',
            from: data.from || 'no-from',
            to: to,
            status: 'sent'
        });
        return data;
    } catch (error) {
        console.error("❌ Email error:", error?.message || error);
        // rethrow so callers can react to failures
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
