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

        await transporter.sendMail({
            from: `"Product Expiry" <${process.env.SMTP_EMAIL}>`,
            to,
            subject,
            html,
        });

        console.log("✅ Email sent successfully");
    } catch (error) {
        console.error("Mail error:", error.message);
        throw error;
    }
};
