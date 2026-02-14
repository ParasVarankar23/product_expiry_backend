import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import companyModel from "../../models/users/company.model.js";
import User from "../../models/users/user.model.js";
import { uploadBase64File } from "../../utils/cloudinary.utils.js";
import { formatPhone } from "../../utils/formatPhone.utils.js";
import { sendMail } from "../../utils/mailer.utils.js";
import { generatePassword } from "../../utils/passwordGenerator.utils.js";
// 1️⃣ PUBLIC REGISTRATION (SELF SIGNUP, EMAIL VERIFIED, PASSWORD EMAILED)
function generateUserPassword(name) {
    const symbols = "@!#$";
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    // Username part: first word, capitalized
    const base = name.split(" ")[0] || "User";
    return `${base}${base.slice(0, 2)}${randomNum}${symbol}`;
}

export const publicRegisterUser = async (req, res) => {
    try {
        const { name, email, role, companyCode } = req.body;
        if (!name || !email || !role || !companyCode) {
            return res.status(400).json({ success: false, message: "Name, email, role, and company code are required." });
        }
        // Validate email format
        if (!/.+@.+\..+/.test(String(email).toLowerCase())) {
            return res.status(400).json({ success: false, message: "Invalid email address." });
        }
        // Block admin role from public registration
        if (!User.isAdminRoleAllowedPublic(role)) {
            return res.status(403).json({ success: false, message: "Admin registration is not allowed from public signup." });
        }
        // Find company by code
        const company = await companyModel.findOne({ companyCode: companyCode.toUpperCase(), isActive: true });
        if (!company) {
            return res.status(400).json({ success: false, message: "Invalid company code. Please enter a valid company code." });
        }
        // Check for duplicate email in company
        const existing = await User.findOne({ email: email.toLowerCase(), companyId: company._id });
        if (existing) {
            return res.status(400).json({ success: false, message: "Email already exists in this company." });
        }
        // Generate password
        const password = generateUserPassword(name);
        // Create user
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            role,
            companyId: company._id,
            isVerified: true
        });
        // Send password to email
        await sendWelcomeEmail(user, password);
        return res.status(201).json({ success: true, message: "Registration successful. Password sent to your email. You have joined the company." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 2️⃣ PROTECTED COMPANY REGISTRATION (ADMIN/MANAGER CREATES USER, PASSWORD EMAILED)
export const registerUserInCompany = async (req, res) => {
    try {
        const { name, email, role } = req.body;
        if (!name || !email || !role) {
            return res.status(400).json({ success: false, message: "Name, email, and role are required." });
        }
        // Only allow admin/manager to create users
        const creatorRole = req.user.role;
        if (!User.isAdminRoleAllowedProtected(role, creatorRole)) {
            return res.status(403).json({ success: false, message: "Only company admin can create another admin." });
        }
        // Assign companyId from logged-in user
        const companyId = req.user.companyId;
        // Check for duplicate email in company
        const existing = await User.findOne({ email: email.toLowerCase(), companyId });
        if (existing) {
            return res.status(400).json({ success: false, message: "Email already exists in your company." });
        }
        // Generate password
        const password = generateUserPassword(name);
        // Create user
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            role,
            companyId,
            isVerified: true
        });
        // Send password to email
        await sendWelcomeEmail(user, password);
        return res.status(201).json({ success: true, message: "User registered successfully under your company. Password sent to email." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
/* ======================================================
   TOKEN HELPERS
====================================================== */

const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
    );
};

/* ======================================================
   HELPERS
====================================================== */

const isEmail = (value) =>
    /.+@.+\..+/.test(String(value).toLowerCase());

const OTP_LENGTH = 6;
const OTP_EXPIRES_MINUTES = 10;

const generateOtp = () => {
    const max = 10 ** OTP_LENGTH;
    return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, "0");
};

const getOtpExpiry = () =>
    new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

const sendOtpEmail = async (user, otp) => {
    if (!user?.email) return;

    const html = `
    <h2>Verify your email</h2>
    <p>Hi ${user.name || "User"},</p>
    <p>Your OTP is <strong>${otp}</strong>. It expires in ${OTP_EXPIRES_MINUTES} minutes.</p>
  `;

    try {
        await sendMail({
            to: user.email,
            subject: "Your OTP for Product Expiry",
            html,
        });
    } catch (err) {
        console.error("OTP email failed:", err.message);
    }
};

const sendWelcomeEmail = async (user, password = "") => {
    if (!user?.email) return;

    const passwordBlock = password
        ? `<p>Your temporary password is: <strong>${password}</strong></p>`
        : "";

    const html = `
    <h2>Welcome to Product Expiry</h2>
    <p>Hi ${user.name || "User"},</p>
    <p>Your account has been created successfully 🎉</p>
    ${passwordBlock}
  `;

    try {
        await sendMail({
            to: user.email,
            subject: "Welcome to Product Expiry",
            html,
        });
    } catch (err) {
        console.error("Welcome email failed:", err.message);
    }
};


/* ======================================================
   VERIFY EMAIL OTP
====================================================== */

export const verifyEmailOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required",
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
        }).select("+otpHash +otpExpires");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (user.emailVerified) {
            return res.status(400).json({
                success: false,
                message: "Email already verified",
            });
        }

        if (!user.otpHash || !user.otpExpires) {
            return res.status(400).json({
                success: false,
                message: "OTP not requested",
            });
        }

        if (user.otpExpires < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP expired",
            });
        }

        const isMatch = await bcrypt.compare(String(otp), user.otpHash);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        const generatedPassword = user.password
            ? ""
            : generatePassword(user.name || "User");

        if (generatedPassword) {
            user.password = generatedPassword;
        }

        user.emailVerified = true;
        user.otpHash = undefined;
        user.otpExpires = undefined;
        await user.save();

        await sendWelcomeEmail(user, generatedPassword);

        res.status(200).json({
            success: true,
            message: "Email verified successfully",
            accessToken: generateAccessToken(user),
            refreshToken: generateRefreshToken(user),
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   LOGIN USER (EMAIL OR PHONE)
====================================================== */

export const loginUser = async (req, res, next) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                message: "Identifier and password required",
            });
        }

        const query = isEmail(identifier)
            ? { email: identifier.toLowerCase() }
            : { phone: formatPhone(identifier) };

        const user = await User.findOne(query).select("+password");

        if (!user || !user.password) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        if (user.provider === "local" && !user.emailVerified) {
            return res.status(403).json({
                success: false,
                message: "Email not verified",
            });
        }

        const match = await user.comparePassword(password);

        if (!match) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        res.status(200).json({
            success: true,
            accessToken: generateAccessToken(user),
            refreshToken: generateRefreshToken(user),
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   GET PROFILE
====================================================== */

export const getProfile = async (req, res) => {
    res.status(200).json({
        success: true,
        user: req.user,
    });
};

/* ======================================================
   UPDATE PROFILE
====================================================== */

export const updateProfile = async (req, res, next) => {
    try {
        const { name, phone, address, avatar, email } = req.body;

        // ❌ Email cannot change
        if (email) {
            return res.status(400).json({
                success: false,
                message: "Email cannot be changed",
            });
        }

        const updates = {};

        if (name) updates.name = name;
        if (address) updates.address = address;

        if (phone) {
            const formattedPhone = formatPhone(phone);

            const phoneExists = await User.findOne({
                phone: formattedPhone,
                _id: { $ne: req.user._id },
            });

            if (phoneExists) {
                return res.status(400).json({
                    success: false,
                    message: "Phone already in use",
                });
            }

            updates.phone = formattedPhone;
        }

        /* ===== CLOUDINARY IMAGE UPLOAD ===== */
        if (avatar) {
            if (avatar.startsWith("data:")) {
                const upload = await uploadBase64File(avatar, "avatars");
                updates.avatar = upload?.url || "";
            } else {
                updates.avatar = avatar;
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            user: updatedUser,
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   SET PASSWORD (PROTECTED)
====================================================== */

export const setPassword = async (req, res, next) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: "Password is required",
            });
        }

        const user = await User.findById(req.user._id).select("+password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        user.password = password;
        user.provider = user.provider || "local";
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password set successfully",
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   GOOGLE LOGIN
====================================================== */

const verifyGoogleToken = async (idToken) => {
    const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    if (!response.ok) return null;

    const payload = await response.json();

    if (
        process.env.GOOGLE_CLIENT_ID &&
        payload.aud !== process.env.GOOGLE_CLIENT_ID
    ) {
        return null;
    }

    return payload;
};

export const googleLogin = async (req, res, next) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Google token required",
            });
        }

        const payload = await verifyGoogleToken(token);

        if (!payload?.email) {
            return res.status(401).json({
                success: false,
                message: "Invalid Google token",
            });
        }

        const email = payload.email.toLowerCase();

        let user = await User.findOne({ email });

        if (!user) {
            user = await User.create({
                name: payload.name || "Google User",
                email,
                avatar: payload.picture || "",
                provider: "google",
                emailVerified: true,
            });
        } else if (!user.emailVerified) {
            user.emailVerified = true;
            await user.save();
        }

        res.status(200).json({
            success: true,
            accessToken: generateAccessToken(user),
            refreshToken: generateRefreshToken(user),
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   FORGOT PASSWORD
====================================================== */

export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Generate OTP
        const otp = generateOtp();
        const resetOtpHash = await bcrypt.hash(otp, 10);
        const resetOtpExpiry = getOtpExpiry();

        // Save reset OTP
        user.resetOtpHash = resetOtpHash;
        user.resetOtpExpiry = resetOtpExpiry;
        await user.save();

        // Send OTP email
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Reset Your Password</h2>
                <p>Hi ${user.name || "User"},</p>
                <p>You requested to reset your password. Your OTP is:</p>
                <h1 style="color: #4CAF50; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                <p>This OTP will expire in ${OTP_EXPIRES_MINUTES} minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
                <p>Thank you,<br/>Product Expiry Team</p>
            </div>
        `;

        await sendMail({
            to: user.email,
            subject: "Password Reset OTP - Product Expiry",
            html,
        });

        res.status(200).json({
            success: true,
            message: "OTP sent to email",
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   VERIFY FORGOT PASSWORD OTP
====================================================== */

export const verifyForgotOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required",
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
        }).select("+resetOtpHash +resetOtpExpiry");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.resetOtpHash || !user.resetOtpExpiry) {
            return res.status(400).json({
                success: false,
                message: "OTP not requested",
            });
        }

        if (user.resetOtpExpiry < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP expired",
            });
        }

        const isMatch = await bcrypt.compare(String(otp), user.resetOtpHash);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        res.status(200).json({
            success: true,
            message: "OTP verified successfully",
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   RESET PASSWORD
====================================================== */

export const resetPassword = async (req, res, next) => {
    try {
        const { email, otp, newPassword, confirmPassword } = req.body;

        if (!email || !otp || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match",
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
        }).select("+resetOtpHash +resetOtpExpiry +password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.resetOtpHash || !user.resetOtpExpiry) {
            return res.status(400).json({
                success: false,
                message: "OTP not requested",
            });
        }

        if (user.resetOtpExpiry < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP expired",
            });
        }

        const isMatch = await bcrypt.compare(String(otp), user.resetOtpHash);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        // Set new password
        user.password = newPassword;
        user.resetOtpHash = undefined;
        user.resetOtpExpiry = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password reset successfully",
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   CHANGE PASSWORD (PROTECTED)
====================================================== */

export const changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;

        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "New passwords do not match",
            });
        }

        const user = await User.findById(req.user._id).select("+password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: "User has no password set",
            });
        }

        const isMatch = await user.comparePassword(oldPassword);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Old password is incorrect",
            });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password changed successfully",
        });
    } catch (error) {
        next(error);
    }
};
