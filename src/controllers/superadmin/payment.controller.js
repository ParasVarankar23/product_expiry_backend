import crypto from "crypto";
import Payment from "../../models/superadmin/payment.model.js";
import companyModel from "../../models/users/company.model.js";
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
