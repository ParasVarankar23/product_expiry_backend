import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, immutable: true, lowercase: true, trim: true },
        password: { type: String, required: false, select: false }, // optional for google login
        phoneNumber: { type: String, default: null, trim: true },
        address: { type: String, default: "", trim: true },
        avatar: { type: String, default: "" },
        role: { type: String, enum: ["admin", "manager", "user"], default: "user" },
        provider: { type: String, enum: ["local", "google"], default: "local" },
        googleId: { type: String, default: null },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
        isVerified: { type: Boolean, default: false },
        otp: { type: String, default: null, select: false },
        otpExpiry: { type: Date, default: null, select: false },
    },
    { timestamps: true }
);

// Static for public registration: block admin role
userSchema.statics.isAdminRoleAllowedPublic = function (role) {
    return role !== "admin";
};

// Static for protected registration: allow admin only if created by company owner
userSchema.statics.isAdminRoleAllowedProtected = function (role, creatorRole) {
    if (role !== "admin") return true;
    return creatorRole === "admin"; // Only company admin can create admin
};

/* ================= HASH PASSWORD ================= */
userSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password) return;
    this.password = await bcrypt.hash(this.password, 10);
});

/* ================= COMPARE PASSWORD ================= */
userSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);
