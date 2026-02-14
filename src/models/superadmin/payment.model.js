import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional
        razorpayOrderId: { type: String, required: true },
        razorpayPaymentId: { type: String },
        razorpaySignature: { type: String },
        amount: { type: Number, required: true },
        currency: { type: String, default: "INR" },
        plan: { type: String, enum: ["free", "basic", "premium"], required: true },
        status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
    },
    { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
