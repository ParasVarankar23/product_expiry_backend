import jwt from "jsonwebtoken";
import SuperAdmin from "../../models/superadmin/superadmin.model.js";
import {
    sendMail,
} from "../../utils/mailer.utils.js";
import { generatePassword } from "../../utils/passwordGenerator.utils.js";
// ===== Helper Functions =====
// Generate a unique company code (e.g., COMP-XXXX)
function generateCompanyCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return `COMP-${code}`;
}

// 1️⃣ SUPERADMIN: CREATE COMPANY


function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getOtpExpiry() {
    return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

function generateToken(superadmin, sessionId) {
    return jwt.sign(
        { id: superadmin._id, sessionId: sessionId },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}


/* ======================================================
   1️⃣ REGISTER SUPER ADMIN (SEND OTP)
====================================================== */

export const registerSuperAdmin = async (req, res) => {
    try {
        const { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "Name and email are required"
            });
        }

        const existing = await SuperAdmin.findOne({
            email: email.toLowerCase()
        });

        if (existing && existing.isVerified) {
            return res.status(400).json({
                success: false,
                message: "Email already registered"
            });
        }

        const otp = generateOtp();
        const otpExpiry = getOtpExpiry();

        let superadmin;

        if (!existing) {
            superadmin = await SuperAdmin.create({
                name,
                email: email.toLowerCase(),
                otp,
                otpExpiry
            });
        } else {
            existing.name = name;
            existing.otp = otp;
            existing.otpExpiry = otpExpiry;
            await existing.save();
            superadmin = existing;
        }

        // PROFESSIONAL OTP EMAIL
        await sendMail({
            to: email,
            subject: "Verify Your Email – Product Expiry",
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    <h2>Welcome to <span style="color:#4CAF50;">Product Expiry</span></h2>
                    <p>Hi <strong>${name}</strong>,</p>
                    <p>Please verify your email using the OTP below:</p>

                    <div style="text-align:center;margin:25px 0;">
                        <span style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#4CAF50;">
                            ${otp}
                        </span>
                    </div>

                    <p>This OTP is valid for 10 minutes.</p>
                    <hr/>
                    <p style="font-size:12px;color:#888;">
                        © ${new Date().getFullYear()} Product Expiry. All rights reserved.
                    </p>
                </div>
            </div>
            `
        });

        return res.status(201).json({
            success: true,
            message: "OTP sent successfully"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/* ======================================================
   2️⃣ VERIFY OTP & SEND PASSWORD
====================================================== */

export const verifySuperAdminOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const superadmin = await SuperAdmin.findOne({
            email: email.toLowerCase()
        }).select("+otp +otpExpiry");

        if (!superadmin) {
            return res.status(404).json({
                success: false,
                message: "Super Admin not found"
            });
        }

        if (!superadmin.isOTPValid(String(otp))) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }

        // Generate Password
        const generatedPassword = generatePassword(superadmin.name);

        superadmin.password = generatedPassword;
        superadmin.isVerified = true;
        superadmin.otp = undefined;
        superadmin.otpExpiry = undefined;

        await superadmin.save();

        // SEND PROFESSIONAL SUCCESS EMAIL WITH PASSWORD
        await sendMail({
            to: superadmin.email,
            subject: "Registration Successful – Product Expiry",
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    
                    <h2 style="color:#4CAF50;">🎉 Registration Successful</h2>

                    <p>Hi <strong>${superadmin.name}</strong>,</p>

                    <p>Your Super Admin account has been successfully verified.</p>

                    <p><strong>Your Login Details:</strong></p>

                    <p>Email: ${superadmin.email}</p>
                    <p>Password: <strong>${generatedPassword}</strong></p>

                    <div style="margin:20px 0;">
                        <a href="https://product-expiry-superadmin.vercel.app"
                           style="background:#4CAF50;color:white;padding:10px 20px;
                           text-decoration:none;border-radius:5px;">
                           Login Now
                        </a>
                    </div>

                    <p>For security reasons, please change your password after login.</p>

                    <hr/>
                    <p style="font-size:12px;color:#888;">
                        © ${new Date().getFullYear()} Product Expiry. All rights reserved.
                    </p>

                </div>
            </div>
            `
        });

        return res.status(200).json({
            success: true,
            message: "Account verified successfully",
            token: generateToken(superadmin)
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// 3️⃣ LOGIN (NORMAL)
export const loginSuperAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password required" });
        }
        const superadmin = await SuperAdmin.findOne({ email: email.toLowerCase(), isVerified: true }).select("+password +sessions");
        if (!superadmin || !superadmin.password) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const match = await superadmin.comparePassword(password);
        if (!match) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // Generate session
        const sessionId = superadmin.generateSessionId();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const userAgent = req.headers['user-agent'] || null;
        const ipAddress = req.ip || req.connection.remoteAddress || null;

        await superadmin.addSession(sessionId, expiresAt, userAgent, ipAddress);

        const token = generateToken(superadmin, sessionId);
        return res.status(200).json({
            success: true,
            token,
            superadmin: {
                id: superadmin._id,
                name: superadmin.name,
                email: superadmin.email,
                phoneNumber: superadmin.phoneNumber,
                address: superadmin.address,
                avatar: superadmin.avatar,
                provider: superadmin.provider,
                role: superadmin.role,
                isVerified: superadmin.isVerified,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 4️⃣ LOGIN WITH GOOGLE
export const googleLoginSuperAdmin = async (req, res) => {
    try {
        const { email, name, picture, googleId } = req.body;
        if (!email || !name || !googleId) {
            return res.status(400).json({ success: false, message: "Missing Google profile data" });
        }
        let superadmin = await SuperAdmin.findOne({ email: email.toLowerCase() }).select("+sessions");
        if (!superadmin) {
            superadmin = await SuperAdmin.create({
                name,
                email: email.toLowerCase(),
                avatar: picture || "",
                googleId,
                provider: "google",
                isVerified: true,
            });
        } else if (!superadmin.isVerified) {
            superadmin.isVerified = true;
            superadmin.provider = "google";
            superadmin.googleId = googleId;
            if (picture) superadmin.avatar = picture;
            await superadmin.save();
        }

        // Generate session
        const sessionId = superadmin.generateSessionId();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const userAgent = req.headers['user-agent'] || null;
        const ipAddress = req.ip || req.connection.remoteAddress || null;

        await superadmin.addSession(sessionId, expiresAt, userAgent, ipAddress);

        const token = generateToken(superadmin, sessionId);
        return res.status(200).json({
            success: true,
            token,
            superadmin: {
                id: superadmin._id,
                name: superadmin.name,
                email: superadmin.email,
                phoneNumber: superadmin.phoneNumber,
                address: superadmin.address,
                avatar: superadmin.avatar,
                provider: superadmin.provider,
                role: superadmin.role,
                isVerified: superadmin.isVerified,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ======================================================
   4️⃣ FORGOT PASSWORD (SEND OTP)
====================================================== */

export const forgotSuperAdminPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const superadmin = await SuperAdmin.findOne({
            email: email.toLowerCase(),
            isVerified: true
        });

        if (!superadmin) {
            return res.status(404).json({
                success: false,
                message: "SuperAdmin not found"
            });
        }

        const otp = generateOtp();
        superadmin.otp = otp;
        superadmin.otpExpiry = getOtpExpiry();
        await superadmin.save();

        await sendMail({
            to: email,
            subject: "Password Reset Request – Product Expiry",
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    <h2 style="color:#e67e22;">Reset Your Password</h2>
                    <p>Hi <strong>${superadmin.name}</strong>,</p>
                    <p>Use the OTP below to reset your password:</p>
                    <div style="text-align:center;margin:25px 0;">
                        <span style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#e67e22;">
                            ${otp}
                        </span>
                    </div>
                    <p>This OTP is valid for 10 minutes.</p>
                    <hr/>
                    <p style="font-size:12px;color:#888;">
                        © ${new Date().getFullYear()} Product Expiry
                    </p>
                </div>
            </div>
            `
        });

        return res.status(200).json({
            success: true,
            message: "OTP sent to email"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/* ======================================================
   5️⃣ VERIFY RESET OTP & UPDATE PASSWORD
====================================================== */

export const verifyResetOtp = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const superadmin = await SuperAdmin.findOne({
            email: email.toLowerCase(),
            isVerified: true
        }).select("+password +otp +otpExpiry");

        if (!superadmin || !superadmin.isOTPValid(String(otp))) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }

        superadmin.password = newPassword;
        superadmin.otp = undefined;
        superadmin.otpExpiry = undefined;

        await superadmin.save();

        await sendMail({
            to: superadmin.email,
            subject: "Password Updated Successfully – Product Expiry",
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    <h2 style="color:#4CAF50;">✅ Password Updated</h2>
                    <p>Hi <strong>${superadmin.name}</strong>,</p>
                    <p>Your password has been successfully updated.</p>
                    <a href="https://product-expiry-superadmin.vercel.app"
                       style="background:#4CAF50;color:white;padding:10px 20px;
                       text-decoration:none;border-radius:5px;">
                       Login Now
                    </a>
                    <hr/>
                    <p style="font-size:12px;color:#888;">
                        © ${new Date().getFullYear()} Product Expiry
                    </p>
                </div>
            </div>
            `
        });

        return res.status(200).json({
            success: true,
            message: "Password reset successfully"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// 6️⃣ CHANGE PASSWORD (Protected)
export const changeSuperAdminPassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Old and new password required" });
        }
        const superadmin = await SuperAdmin.findById(req.superadmin._id).select("+password");
        if (!superadmin || !superadmin.password) {
            return res.status(404).json({ success: false, message: "SuperAdmin not found or no password set" });
        }
        const isMatch = await superadmin.comparePassword(oldPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Old password is incorrect" });
        }
        superadmin.password = newPassword;
        await superadmin.save();
        return res.status(200).json({ success: true, message: "Password changed successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 7️⃣ UPDATE PROFILE (Protected)
export const updateSuperAdminProfile = async (req, res) => {
    try {
        const { name, phoneNumber, address, avatar } = req.body;
        const updates = {};
        if (name) updates.name = name;
        if (phoneNumber) updates.phoneNumber = phoneNumber;
        if (address) updates.address = address;
        if (avatar) updates.avatar = avatar;
        // Do not allow email or password update here
        const updated = await SuperAdmin.findByIdAndUpdate(
            req.superadmin._id,
            updates,
            { returnDocument: 'after', runValidators: true }
        );
        return res.status(200).json({ success: true, superadmin: updated });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 8️⃣ LOGOUT (Protected)
export const logoutSuperAdmin = async (req, res) => {
    try {
        const superadmin = await SuperAdmin.findById(req.superadmin._id).select("+sessions");
        if (!superadmin) {
            return res.status(404).json({ success: false, message: "SuperAdmin not found" });
        }

        // Remove the current session
        await superadmin.removeSession(req.sessionId);

        return res.status(200).json({ success: true, message: "Logged out successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 9️⃣ GET PROFILE (Protected)
export const getSuperAdminProfile = async (req, res) => {
    try {
        // req.superadmin is already populated by protectSuperAdmin middleware
        // It's fetched from database and includes the role field
        const superadmin = req.superadmin;

        return res.status(200).json({
            success: true,
            superadmin: {
                id: superadmin._id,
                name: superadmin.name,
                email: superadmin.email,
                phoneNumber: superadmin.phoneNumber,
                address: superadmin.address,
                avatar: superadmin.avatar,
                provider: superadmin.provider,
                role: superadmin.role,
                isVerified: superadmin.isVerified,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};