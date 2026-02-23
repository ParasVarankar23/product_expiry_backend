import crypto from "crypto";
import Payment from "../../models/superadmin/payment.model.js";
import companyModel from "../../models/users/company.model.js";
import { sendMail } from "../../utils/mailer.utils.js";
import razorpay from "../../utils/razorpay.js";

const PLAN_PRICES = {
    free: 0,
    basic: 999,
    premium: 1999
};

export const createPaymentOrder = async (req, res) => {
    try {
        const { companyId, plan } = req.body;
        if (!companyId || !plan) {
            return res.status(400).json({ success: false, message: "companyId and plan required" });
        }
        const amount = PLAN_PRICES[plan] * 100; // Razorpay expects paise

        // Create a shorter receipt (max 40 chars)
        const shortReceipt = `${companyId.slice(-12)}_${Date.now().toString().slice(-10)}`;

        const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: shortReceipt,
        });

        const payment = await Payment.create({
            companyId,
            razorpayOrderId: order.id,
            amount,
            currency: "INR",
            plan,
            status: "created"
        });
        return res.status(200).json({
            success: true,
            orderId: order.id,
            amount,
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ success: false, message: "All fields required" });
        }
        // Find payment
        const payment = await Payment.findOne({ razorpayOrderId });
        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment not found" });
        }
        // Verify signature
        const generatedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");
        if (generatedSignature !== razorpaySignature) {
            payment.status = "failed";
            await payment.save();
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }
        // Mark payment as paid
        payment.razorpayPaymentId = razorpayPaymentId;
        payment.razorpaySignature = razorpaySignature;
        payment.status = "paid";
        await payment.save();
        // Activate company plan
        const company = await companyModel.findById(payment.companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        company.planStatus = "active";
        company.planStartDate = new Date();
        company.planEndDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
        company.paymentCreatedAt = new Date();
        company.publicRegisterEnabled = true;
        await company.save();

        // Send confirmation email to owner
        await sendMail({
            to: company.ownerEmail,
            subject: `Payment Successful – Your Product Expiry Account is Now Active`,
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    
                    <h2 style="color:#4CAF50;">
                        ✅ Payment Successful
                    </h2>

                    <p>Hi <strong>${company.ownerName}</strong>,</p>

                    <p>
                        Your payment has been processed successfully! Your company 
                        <strong>${company.companyName}</strong> is now fully active and ready to use.
                    </p>

                    <h3 style="margin-top:20px;">📌 Company Details</h3>

                    <p><strong>Company Name:</strong> ${company.companyName}</p>
                    <p><strong>Company Code:</strong> ${company.companyCode}</p>
                    <p><strong>Plan:</strong> ${company.plan.toUpperCase()}</p>
                    <p><strong>Status:</strong> Active ✅</p>
                    <p><strong>User Limit:</strong> ${company.userLimit} users</p>
                    <p><strong>Plan Valid Until:</strong> ${company.planEndDate.toLocaleDateString()}</p>

                    <h3 style="margin-top:20px;">🔐 Owner Login Details</h3>

                    <p><strong>Email:</strong> ${company.ownerEmail}</p>
                    <p style="color:#4CAF50;"><strong>✅ Password:</strong> Check your welcome email for login credentials</p>

                    <div style="margin:25px 0;padding:15px;background:#e8f5e9;border-left:4px solid #4CAF50;border-radius:4px;">
                        <p style="margin:0;"><strong>✅ Account Activated:</strong> Your company is now fully active and ready to use!</p>
                    </div>

                    <div style="margin:25px 0;">
                        <a href="https://product-expiry-frontend.vercel.app"
                           style="background:#4CAF50;color:white;padding:12px 20px;
                           text-decoration:none;border-radius:5px;display:inline-block;">
                           Login to Dashboard
                        </a>
                    </div>

                    <h3 style="margin-top:25px;">📞 What's Next?</h3>

                    <ol style="line-height:1.8;">
                        <li>Login with your email and password</li>
                        <li>Update your company profile</li>
                        <li>Invite team members (admins, managers, employees)</li>
                        <li>Add your products and set expiry dates</li>
                        <li>Start tracking product expiry automatically</li>
                    </ol>

                    <hr style="margin:25px 0;" />

                    <p style="font-size:13px;color:#555;">
                        <strong>Order ID:</strong> ${payment.razorpayOrderId}
                    </p>

                    <p style="font-size:12px;color:#888;">
                        © ${new Date().getFullYear()} Product Expiry. All rights reserved.
                    </p>

                </div>
            </div>
            `
        });

        // Owner authentication is managed at company level, no user record needed

        return res.status(200).json({
            success: true,
            message: "Payment successful, plan activated.",
            companyCode: company.companyCode
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
