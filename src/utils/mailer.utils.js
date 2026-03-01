import nodemailer from "nodemailer";
import { Resend } from "resend";

/* ================= CREATE NODEMAILER TRANSPORTER ================= */
const createTransporter = () => {
    return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        rejectUnauthorized: false, // Handle self-signed certificates
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASS,
        },
    });
};

const resend = new Resend(process.env.RESEND_API_KEY);

/* ================= MAIN SEND FUNCTION ================= */
export const sendMail = async ({ to, subject, html }) => {

    /* ---------- TRY NODEMAILER FIRST ---------- */
    if (process.env.SMTP_EMAIL && process.env.SMTP_PASS) {
        try {
            const transporter = createTransporter();

            const info = await transporter.sendMail({
                from: `"Product Expiry" <${process.env.SMTP_EMAIL}>`,
                to,
                subject,
                html,
            });

            console.log("✅ Email sent using Nodemailer:", info.messageId);
            return { success: true, provider: "nodemailer" };

        } catch (error) {
            console.error("❌ Nodemailer failed:", error.message);
            console.log("🔁 Switching to Resend...");
        }
    }

    /* ---------- FALLBACK TO RESEND ---------- */
    if (!process.env.RESEND_API_KEY) {
        throw new Error("Both Nodemailer and Resend configuration missing.");
    }

    try {
        const data = await resend.emails.send({
            from: "Product Expiry <onboarding@resend.dev>",
            to,
            subject,
            html,
        });

        console.log("✅ Email sent using Resend:", data.id);
        return { success: true, provider: "resend" };

    } catch (error) {
        console.error("❌ Resend also failed:", error.message);
        throw new Error("Both email services failed.");
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
