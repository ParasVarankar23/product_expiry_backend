import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import companyModel from "../../models/users/company.model.js";
import User from "../../models/users/user.model.js";
import { uploadBase64File } from "../../utils/cloudinary.utils.js";
import { formatPhone } from "../../utils/formatPhone.utils.js";
import { sendMail } from "../../utils/mailer.utils.js";
import { generatePassword } from "../../utils/passwordGenerator.utils.js";
import { isCompanyRestricted } from "./company.controller.js";
// 1️⃣ PUBLIC REGISTRATION (SELF SIGNUP, EMAIL VERIFIED, PASSWORD EMAILED)

export const publicRegisterUser = async (req, res) => {
    try {
        const { name, email, companyCode, role } = req.body;
        if (!name || !email || !companyCode) {
            return res.status(400).json({ success: false, message: "Name, email, and company code are required." });
        }
        // Validate email format
        if (!/.+@.+\..+/.test(String(email).toLowerCase())) {
            return res.status(400).json({ success: false, message: "Invalid email address." });
        }
        // Only normal users can sign up publicly
        if (role && role !== "user") {
            return res.status(403).json({ success: false, message: "Only normal user signup is allowed." });
        }
        // Find company by code
        const company = await companyModel.findOne({ companyCode: companyCode.toUpperCase(), isActive: true });
        if (!company) {
            return res.status(400).json({ success: false, message: "Invalid company code. Please enter a valid company code." });
        }
        // Check company plan status
        if (company.planStatus !== "active") {
            return res.status(403).json({ success: false, message: "Company subscription inactive. Please contact administrator." });
        }
        // Check for duplicate email in company
        const existing = await User.findOne({ email: email.toLowerCase(), companyId: company._id });
        if (existing) {
            return res.status(400).json({ success: false, message: "Email already exists in this company." });
        }
        // Generate password
        const password = generatePassword(name);
        // Create user
        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            role: "user",
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

/* ========================================
   COMPANY STAFF: LIST / CREATE / UPDATE / DELETE
======================================== */
// Get all staff for a company (protected)
export const getCompanyStaff = async (req, res) => {
    try {
        const companyId = req.company?._id || req.user?.companyId;
        if (!companyId) return res.status(400).json({ success: false, message: "Company not found" });

        const users = await User.find({ companyId }).select("name email role");
        return res.status(200).json({ success: true, users });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Create staff (protected) - only owner or admin
export const createStaff = async (req, res) => {
    try {
        const { name, email, role } = req.body;
        if (!name || !email) return res.status(400).json({ success: false, message: "Name and email required" });

        const companyId = req.company?._id || req.user?.companyId;
        if (!companyId) return res.status(400).json({ success: false, message: "Company not found" });

        // Permission: owner or admin
        const isOwner = !!req.company;
        const isAdmin = req.user?.role === "admin";
        if (!(isOwner || isAdmin)) return res.status(403).json({ success: false, message: "Only owner or admin can create staff" });

        // Prevent creating admin unless owner
        if (role === "admin" && !isOwner) return res.status(403).json({ success: false, message: "Only owner can create admin" });

        // Duplicate check
        const existing = await User.findOne({ email: email.toLowerCase(), companyId });
        if (existing) return res.status(400).json({ success: false, message: "Email already exists in your company" });

        const password = generatePassword(name);

        const user = await User.create({ name, email: email.toLowerCase(), password, role: role || "manager", companyId, isVerified: true });

        await sendWelcomeEmail(user, password);

        return res.status(201).json({ success: true, message: "Staff created", user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Update staff
export const updateStaff = async (req, res) => {
    try {
        const staffId = req.params.id;
        const { name, role } = req.body;

        const companyId = req.company?._id || req.user?.companyId;
        if (!companyId) return res.status(400).json({ success: false, message: "Company not found" });

        // Permission: owner or admin
        const isOwner = !!req.company;
        const isAdmin = req.user?.role === "admin";
        if (!(isOwner || isAdmin)) return res.status(403).json({ success: false, message: "Only owner or admin can update staff" });

        const staff = await User.findOne({ _id: staffId, companyId });
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });

        if (name) staff.name = name;
        if (role) {
            if (role === "admin" && !isOwner) return res.status(403).json({ success: false, message: "Only owner can assign admin role" });
            staff.role = role;
        }

        await staff.save();
        return res.status(200).json({ success: true, message: "Staff updated", user: { id: staff._id, name: staff.name, email: staff.email, role: staff.role } });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Delete staff
export const deleteStaff = async (req, res) => {
    try {
        const staffId = req.params.id;
        const companyId = req.company?._id || req.user?.companyId;
        if (!companyId) return res.status(400).json({ success: false, message: "Company not found" });

        const isOwner = !!req.company;
        const isAdmin = req.user?.role === "admin";
        if (!(isOwner || isAdmin)) return res.status(403).json({ success: false, message: "Only owner or admin can delete staff" });

        const staff = await User.findOne({ _id: staffId, companyId });
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });

        await staff.remove();
        return res.status(200).json({ success: true, message: "Staff deleted" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
;

// 6️⃣ DIRECT USER LOGIN (EMAIL + NAME + COMPANY CODE - NO PASSWORD NEEDED)
export const directLoginUser = async (req, res) => {
    try {
        const { email, name, companyCode } = req.body;

        if (!email || !name || !companyCode) {
            return res.status(400).json({
                success: false,
                message: "Email, name, and company code are required."
            });
        }

        // Find company by code
        const company = await companyModel.findOne({
            companyCode: companyCode.toUpperCase(),
            isActive: true
        });

        if (!company) {
            return res.status(400).json({
                success: false,
                message: "Invalid company code."
            });
        }

        // Check company plan status
        if (company.planStatus !== "active") {
            return res.status(403).json({
                success: false,
                message: "Company subscription is not active."
            });
        }

        // Find user by email and name in this company
        const user = await User.findOne({
            email: email.toLowerCase(),
            name,
            companyId: company._id
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found. Please check email, name, and company code."
            });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        return res.status(200).json({
            success: true,
            message: "Login successful",
            accessToken,
            refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                companyId: user.companyId
            }
        });
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
        { expiresIn: "60m" }
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
    try {
        if (typeof crypto.randomInt === "function") {
            return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, "0");
        }
    } catch (e) {
        // ignore and fallback
    }

    // Fallback: use crypto.randomBytes to generate a secure number
    const byteLen = 6; // enough entropy
    const buf = crypto.randomBytes(byteLen);
    const num = buf.readUIntBE(0, Math.min(byteLen, 6)) % max;
    return String(num).padStart(OTP_LENGTH, "0");
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
            subject: "Your OTP for Product Expiry Reminder",
            html,
        });
    } catch (err) {
        console.error("OTP email failed:", err.message);
    }
};

const sendWelcomeEmail = async (user, password = "") => {
    if (!user?.email) return;

    const passwordBlock = password
        ? `
            <h3 style="margin-top:20px;">🔐 Your Login Credentials</h3>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Password:</strong> <span style="font-weight:bold;color:#d32f2f;">${password}</span></p>
        `
        : "";

    const html = `
    <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
        <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
            
            <h2 style="color:#4CAF50;">
                🎉 Welcome to Product Expiry Reminder
            </h2>

            <p>Hi <strong>${user.name || "User"}</strong>,</p>

            <p>
                Your account has been successfully created on <strong>Product Expiry Reminder</strong>.
                You're all set to start tracking Product Expiry Reminder dates!
            </p>

            ${passwordBlock}

            <div style="margin:25px 0;">
                <a href="https://product-expiry-frontend.vercel.app"
                   style="background:#4CAF50;color:white;padding:12px 20px;
                   text-decoration:none;border-radius:5px;display:inline-block;">
                   Login to Dashboard
                </a>
            </div>

            <div style="margin:25px 0;padding:15px;background:#e3f2fd;border-left:4px solid #2196F3;border-radius:4px;">
                <p style="margin:0;"><strong>💡 Next Steps:</strong></p>
                <ul style="margin:10px 0;padding-left:20px;">
                    <li>Change your password after first login for security</li>
                    <li>Complete your profile information</li>
                    <li>Start adding products to track</li>
                </ul>
            </div>

            <p style="font-size:13px;color:#555;">
                <strong>Role:</strong> ${user.role || "User"}
            </p>

            <p>
                If you have any questions or need assistance, please don't hesitate to contact our support team.
            </p>

            <hr style="margin:25px 0;" />

            <p style="font-size:12px;color:#888;">
                © ${new Date().getFullYear()} Product Expiry Reminder. All rights reserved.
            </p>

        </div>
    </div>
    `;

    try {
        await sendMail({
            to: user.email,
            subject: "Welcome to Product Expiry Reminder – Account Created Successfully",
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
        console.error("verifyEmailOtp error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   LOGIN USER (EMAIL OR PHONE)
====================================================== */

export const loginUser = async (req, res, next) => {
    try {
        // Accept `identifier` (email or phone) to match frontend usage.
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                message: "email/phone and password required",
            });
        }

        const query = isEmail(identifier)
            ? { email: identifier.toLowerCase() }
            : { phone: formatPhone(identifier) };

        const user = await User.findOne(query).select("+password");

        if (!user || !user.password) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // Support both `isVerified` and legacy `emailVerified` fields
        if (user.provider === "local" && !(user.isVerified || user.emailVerified)) {
            return res.status(403).json({ success: false, message: "Email not verified" });
        }

        const match = await user.comparePassword(password);

        if (!match) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // Check if company is suspended or inactive
        const restrictionCheck = await isCompanyRestricted(user.companyId);
        if (restrictionCheck.restricted) {
            return res.status(403).json({
                success: false,
                message: restrictionCheck.reason || "Your company access is restricted",
            });
        }

        // Include minimal company details if available
        const respUser = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
        };

        if (user.companyId) {
            const company = await companyModel.findById(user.companyId).select("companyName companyCode");
            if (company) {
                respUser.company = {
                    companyName: company.companyName,
                    companyCode: company.companyCode,
                };
            }
        }

        res.status(200).json({
            success: true,
            accessToken: generateAccessToken(user),
            refreshToken: generateRefreshToken(user),
            user: respUser,
        });
    } catch (error) {
        console.error("loginUser error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GET PROFILE
====================================================== */

export const getProfile = async (req, res) => {
    try {
        if (!req.user && !req.company) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }

        const user = req.user ? (req.user.toObject ? req.user.toObject() : req.user) : null;

        // If user has companyId, populate minimal company details
        if (user && user.companyId) {
            const company = await companyModel.findById(user.companyId).select("companyName companyCode");
            if (company) {
                user.company = {
                    companyName: company.companyName,
                    companyCode: company.companyCode,
                };
            }
        }

        // If no req.user but req.company exists, return owner-style profile
        if (!user && req.company) {
            const ownerObj = {
                id: req.company._id,
                name: req.company.ownerName || "Company Owner",
                email: req.company.ownerEmail || null,
                role: "company",
                company: {
                    companyName: req.company.companyName,
                    companyCode: req.company.companyCode,
                },
            };
            return res.status(200).json({ success: true, user: ownerObj });
        }

        return res.status(200).json({ success: true, user });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
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
            { returnDocument: 'after', runValidators: true }
        );

        res.status(200).json({
            success: true,
            user: updatedUser,
        });
    } catch (error) {
        console.error("updateProfile error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
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
        console.error("setPassword error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GOOGLE LOGIN
====================================================== */

const verifyGoogleCode = async (code) => {
    try {
        // Exchange authorization code for access token
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
                redirect_uri: "postmessage",
                grant_type: "authorization_code",
            }),
        });

        if (!response.ok) {
            // Helpful debug output during development to understand 401/400 responses
            const txt = await response.text().catch(() => "<no-body>");
            console.error("Google token endpoint error:", response.status, txt);
            return null;
        }

        const tokenData = await response.json();
        // Log token response in non-production for debugging token-exchange issues
        if (process.env.NODE_ENV !== "production") {
            console.debug("Google token response:", tokenData);
        }

        const accessToken = tokenData.access_token;

        // Get user info using access token
        const userResponse = await fetch(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        if (!userResponse.ok) return null;

        const payload = await userResponse.json();
        return payload;
    } catch (error) {
        console.error("Code verification error:", error);
        return null;
    }
};

export const googleLogin = async (req, res, next) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Authorization code required",
            });
        }

        const payload = await verifyGoogleCode(code);

        if (!payload?.email) {
            return res.status(401).json({
                success: false,
                message: "Invalid Google code",
            });
        }

        const email = payload.email.toLowerCase();

        let user = await User.findOne({ email });

        // ✅ EXISTING USER WITH COMPANY
        if (user && user.companyId) {
            if (!user.emailVerified) {
                user.emailVerified = true;
                await user.save();
            }

            // Check if company is restricted
            const restrictionCheck = await isCompanyRestricted(user.companyId);
            if (restrictionCheck.restricted) {
                return res.status(403).json({
                    success: false,
                    message: restrictionCheck.reason || "Your company access is restricted"
                });
            }

            // Direct login
            return res.status(200).json({
                success: true,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    companyId: user.companyId,
                },
                accessToken: generateAccessToken(user),
                refreshToken: generateRefreshToken(user),
            });
        }

        // ❌ NEW USER - REQUIRE COMPANY CODE
        if (!user) {
            return res.status(200).json({
                success: false,
                companyCodeRequired: true,
                googleData: {
                    email,
                    name: payload.name || "Google User",
                    picture: payload.picture || "",
                },
                message: "Please enter your company code to continue",
            });
        }

        // ⚠️ EXISTING USER WITHOUT COMPANY - REQUIRE COMPANY CODE
        return res.status(200).json({
            success: false,
            companyCodeRequired: true,
            userId: user._id,
            googleData: {
                email,
                name: user.name,
                picture: user.avatar || "",
            },
            message: "Please enter your company code to continue",
        });
    } catch (error) {
        console.error("googleLogin error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   COMPLETE GOOGLE REGISTRATION WITH COMPANY CODE
====================================================== */

export const completeGoogleRegistration = async (req, res, next) => {
    try {
        const { email, name, companyCode } = req.body;

        if (!email || !companyCode) {
            return res.status(400).json({
                success: false,
                message: "Email and company code required",
            });
        }

        // Find company by code
        const company = await companyModel.findOne({
            companyCode: companyCode.toUpperCase(),
            isActive: true
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: "Invalid or inactive company code",
            });
        }

        // Check company plan status
        if (company.planStatus !== "active") {
            return res.status(403).json({
                success: false,
                message: "Company plan is not active. Contact your admin.",
            });
        }

        let user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Create new user with company
            user = await User.create({
                name: name || "Google User",
                email: email.toLowerCase(),
                provider: "google",
                isVerified: true,
                companyId: company._id,
                role: "user",
            });
        } else if (!user.companyId) {
            // Add company to existing user
            user.companyId = company._id;
            user.provider = "google";
            user.isVerified = true;
            await user.save();
        }

        return res.status(200).json({
            success: true,
            message: "Login Successful! 🚀",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                companyId: user.companyId,
            },
            accessToken: generateAccessToken(user),
            refreshToken: generateRefreshToken(user),
        });
    } catch (error) {
        console.error("completeGoogleRegistration error:", error?.message || error);
        return res.status(500).json({
            success: false,
            message: error?.message || "Failed to complete registration"
        });
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
        <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
            <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                
                <h2 style="color:#e67e22;">
                    Reset Your Password
                </h2>

                <p>Hi <strong>${user.name || "User"}</strong>,</p>

                <p>
                    We received a request to reset your password on <strong>Product Expiry Reminder</strong>.
                </p>

                <div style="text-align:center;margin:25px 0;">
                    <span style="font-size:28px;letter-spacing:6px;
                    font-weight:bold;color:#e67e22;">
                        ${otp}
                    </span>
                </div>

                <p>
                    This OTP will expire in <strong>${OTP_EXPIRES_MINUTES} minutes</strong>.
                </p>

                <div style="margin:25px 0;padding:15px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px;">
                    <p style="margin:0;"><strong>⚠️ Important:</strong> If you did not request this password reset, please ignore this email.</p>
                </div>

                <p>
                    For security reasons, never share your OTP with anyone.
                </p>

                <hr style="margin:25px 0;" />

                <p style="font-size:12px;color:#888;">
                    © ${new Date().getFullYear()} Product Expiry Reminder. All rights reserved.
                </p>

            </div>
        </div>
        `;

        await sendMail({
            to: user.email,
            subject: "Password Reset Request – Product Expiry Reminder",
            html,
        });

        res.status(200).json({
            success: true,
            message: "OTP sent to email",
        });
    } catch (error) {
        console.error("forgotPassword error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
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
        console.error("verifyForgotOtp error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
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

        // Send confirmation email
        const confirmHtml = `
        <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
            <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                
                <h2 style="color:#4CAF50;">
                    ✅ Password Updated Successfully
                </h2>

                <p>Hi <strong>${user.name || "User"}</strong>,</p>

                <p>
                    Your password on <strong>Product Expiry Reminder</strong>
                    has been successfully updated.
                </p>

                <div style="margin:20px 0;">
                    <a href="https://product-expiry-frontend.vercel.app"
                       style="background:#4CAF50;color:white;padding:12px 20px;
                       text-decoration:none;border-radius:5px;display:inline-block;">
                       Login to Dashboard
                    </a>
                </div>

                <p>
                    If you did not perform this action,
                    please contact support immediately.
                </p>

                <hr style="margin:25px 0;" />

                <p style="font-size:12px;color:#888;">
                    © ${new Date().getFullYear()} Product Expiry Reminder.
                    All rights reserved.
                </p>

            </div>
        </div>
        `;

        await sendMail({
            to: user.email,
            subject: "Password Updated Successfully – Product Expiry Reminder",
            html: confirmHtml,
        });

        res.status(200).json({
            success: true,
            message: "Password reset successfully",
        });
    } catch (error) {
        console.error("resetPassword error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
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
        console.error("changePassword error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};
