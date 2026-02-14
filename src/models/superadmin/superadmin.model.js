import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema(
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

        phoneNumber: {
            type: String,
            default: null,
            trim: true,
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

        password: {
            type: String,
            select: false,
            required: false,
        },

        googleId: {
            type: String,
            default: null,
        },

        provider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        otp: {
            type: String,
            default: null,
            select: false,
        },

        otpExpiry: {
            type: Date,
            default: null,
            select: false,
        },
    },
    { timestamps: true }
);

/* ========= HASH PASSWORD ========= */
superAdminSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password) return;
    this.password = await bcrypt.hash(this.password, 10);
});

/* ========= COMPARE PASSWORD ========= */
superAdminSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

/* ========= OTP VALIDATION ========= */
superAdminSchema.methods.isOTPValid = function (otp) {
    return (
        this.otp === otp &&
        this.otpExpiry &&
        this.otpExpiry > new Date()
    );
};

export default mongoose.model("SuperAdmin", superAdminSchema);
