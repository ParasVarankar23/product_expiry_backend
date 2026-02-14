import { formatPhone } from "../utils/formatPhone.utils.js";
import { sendMail } from "../utils/mailer.utils.js";
import { sendSMS } from "../utils/sendSMS.utils.js";

/* ======================================================
   SEND EMAIL NOTIFICATION
====================================================== */

export const sendEmailNotification = async (user, product, type = "expiry") => {
    try {
        if (!user?.email) {
            console.warn("⚠️ User email not found");
            return;
        }

        const expiryDate = new Date(product.expiryDate).toLocaleDateString();

        let subject = "";
        let html = "";

        if (type === "new") {
            subject = `New Product Added: ${product.name}`;
            html = `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>✅ New Product Added</h2>
                    <p>Hi ${user.name || "User"},</p>
                    <p>A new product has been added:</p>
                    <ul>
                        <li><strong>Product:</strong> ${product.name}</li>
                        <li><strong>Category:</strong> ${product.category || "N/A"}</li>
                        <li><strong>Expiry Date:</strong> ${expiryDate}</li>
                    </ul>
                    ${product.aiAdvice ? `<div style="background: #f0f8ff; padding: 15px; border-radius: 8px;"><strong>🤖 AI Safety Advice:</strong><br/>${product.aiAdvice}</div>` : ""}
                    <p>Thank you,<br/>Product Expiry Team</p>
                </div>
            `;
        } else if (type === "expiry") {
            subject = `⚠️ Product Expiring Soon: ${product.name}`;
            html = `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #ff6b6b;">⚠️ Product Expiry Alert</h2>
                    <p>Hi ${user.name || "User"},</p>
                    <p><strong>${product.name}</strong> is expiring soon!</p>
                    <ul>
                        <li><strong>Expiry Date:</strong> ${expiryDate}</li>
                        <li><strong>Status:</strong> ${product.status === "expired" ? "⛔ EXPIRED" : "⏰ Expiring Soon"}</li>
                    </ul>
                    ${product.aiAdvice ? `<div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;"><strong>🤖 AI Health Warning:</strong><br/>${product.aiAdvice}</div>` : ""}
                    <p style="color: #d63031;">Please consume safely or dispose properly.</p>
                    <p>Thank you,<br/>Product Expiry Team</p>
                </div>
            `;
        }

        await sendMail({
            to: user.email,
            subject,
            html,
        });

        console.log(`✅ Email sent to ${user.email}`);
    } catch (error) {
        console.error("❌ Email notification failed:", error.message);
    }
};

/* ======================================================
   SEND WHATSAPP NOTIFICATION (via Twilio)
====================================================== */

export const sendWhatsAppNotification = async (user, product, type = "expiry") => {
    try {
        if (!user?.phone) {
            console.warn("⚠️ User phone not found");
            return;
        }

        const formattedPhone = formatPhone(user.phone);
        const expiryDate = new Date(product.expiryDate).toLocaleDateString();

        let message = "";

        if (type === "new") {
            message = `✅ *New Product Added*\n\nProduct: ${product.name}\nCategory: ${product.category || "N/A"}\nExpiry: ${expiryDate}\n\n${product.aiAdvice ? `🤖 Safety Advice:\n${product.aiAdvice}` : ""}`;
        } else if (type === "expiry") {
            message = `⚠️ *Product Expiry Alert*\n\n${product.name} is ${product.status === "expired" ? "EXPIRED" : "expiring soon"}!\n\nExpiry Date: ${expiryDate}\n\n${product.aiAdvice ? `🤖 Health Warning:\n${product.aiAdvice}\n\n` : ""}Please consume safely or dispose properly.`;
        }

        // Twilio WhatsApp format: whatsapp:+919876543210
        const whatsappNumber = `whatsapp:${formattedPhone}`;

        await sendSMS(whatsappNumber, message);

        console.log(`✅ WhatsApp sent to ${formattedPhone}`);
    } catch (error) {
        console.error("❌ WhatsApp notification failed:", error.message);
    }
};

/* ======================================================
   BATCH NOTIFICATION SENDER
====================================================== */

export const sendBatchNotifications = async (users, product, type = "expiry") => {
    try {
        const emailPromises = users.map((user) =>
            sendEmailNotification(user, product, type)
        );
        const whatsappPromises = users.map((user) =>
            sendWhatsAppNotification(user, product, type)
        );

        await Promise.allSettled([...emailPromises, ...whatsappPromises]);

        console.log(`✅ Batch notifications sent for product: ${product.name}`);
    } catch (error) {
        console.error("❌ Batch notification failed:", error.message);
    }
};
