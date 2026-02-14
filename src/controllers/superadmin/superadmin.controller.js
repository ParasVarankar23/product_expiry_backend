import jwt from "jsonwebtoken";
import SuperAdmin from "../../models/superadmin/superadmin.model.js";
import {
    sendGeneratedPassword,
    sendOTPEmail,
    sendResetOTP,
} from "../../utils/mailer.utils.js";
import { generatePassword } from "../../utils/passwordGenerator.utils.js";

// ===== Helper Functions =====
// Generate a unique company code (e.g., COMP-XXXX)
import companyModel from "../../models/users/company.model.js";
function generateCompanyCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return `COMP-${code}`;
}

// 1️⃣ SUPERADMIN: CREATE COMPANY
import User from "../../models/users/user.model.js";


function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getOtpExpiry() {
    return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

function generateToken(superadmin) {
    return jwt.sign(
        { id: superadmin._id, role: "superadmin" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

export const createCompany = async (req, res) => {
    try {
        const { ownerName, companyName, ownerEmail } = req.body;
        if (!ownerName || !companyName || !ownerEmail) {
            return res.status(400).json({ success: false, message: "Owner name, company name, and owner email are required" });
        }
        // Only allow superadmin (assume req.superadmin._id is set by auth middleware)
        const createdBy = req.superadmin?._id;
        if (!createdBy) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // Generate unique company code
        let companyCode;
        let exists = true;
        while (exists) {
            companyCode = generateCompanyCode();
            exists = await companyModel.findOne({ companyCode });
        }
        // Create company
        const company = await companyModel.create({
            companyName,
            companyCode,
            ownerName,
            ownerEmail,
            createdBy
        });
        // Generate password for owner (admin)
        const password = generatePassword(ownerName);
        // Create owner as first admin user for the company
        const adminUser = await User.create({
            name: ownerName,
            email: ownerEmail.toLowerCase(),
            password,
            role: "admin",
            companyId: company._id,
            isVerified: true
        });
        // Notify owner via email with company code and password
        await sendGeneratedPassword(ownerEmail, password, companyCode);
        return res.status(201).json({ success: true, companyCode: company.companyCode, message: "Company created and owner notified via email." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 1️⃣ REGISTER SUPER ADMIN (OTP BASED)
export const registerSuperAdmin = async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name || !email) {
            return res.status(400).json({ success: false, message: "Name and email are required" });
        }
        const existing = await SuperAdmin.findOne({ email: email.toLowerCase() });
        if (existing && existing.isVerified) {
            return res.status(400).json({ success: false, message: "Email already exists" });
        }
        const otp = generateOtp();
        const otpExpiry = getOtpExpiry();
        let superadmin = existing;
        if (!superadmin) {
            superadmin = await SuperAdmin.create({ name, email: email.toLowerCase(), otp, otpExpiry });
        } else {
            superadmin.name = name;
            superadmin.otp = otp;
            superadmin.otpExpiry = otpExpiry;
            await superadmin.save();
        }
        await sendOTPEmail(email, otp);
        return res.status(201).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 2️⃣ VERIFY OTP & COMPLETE REGISTRATION
export const verifySuperAdminOtp = async (req, res) => {

    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: "Email and OTP are required" });
        }
        const superadmin = await SuperAdmin.findOne({ email: email.toLowerCase() }).select("+otp +otpExpiry");
        if (!superadmin) {
            return res.status(404).json({ success: false, message: "SuperAdmin not found" });
        }
        if (!superadmin.isOTPValid(otp)) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }
        const password = generatePassword(superadmin.name);
        superadmin.password = password;
        superadmin.isVerified = true;
        superadmin.otp = undefined;
        superadmin.otpExpiry = undefined;
        await superadmin.save();
        await sendGeneratedPassword(email, password);
        return res.status(200).json({ success: true, message: "Registration complete. Password sent to email." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 3️⃣ LOGIN (NORMAL)
export const loginSuperAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password required" });
        }
        const superadmin = await SuperAdmin.findOne({ email: email.toLowerCase(), isVerified: true }).select("+password");
        if (!superadmin || !superadmin.password) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const match = await superadmin.comparePassword(password);
        if (!match) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        const token = generateToken(superadmin);
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
        let superadmin = await SuperAdmin.findOne({ email: email.toLowerCase() });
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
        const token = generateToken(superadmin);
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
                isVerified: superadmin.isVerified,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 5️⃣ FORGOT PASSWORD
export const forgotSuperAdminPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }
        const superadmin = await SuperAdmin.findOne({ email: email.toLowerCase(), isVerified: true });
        if (!superadmin) {
            return res.status(404).json({ success: false, message: "SuperAdmin not found" });
        }
        const otp = generateOtp();
        const otpExpiry = getOtpExpiry();
        superadmin.otp = otp;
        superadmin.otpExpiry = otpExpiry;
        await superadmin.save();
        await sendResetOTP(email, otp);
        return res.status(200).json({ success: true, message: "OTP sent to email" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
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
            { new: true, runValidators: true }
        );
        return res.status(200).json({ success: true, superadmin: updated });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};