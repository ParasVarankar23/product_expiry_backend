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
            throw new Error("User email not found");
        }

        const expiryDate = new Date(product.expiryDate).toLocaleDateString();

        let subject = "";
        let html = "";

        if (type === "new") {
            subject = `New Product Registered – ${product.name}`;

            html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Product Notification</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td align="center" style="padding:30px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.08); padding:30px;">
        
        <tr>
            <td align="center" style="padding-bottom:20px;">
            <h2 style="margin:0; color:#2c3e50;">📦 Product Successfully Registered</h2>
            </td>
        </tr>

        <tr>
            <td>
            <p>Dear ${user.name || "Valued User"},</p>
            <p>The following product has been successfully added to your inventory monitoring system:</p>
            
            <table width="100%" style="border-collapse:collapse; margin:15px 0;">
                <tr>
                <td style="padding:8px; border-bottom:1px solid #eee;"><strong>Product Name</strong></td>
                <td style="padding:8px; border-bottom:1px solid #eee;">${product.name}</td>
                </tr>
                <tr>
                <td style="padding:8px; border-bottom:1px solid #eee;"><strong>Category</strong></td>
                <td style="padding:8px; border-bottom:1px solid #eee;">${product.category || "N/A"}</td>
                </tr>
                <tr>
                <td style="padding:8px;"><strong>Expiry Date</strong></td>
                <td style="padding:8px;">${expiryDate}</td>
                </tr>
            </table>

            ${product.aiAdvice ? `
            <div style="background:#eef6ff; padding:15px; border-left:4px solid #2e86de; border-radius:6px;">
                <strong>AI Safety Recommendation:</strong><br/>
                ${product.aiAdvice}
            </div>` : ""}

            <p style="margin-top:20px;">You will receive timely alerts before the expiry date.</p>
            <p>Thank you for using our monitoring service.</p>
            <p style="margin-top:30px; font-size:12px; color:#777;">
                This is an automated notification. Please do not reply to this email.
            </p>
            </td>
        </tr>

        </table>
    </td>
    </tr>
</table>
</body>
</html>
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

            subject = `Expiry Alert – ${product.name}`;

            html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Expiry Alert</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:30px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.08); padding:30px;">
          
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <h2 style="margin:0; color:#c0392b;">⚠ Product Expiry Notification</h2>
            </td>
          </tr>

          <tr>
            <td>
              <p>Dear ${user.name || "Valued User"},</p>
              <p>This is a real-time alert regarding the product listed below:</p>

              <table width="100%" style="border-collapse:collapse; margin:15px 0;">
                <tr>
                  <td style="padding:8px; border-bottom:1px solid #eee;"><strong>Product Name</strong></td>
                  <td style="padding:8px; border-bottom:1px solid #eee;">${product.name}</td>
                </tr>
                <tr>
                  <td style="padding:8px; border-bottom:1px solid #eee;"><strong>Expiry Date</strong></td>
                  <td style="padding:8px; border-bottom:1px solid #eee;">${expiryDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px;"><strong>Status</strong></td>
                  <td style="padding:8px; color:${daysRemaining <= 0 ? "#c0392b" : "#e67e22"};">
                    ${daysRemaining <= 0 ? "Expired" : `${daysRemaining} day(s) remaining`}
                  </td>
                </tr>
              </table>

              ${product.aiAdvice ? `
              <div style="background:#fff5f5; padding:15px; border-left:4px solid #e74c3c; border-radius:6px;">
                <strong>Health & Safety Advisory:</strong><br/>
                ${product.aiAdvice}
              </div>` : ""}

              <p style="margin-top:20px; font-weight:bold; color:#c0392b;">
                ${daysRemaining <= 0
                    ? "Immediate action required: Please dispose of the expired product safely."
                    : "Kindly ensure the product is consumed before the expiry date."}
              </p>

              <p style="margin-top:30px; font-size:12px; color:#777;">
                This is an automated real-time notification generated by the Product Monitoring System.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
        }

        /* ======================================================
             ORDER CONFIRMATION
        ====================================================== */
        else if (type === "order") {
            // `product` argument is actually an order object for this type
            const order = product;
            subject = `Order Confirmation – ${order.orderNumber}`;

            const itemsHtml = (order.items || [])
                .map(i => `<tr><td style="padding:8px; border-bottom:1px solid #eee;">${i.productName}</td><td style="padding:8px; border-bottom:1px solid #eee;">${i.quantity}</td><td style="padding:8px; border-bottom:1px solid #eee;">₹${i.price}</td></tr>`)
                .join("");

            const shipping = order.shippingAddress || {};

            html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Order Confirmation</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
            <td align="center" style="padding:30px 0;">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.08); padding:30px;">
                    <tr>
                        <td align="center" style="padding-bottom:20px;">
                            <h2 style="margin:0; color:#2c3e50;">✅ Order Confirmation</h2>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <p>Dear ${user.name || 'Customer'},</p>
                            <p>Thank you for your order. Here are the details:</p>

                            <table width="100%" style="border-collapse:collapse; margin:15px 0;">
                                <tr>
                                    <td style="padding:8px; border-bottom:1px solid #eee;"><strong>Order Number</strong></td>
                                    <td style="padding:8px; border-bottom:1px solid #eee;">${order.orderNumber}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px; border-bottom:1px solid #eee;"><strong>Total Amount</strong></td>
                                    <td style="padding:8px; border-bottom:1px solid #eee;">₹${order.totalAmount}</td>
                                </tr>
                            </table>

                            <table width="100%" style="border-collapse:collapse; margin:15px 0;">
                                <tr>
                                    <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Product</th>
                                    <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Qty</th>
                                    <th style="text-align:left; padding:8px; border-bottom:1px solid #eee;">Price</th>
                                </tr>
                                ${itemsHtml}
                            </table>

                            <h4>Shipping Address</h4>
                            <p>
                                ${shipping.name || ''}<br/>
                                ${shipping.addressLine1 || ''} ${shipping.addressLine2 || ''}<br/>
                                ${shipping.city || ''} ${shipping.state || ''} ${shipping.postalCode || ''}<br/>
                                ${shipping.country || ''}
                            </p>

                            <p style="margin-top:20px;">We will send another email once your payment is confirmed and your order is shipped.</p>

                            <p style="margin-top:30px; font-size:12px; color:#777;">This is an automated notification.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
        }

        console.log(`📧 Attempting email to ${user.email}...`);
        const mailResult = await sendMail({
            to: user.email,
            subject,
            html,
        });

        // If sendMail succeeded it returns the provider response object
        if (!mailResult) {
            throw new Error("sendMail did not return a success response");
        }

        console.log(`   ✅ Confirmed delivery to ${user.email}`);
        return { success: true };
    } catch (error) {
        console.error("❌ Email notification failed:", error.message);
        throw error;
    }
};

/* ======================================================
   SEND WHATSAPP NOTIFICATION CONTROLLER
====================================================== */

export const sendWhatsAppNotification = async (
    user,
    product,
    type = "expiry",
    daysRemaining = null
) => {
    try {
        /* -------------------------------
           VALIDATION
        --------------------------------*/
        if (!user || !product) {
            console.warn("⚠️ Missing user or product data");
            throw new Error("Missing user or product data");
        }

        // Support both `phoneNumber` (model) and legacy `phone` fields
        const phoneValue = user.phoneNumber || user.phone;
        if (!phoneValue) {
            console.warn("⚠️ User phone not found");
            throw new Error("User phone not found");
        }

        console.log(`📱 Attempting WhatsApp to ${user.name || 'Unknown'} (phone: ${phoneValue})...`);
        const formattedPhone = formatPhone(phoneValue);
        const whatsappNumber = `whatsapp:${formattedPhone}`;
        const expiryDate = product?.expiryDate
            ? new Date(product.expiryDate).toLocaleDateString()
            : "N/A";

        let message = "";

        /* ======================================================
           NEW PRODUCT MESSAGE
        ====================================================== */
        if (type === "new") {
            message =
                `📦 *Product Registration Confirmation*

Dear ${user.name || "Valued Customer"},

The following product has been successfully registered in your monitoring system:

• Product Name: ${product.name}
• Category: ${product.category || "N/A"}
• Expiry Date: ${expiryDate}

${product.aiAdvice ? `AI Safety Recommendation:
${product.aiAdvice}

` : ""}You will receive timely notifications before the expiry date.

— Product Monitoring System`;
        }

        /* ======================================================
           EXPIRY ALERT MESSAGE
        ====================================================== */
        else if (type === "expiry") {
            const isExpired = daysRemaining !== null && daysRemaining <= 0;

            let statusText = "";
            let actionText = "";

            if (isExpired) {
                statusText = "Status: EXPIRED";
                actionText = "Immediate action required. Please dispose of the expired product safely.";
            } else if (daysRemaining === 1) {
                statusText = "Status: Expires Tomorrow";
                actionText = "Kindly consume before expiry.";
            } else if (daysRemaining === 2) {
                statusText = "Status: Expires in 2 Days";
                actionText = "Please plan consumption accordingly.";
            } else if (daysRemaining === 3) {
                statusText = "Status: Expires in 3 Days";
                actionText = "Monitor usage to avoid wastage.";
            } else {
                statusText = `Status: ${daysRemaining} day(s) remaining`;
                actionText = "Please ensure timely consumption.";
            }

            message =
                `⚠ *Product Expiry Notification*

Dear ${user.name || "Valued Customer"},

Product Name: ${product.name}
Expiry Date: ${expiryDate}
${statusText}

${product.aiAdvice ? `Health & Safety Advisory:
${product.aiAdvice}

` : ""}${actionText}

— Product Monitoring System`;
        }

        /* ======================================================
           ORDER WHATSAPP
        ====================================================== */
        else if (type === "order") {
            const order = product;
            const shipping = order.shippingAddress || {};

            const itemsText = (order.items || [])
                .map(i => `• ${i.productName} x${i.quantity} @ ₹${i.price}`)
                .join("\n");

            message = `✅ Order Confirmation\n\nOrder Number: ${order.orderNumber}\nTotal: ₹${order.totalAmount}\n\nItems:\n${itemsText}\n\nShipping:\n${shipping.name || ''} ${shipping.addressLine1 || ''} ${shipping.city || ''} ${shipping.postalCode || ''}\n\nWe will notify you once payment is confirmed.`;
        }

        /* ======================================================
           SEND WHATSAPP MESSAGE
        ====================================================== */

        const response = await sendSMS(whatsappNumber, message);

        console.log(`✅ WhatsApp sent successfully to ${formattedPhone} (${user.name || 'Unknown'})`);
        return { success: true, response };

    } catch (error) {
        console.error("❌ WhatsApp notification failed:", error.message);
        throw error;
    }
};

/* ======================================================
   BATCH NOTIFICATION SENDER
====================================================== */

/* ======================================================
   BATCH NOTIFICATION SENDER (PROFESSIONAL VERSION)
====================================================== */

export const sendBatchNotifications = async (
    users,
    product,
    type = "expiry",
    daysRemaining = null
) => {
    try {
        /* -------------------------------
           VALIDATION
        --------------------------------*/
        if (!users || users.length === 0) {
            console.warn("⚠️ No users provided for batch notification.");
            return {
                success: false,
                message: "No users found."
            };
        }

        if (!product) {
            console.warn("⚠️ Product data missing.");
            return {
                success: false,
                message: "Product data missing."
            };
        }

        console.log(`📢 Starting batch notification for product: ${product.name}`);
        console.log(`👥 Total users: ${users.length}`);
        users.forEach((u, idx) => console.log(`   [${idx + 1}] ${u.name} (${u.email || 'no-email'})` + (u.phoneNumber || u.phone ? ` | ${u.phoneNumber || u.phone}` : ` | no-phone`)));

        /* -------------------------------
           SEND EMAILS
        --------------------------------*/
        console.log(`📧 Sending emails to ${users.length} recipients...`);
        const emailResults = await Promise.allSettled(
            users.map((user) =>
                sendEmailNotification(user, product, type, daysRemaining)
            )
        );
        console.log(`📧 Email batch complete`);

        /* -------------------------------
           SEND WHATSAPP
        --------------------------------*/
        console.log(`📱 Sending WhatsApp to ${users.length} recipients...`);
        const whatsappResults = await Promise.allSettled(
            users.map((user) =>
                sendWhatsAppNotification(user, product, type, daysRemaining)
            )
        );
        console.log(`📱 WhatsApp batch complete`);

        /* -------------------------------
           SUMMARY REPORT
        --------------------------------*/
        const emailSuccess = emailResults.filter(r => r.status === "fulfilled").length;
        const emailFailed = emailResults.filter(r => r.status === "rejected").length;

        const whatsappSuccess = whatsappResults.filter(r => r.status === "fulfilled").length;
        const whatsappFailed = whatsappResults.filter(r => r.status === "rejected").length;

        console.log("📊 Batch Notification Summary:");
        console.log(`   📧 Emails Sent: ${emailSuccess}`);
        console.log(`   ❌ Emails Failed: ${emailFailed}`);
        console.log(`   📱 WhatsApp Sent: ${whatsappSuccess}`);
        console.log(`   ❌ WhatsApp Failed: ${whatsappFailed}`);

        return {
            success: true,
            product: product.name,
            totalUsers: users.length,
            email: {
                sent: emailSuccess,
                failed: emailFailed
            },
            whatsapp: {
                sent: whatsappSuccess,
                failed: whatsappFailed
            }
        };

    } catch (error) {
        console.error("❌ Batch notification process failed:", error.message);

        return {
            success: false,
            message: "Batch notification failed",
            error: error.message
        };
    }
};
