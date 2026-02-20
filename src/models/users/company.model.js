import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    publicRegisterEnabled: { type: Boolean, default: false },
    companyName: { type: String, required: true, trim: true },
    companyCode: { type: String, required: true, unique: true, uppercase: true },
    ownerName: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, trim: true, lowercase: true },
    ownerPosition: { type: String, default: "Owner" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", required: true },
    plan: { type: String, enum: ["free", "basic", "premium"], default: "free" },
    planStatus: { type: String, enum: ["active", "pending", "expired"], default: "pending" },
    planStartDate: { type: Date, default: null }, // Subscription start
    planEndDate: { type: Date, default: null },   // Subscription end
    paymentCreatedAt: { type: Date, default: null }, // Payment timestamp
    userLimit: { type: Number, default: 50 }, // User limit based on plan
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Company", companySchema);