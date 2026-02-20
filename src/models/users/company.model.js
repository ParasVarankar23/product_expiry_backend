import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    publicRegisterEnabled: { type: Boolean, default: false },
    companyName: { type: String, required: true, trim: true },
    companyCode: { type: String, required: true, unique: true, uppercase: true },
    ownerName: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, trim: true, lowercase: true },
    ownerPassword: { type: String, required: true, select: false }, // Owner password stored here
    ownerRole: { type: String, default: "Owner" },
    otp: { type: String, default: null, select: false }, // For password reset OTP
    otpExpiry: { type: Date, default: null, select: false }, // OTP expiry time
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", required: true },
    plan: { type: String, enum: ["free", "basic", "premium"], default: "free" },
    planStatus: { type: String, enum: ["active", "pending", "suspended", "inactive"], default: "pending" },
    planStartDate: { type: Date, default: null }, // Subscription start
    planEndDate: { type: Date, default: null },   // Subscription end
    paymentCreatedAt: { type: Date, default: null }, // Payment timestamp
    userLimit: { type: Number, default: 50 }, // User limit based on plan
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Hash owner password before saving
companySchema.pre("save", async function () {
    if (!this.isModified("ownerPassword") || !this.ownerPassword) return;
    this.ownerPassword = await bcrypt.hash(this.ownerPassword, 10);
});

// Compare owner password method
companySchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.ownerPassword);
};

export default mongoose.model("Company", companySchema);