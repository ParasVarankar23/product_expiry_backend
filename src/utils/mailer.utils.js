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

// Send OTP Email
export const sendOTPEmail = async (email, otp) => {
    const subject = "Your OTP for Product Expiry Super Admin Registration";
    const html = `<p>Your OTP for registration is: <b>${otp}</b></p><p>This OTP is valid for 10 minutes.</p>`;
    await sendMail({ to: email, subject, html });
};

// Send Generated Password Email
export const sendGeneratedPassword = async (email, password) => {
    const subject = "Your Super Admin Account Password";
    const html = `<p>Your account has been created. Your password is: <b>${password}</b></p><p>Please login and change your password after first login.</p>`;
    await sendMail({ to: email, subject, html });
};

// Send Reset OTP Email
export const sendResetOTP = async (email, otp) => {
    const subject = "Your OTP for Password Reset";
    const html = `<p>Your OTP for password reset is: <b>${otp}</b></p><p>This OTP is valid for 10 minutes.</p>`;
    await sendMail({ to: email, subject, html });
};
