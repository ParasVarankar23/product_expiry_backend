import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: false, // optional for google login
            select: false,
        },

        phone: {
            type: String,
            unique: true,
            sparse: true,
            default: null,
        },

        address: {
            type: String,
            default: "",
            trim: true,
        },

        avatar: {
            type: String,
            default: "",
        },

        role: {
            type: String,
            enum: ["admin", "store_manager", "user"],
            default: "user",
        },

        provider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
        },

        emailVerified: {
            type: Boolean,
            default: false,
        },

        otpHash: {
            type: String,
            select: false,
        },

        otpExpires: {
            type: Date,
            select: false,
        },

        resetOtpHash: {
            type: String,
            select: false,
        },

        resetOtpExpiry: {
            type: Date,
            select: false,
        },
    },
    { timestamps: true }
);

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
