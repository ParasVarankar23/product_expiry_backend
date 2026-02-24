import { formatPhone } from "../utils/formatPhone.utils.js";
import { sendMail } from "../utils/mailer.utils.js";
import { sendSMS } from "../utils/sendSMS.utils.js";

/* ======================================================
   SEND EMAIL NOTIFICATION
====================================================== */

export const sendEmailNotification = async (user, product, type = "expiry", daysRemaining = null) => {
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
                    <p>Thank you,<br/>Product Expiry Reminder Team</p>
                </div>
            `;
        } else if (type === "expiry") {
            const isExpired = daysRemaining !== null && daysRemaining <= 0;
            const urgencyColor = isExpired ? "#d63031" : daysRemaining === 1 ? "#e17055" : daysRemaining === 2 ? "#fdcb6e" : "#ff6b6b";
            const urgencyIcon = isExpired ? "⛔" : daysRemaining === 1 ? "🚨" : daysRemaining === 2 ? "⚠️" : "⏰";

            let urgencyMessage = "";
            if (isExpired) {
                urgencyMessage = "has EXPIRED!";
            } else if (daysRemaining === 1) {
                urgencyMessage = "expires TOMORROW!";
            } else if (daysRemaining === 2) {
                urgencyMessage = "expires in 2 DAYS!";
            } else if (daysRemaining === 3) {
                urgencyMessage = "expires in 3 days!";
            } else {
                urgencyMessage = "is expiring soon!";
            }

            subject = `${urgencyIcon} Product Expiry Reminder Alert: ${product.name} ${urgencyMessage}`;
            html = `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: ${urgencyColor};">${urgencyIcon} Product Expiry Reminder Alert</h2>
                    <p>Hi ${user.name || "User"},</p>
                    <p><strong>${product.name}</strong> ${urgencyMessage}</p>
                    <ul>
                        <li><strong>Expiry Date:</strong> ${expiryDate}</li>
                        ${daysRemaining !== null ? `<li><strong>Days Remaining:</strong> ${isExpired ? "EXPIRED" : daysRemaining + " day(s)"}</li>` : ""}
                        <li><strong>Status:</strong> ${product.status === "expired" ? "⛔ EXPIRED" : "⏰ Expiring Soon"}</li>
                    </ul>
                    ${product.aiAdvice ? `<div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;"><strong>🤖 AI Health Warning:</strong><br/>${product.aiAdvice}</div>` : ""}
                    <p style="color: ${urgencyColor}; font-weight: bold;">Please ${isExpired ? "dispose immediately" : "consume safely before expiry"} or dispose properly.</p>
                    <p>Thank you,<br/>Product Expiry Reminder Team</p>
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

export const sendWhatsAppNotification = async (user, product, type = "expiry", daysRemaining = null) => {
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
            const isExpired = daysRemaining !== null && daysRemaining <= 0;
            const urgencyIcon = isExpired ? "⛔" : daysRemaining === 1 ? "🚨" : daysRemaining === 2 ? "⚠️" : "⏰";

            let urgencyMessage = "";
            if (isExpired) {
                urgencyMessage = "has EXPIRED!";
            } else if (daysRemaining === 1) {
                urgencyMessage = "expires TOMORROW!";
            } else if (daysRemaining === 2) {
                urgencyMessage = "expires in 2 DAYS!";
            } else if (daysRemaining === 3) {
                urgencyMessage = "expires in 3 days!";
            } else {
                urgencyMessage = "is expiring soon!";
            }

            message = `${urgencyIcon} *Product Expiry Reminder Alert*\n\n${product.name} ${urgencyMessage}\n\nExpiry Date: ${expiryDate}\n${daysRemaining !== null && !isExpired ? `Days Remaining: ${daysRemaining}\n` : ""}${isExpired ? "Status: EXPIRED\n" : ""}\n${product.aiAdvice ? `🤖 Health Warning:\n${product.aiAdvice}\n\n` : ""}Please ${isExpired ? "dispose immediately" : "consume safely"} or dispose properly.`;
        }

        // Twilio WhatsApp format: whatsapp:+917767855084
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

export const sendBatchNotifications = async (users, product, type = "expiry", daysRemaining = null) => {
    try {
        const emailPromises = users.map((user) =>
            sendEmailNotification(user, product, type, daysRemaining)
        );
        const whatsappPromises = users.map((user) =>
            sendWhatsAppNotification(user, product, type, daysRemaining)
        );

        await Promise.allSettled([...emailPromises, ...whatsappPromises]);

        console.log(`✅ Batch notifications sent for product: ${product.name}`);
    } catch (error) {
        console.error("❌ Batch notification failed:", error.message);
    }
};
