import bcrypt from "bcryptjs";
import crypto from "crypto";
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

        role: {
            type: String,
            enum: ["superadmin"],
            default: "superadmin",
            immutable: true,
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

        sessions: {
            type: [
                {
                    sessionId: { type: String, required: true },
                    createdAt: { type: Date, default: Date.now },
                    expiresAt: { type: Date, required: true },
                    userAgent: { type: String },
                    ipAddress: { type: String },
                }
            ],
            default: [],
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

/* ========= GENERATE SESSION ID ========= */
superAdminSchema.methods.generateSessionId = function () {
    return crypto.randomBytes(32).toString('hex');
};

/* ========= ADD SESSION ========= */
superAdminSchema.methods.addSession = async function (sessionId, expiresAt, userAgent = null, ipAddress = null) {
    // Remove expired sessions
    this.sessions = this.sessions.filter(s => s.expiresAt > new Date());

    // Add new session
    this.sessions.push({
        sessionId,
        createdAt: new Date(),
        expiresAt,
        userAgent,
        ipAddress,
    });

    await this.save();
};

/* ========= VALIDATE SESSION ========= */
superAdminSchema.methods.isSessionValid = function (sessionId) {
    const session = this.sessions.find(s => s.sessionId === sessionId);
    if (!session) return false;
    return session.expiresAt > new Date();
};

/* ========= REMOVE SESSION ========= */
superAdminSchema.methods.removeSession = async function (sessionId) {
    this.sessions = this.sessions.filter(s => s.sessionId !== sessionId);
    await this.save();
};

export default mongoose.model("SuperAdmin", superAdminSchema);
