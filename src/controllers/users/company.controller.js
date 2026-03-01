import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Payment from "../../models/superadmin/payment.model.js";
import companyModel from "../../models/users/company.model.js";
import User from "../../models/users/user.model.js";
import { generateCompanyCode } from "../../utils/companyCode.utils.js";
import { sendMail } from "../../utils/mailer.utils.js";
import { generatePassword } from "../../utils/passwordGenerator.utils.js";
import razorpay from "../../utils/razorpay.js";
const PLAN_PRICES = {
    free: 0,
    basic: 999,
    premium: 1999
};

const PLAN_USER_LIMITS = {
    free: 50,
    basic: 250,
    premium: 10000
};

const generateAccessToken = (user) =>
    // For regular users created under a company, include only id in token.
    jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "60m" });

const generateRefreshToken = (user) =>
    jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

/* ======================================================
   GOOGLE LOGIN (COMPANY/OWNER + COMPANY USERS)
   Behavior: If Google email matches a company owner -> login as owner.
             Otherwise behave like user google login: if existing user with company -> direct login,
             else request company code to complete registration.
====================================================== */

const verifyGoogleCode = async (code) => {
    try {
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
            const txt = await response.text().catch(() => "<no-body>");
            console.error("Google token endpoint error:", response.status, txt);
            return null;
        }

        const tokenData = await response.json();
        const accessToken = tokenData.access_token;

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

export const googleLoginCompany = async (req, res, next) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: "Authorization code required" });
        }

        const payload = await verifyGoogleCode(code);

        if (!payload?.email) {
            return res.status(401).json({ success: false, message: "Invalid Google code" });
        }

        const email = payload.email.toLowerCase();

        // 1) If this email matches a company owner -> owner login
        const ownerCompany = await companyModel.findOne({ ownerEmail: email });
        if (ownerCompany) {
            const accessToken = jwt.sign({ id: ownerCompany._id, type: "owner" }, process.env.JWT_SECRET, { expiresIn: "60m" });
            const refreshToken = jwt.sign({ id: ownerCompany._id, type: "owner" }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

            return res.status(200).json({
                success: true,
                owner: {
                    id: ownerCompany._id,
                    name: ownerCompany.ownerName,
                    email: ownerCompany.ownerEmail,
                    role: ownerCompany.ownerRole,
                },
                company: {
                    id: ownerCompany._id,
                    companyName: ownerCompany.companyName,
                    companyCode: ownerCompany.companyCode,
                    plan: ownerCompany.plan,
                    planStatus: ownerCompany.planStatus,
                    isActive: ownerCompany.isActive,
                },
                accessToken,
                refreshToken,
            });
        }

        // 2) Fallback to user behavior (users under companies)
        let user = await User.findOne({ email });

        // EXISTING USER WITH COMPANY -> direct login
        if (user && user.companyId) {
            if (!user.isVerified) {
                user.isVerified = true;
                await user.save();
            }

            const restrictionCheck = await isCompanyRestricted(user.companyId);
            if (restrictionCheck.restricted) {
                return res.status(403).json({ success: false, message: restrictionCheck.reason || "Your company access is restricted" });
            }

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

        // NEW USER - ask for company code
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

        // EXISTING USER WITHOUT COMPANY - ask for company code
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
        console.error("company googleLogin error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

export const completeGoogleRegistrationCompany = async (req, res, next) => {
    try {
        const { email, name, companyCode } = req.body;

        if (!email || !companyCode) {
            return res.status(400).json({ success: false, message: "Email and company code required" });
        }

        // Find company by code
        const company = await companyModel.findOne({ companyCode: companyCode.toUpperCase(), isActive: true });

        if (!company) {
            return res.status(404).json({ success: false, message: "Invalid or inactive company code" });
        }

        if (company.planStatus !== "active") {
            return res.status(403).json({ success: false, message: "Company plan is not active. Contact your admin." });
        }

        let user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            user = await User.create({
                name: name || "Google User",
                email: email.toLowerCase(),
                provider: "google",
                isVerified: true,
                companyId: company._id,
                role: "user",
            });
        } else if (!user.companyId) {
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
        console.error("completeGoogleRegistrationCompany error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Failed to complete registration" });
    }
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getOtpExpiry = () => new Date(Date.now() + 10 * 60 * 1000);

export const createCompany = async (req, res) => {
    try {
        const { ownerName, ownerEmail, companyName, plan } = req.body;

        if (!ownerName || !ownerEmail || !companyName || !plan) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        // Check duplicate owner email
        const existingOwner = await companyModel.findOne({ ownerEmail });
        if (existingOwner) {
            return res.status(400).json({
                success: false,
                message: "Owner email already exists."
            });
        }

        // Generate unique company code
        let companyCode;
        let exists = true;

        while (exists) {
            companyCode = generateCompanyCode();
            exists = await companyModel.findOne({ companyCode });
        }

        /* ======================================================
           FREE PLAN (ACTIVE IMMEDIATELY)
        ====================================================== */

        if (plan === "free") {
            // Generate Owner Password first
            const password = generatePassword(ownerName);

            const company = await companyModel.create({
                companyName,
                companyCode,
                ownerName,
                ownerEmail,
                ownerPassword: password,
                plan,
                planStatus: "active",
                planStartDate: new Date(),
                planEndDate: new Date(
                    new Date().setFullYear(new Date().getFullYear() + 1)
                ),
                userLimit: PLAN_USER_LIMITS[plan],
                createdBy: req.superadmin?._id || null
            });

            /* ======================================================
               PROFESSIONAL EMAIL TO OWNER
            ====================================================== */

            await sendMail({
                to: ownerEmail,
                subject: `Welcome to Product Expiry Reminder – ${companyName} Created Successfully`,
                html: `
                <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                    <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                        
                        <h2 style="color:#4CAF50;">
                            🎉 Company Successfully Created
                        </h2>

                        <p>Hi <strong>${ownerName}</strong>,</p>

                        <p>
                            Your company <strong>${companyName}</strong> has been successfully created on 
                            <strong>Product Expiry Reminder</strong>.
                        </p>

                        <h3 style="margin-top:20px;">📌 Company Details</h3>

                        <p><strong>Company Name:</strong> ${companyName}</p>
                        <p><strong>Company Code:</strong> ${companyCode}</p>
                        <p><strong>Plan:</strong> ${plan.toUpperCase()}</p>
                        <p><strong>Status:</strong> Active</p>

                        <h3 style="margin-top:20px;">🔐 Owner Login Details</h3>

                        <p><strong>Email:</strong> ${ownerEmail}</p>
                        <p><strong>Password:</strong> ${password}</p>

                        <div style="margin:25px 0;">
                            <a href="https://product-expiry-frontend.vercel.app"
                               style="background:#4CAF50;color:white;padding:12px 20px;
                               text-decoration:none;border-radius:5px;">
                               Login to Dashboard
                            </a>
                        </div>

                        <p>
                            For security reasons, please change your password after first login.
                        </p>

                        <hr style="margin:25px 0;" />

                        <p style="font-size:13px;color:#555;">
                            <strong>Created By:</strong> ${req.superadmin?.name || "SuperAdmin"}
                        </p>

                        <p style="font-size:12px;color:#888;">
                            © ${new Date().getFullYear()} Product Expiry Reminder. All rights reserved.
                        </p>

                    </div>
                </div>
                `
            });

            return res.status(201).json({
                success: true,
                paymentRequired: false,
                companyCode
            });
        }

        /* ======================================================
           PAID PLAN (PENDING PAYMENT)
        ====================================================== */

        // Generate Owner Password for paid plan too
        const password = generatePassword(ownerName);

        const company = await companyModel.create({
            companyName,
            companyCode,
            ownerName,
            ownerEmail,
            ownerPassword: password,
            plan,
            planStatus: "pending",
            userLimit: PLAN_USER_LIMITS[plan],
            createdBy: req.superadmin?._id || null
        });

        /* ======================================================
           SEND WELCOME EMAIL WITH PASSWORD (PAID PLAN)
        ====================================================== */

        await sendMail({
            to: ownerEmail,
            subject: `Welcome to Product Expiry Reminder – ${companyName} Created Successfully`,
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    
                    <h2 style="color:#4CAF50;">
                        🎉 Company Successfully Created
                    </h2>

                    <p>Hi <strong>${ownerName}</strong>,</p>

                    <p>
                        Your company <strong>${companyName}</strong> has been successfully created on 
                        <strong>Product Expiry Reminder</strong>.
                    </p>

                    <h3 style="margin-top:20px;">📌 Company Details</h3>

                    <p><strong>Company Name:</strong> ${companyName}</p>
                    <p><strong>Company Code:</strong> ${companyCode}</p>
                    <p><strong>Plan:</strong> ${plan.toUpperCase()}</p>
                    <p><strong>Status:</strong> Pending Payment</p>
                    <p><strong>User Limit:</strong> ${PLAN_USER_LIMITS[plan]} users</p>

                    <h3 style="margin-top:20px;">🔐 Owner Login Details</h3>

                    <p><strong>Email:</strong> ${ownerEmail}</p>
                    <p><strong>Password:</strong> <span style="font-weight:bold;color:#d32f2f;">${password}</span></p>

                    <div style="margin:25px 0;padding:15px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px;">
                        <p style="margin:0;"><strong>⚠️ Important:</strong> Complete your payment to activate your account. You can login and explore the platform while payment is pending.</p>
                    </div>

                    <div style="margin:25px 0;">
                        <a href="https://product-expiry-frontend.vercel.app"
                           style="background:#4CAF50;color:white;padding:12px 20px;
                           text-decoration:none;border-radius:5px;display:inline-block;margin-right:10px;">
                           Login to Dashboard
                        </a>
                    </div>

                    <p>
                        For security reasons, please change your password after first login.
                    </p>

                    <hr style="margin:25px 0;" />

                    <p style="font-size:13px;color:#555;">
                        <strong>Created By:</strong> ${req.superadmin?.name || "SuperAdmin"}
                    </p>

                    <p style="font-size:12px;color:#888;">
                        © ${new Date().getFullYear()} Product Expiry Reminder. All rights reserved.
                    </p>

                </div>
            </div>
            `
        });

        // Create Razorpay Order
        const amount = PLAN_PRICES[plan] * 100; // Convert to paise
        const shortReceipt = `${company._id.toString().slice(-12)}_${Date.now().toString().slice(-10)}`;

        const razorpayOrder = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: shortReceipt,
        });

        // Save payment record
        await Payment.create({
            companyId: company._id,
            razorpayOrderId: razorpayOrder.id,
            amount,
            currency: "INR",
            plan,
            status: "created"
        });

        return res.status(201).json({
            success: true,
            paymentRequired: true,
            companyId: company._id,
            companyCode,
            orderId: razorpayOrder.id,
            amount: PLAN_PRICES[plan],
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Create Company Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to create company",
            error: process.env.NODE_ENV === "development" ? error.toString() : undefined
        });
    }
};

/* ========================================
   2️⃣ DASHBOARD CONTROLLER
======================================== */
export const getDashboardStats = async (req, res) => {
    try {
        // Count total companies
        const totalCompanies = await companyModel.countDocuments();

        // Count companies by plan status
        const activeCompanies = await companyModel.countDocuments({ planStatus: "active" });
        const inactiveCompanies = await companyModel.countDocuments({ planStatus: "inactive" });
        const suspendedCompanies = await companyModel.countDocuments({ planStatus: "suspended" });
        const pendingCompanies = await companyModel.countDocuments({ planStatus: "pending" });

        // Count total users
        const totalUsers = await User.countDocuments();

        // Count active users (verified users)
        const totalActiveUsers = await User.countDocuments({ isVerified: true });

        // Count users by role
        const adminUsers = await User.countDocuments({ role: "admin" });
        const managerUsers = await User.countDocuments({ role: "manager" });
        const userUsers = await User.countDocuments({ role: "user" });

        // Count companies by plan
        const companiesByPlan = await companyModel.aggregate([
            { $group: { _id: "$plan", count: { $sum: 1 } } }
        ]);

        const planStats = {
            free: 0,
            basic: 0,
            premium: 0
        };

        companiesByPlan.forEach(item => {
            if (planStats.hasOwnProperty(item._id)) {
                planStats[item._id] = item.count;
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                companies: {
                    total: totalCompanies,
                    active: activeCompanies,
                    inactive: inactiveCompanies,
                    suspended: suspendedCompanies,
                    pending: pendingCompanies,
                    byPlan: planStats
                },
                users: {
                    total: totalUsers,
                    active: totalActiveUsers,
                    byRole: {
                        admin: adminUsers,
                        manager: managerUsers,
                        user: userUsers
                    }
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   OWNER AUTH: LOGIN
======================================== */
export const loginCompanyOwner = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password required" });
        }

        // Find company by owner email
        const company = await companyModel.findOne({ ownerEmail: email.toLowerCase() }).select("+ownerPassword");
        if (!company || !company.ownerPassword) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // Compare owner password
        const match = await company.comparePassword(password);
        if (!match) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const restrictionCheck = await isCompanyRestricted(company._id);
        if (restrictionCheck.restricted) {
            return res.status(403).json({
                success: false,
                message: restrictionCheck.reason || "Your company access is restricted",
            });
        }

        // Generate tokens using company ID
        const accessToken = jwt.sign({ id: company._id, type: "owner" }, process.env.JWT_SECRET, { expiresIn: "60m" });
        const refreshToken = jwt.sign({ id: company._id, type: "owner" }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

        return res.status(200).json({
            success: true,
            accessToken,
            refreshToken,
            owner: {
                id: company._id,
                name: company.ownerName,
                email: company.ownerEmail,
                role: company.ownerRole,
            },
            company: {
                id: company._id,
                companyName: company.companyName,
                companyCode: company.companyCode,
                plan: company.plan,
                planStatus: company.planStatus,
                isActive: company.isActive,
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   OWNER AUTH: GET PROFILE (PROTECTED)
======================================== */
export const getCompanyOwnerProfile = async (req, res) => {
    try {
        // req.company is set by protectCompanyOwner middleware
        if (!req.company) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        return res.status(200).json({
            success: true,
            owner: {
                id: req.company._id,
                name: req.company.ownerName,
                email: req.company.ownerEmail,
                role: req.company.ownerRole,
            },
            company: {
                companyName: req.company.companyName,
                companyCode: req.company.companyCode,
                plan: req.company.plan,
                planStatus: req.company.planStatus,
                planEndDate: req.company.planEndDate
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


/* ========================================
   OWNER AUTH: UPDATE PROFILE (PROTECTED)
======================================== */
export const updateCompanyOwnerProfile = async (req, res) => {
    try {
        const { name, email } = req.body;

        // ❌ Prevent email change
        if (email) {
            return res.status(400).json({
                success: false,
                message: "Email cannot be changed"
            });
        }

        if (!req.company) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const updates = {};
        if (name) updates.ownerName = name;

        const updatedCompany = await companyModel.findByIdAndUpdate(
            req.company._id,
            updates,
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            owner: {
                id: updatedCompany._id,
                name: updatedCompany.ownerName,
                email: updatedCompany.ownerEmail,
                role: updatedCompany.ownerRole,
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/* ========================================
OWNER AUTH: CHANGE PASSWORD (PROTECTED)
======================================== */
export const changeCompanyOwnerPassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Old and new password required" });
        }

        if (!req.company) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const company = await companyModel.findById(req.company._id).select("+ownerPassword");
        if (!company || !company.ownerPassword) {
            return res.status(404).json({ success: false, message: "Company owner not found" });
        }

        const isMatch = await company.comparePassword(oldPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Old password is incorrect" });
        }

        company.ownerPassword = newPassword;
        await company.save();

        return res.status(200).json({ success: true, message: "Password changed successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   OWNER AUTH: FORGOT PASSWORD
======================================== */
export const forgotCompanyOwnerPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const company = await companyModel.findOne({
            ownerEmail: email.toLowerCase()
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: "Company not found"
            });
        }

        const otp = generateOtp();
        const otpExpiry = getOtpExpiry();

        company.otp = otp;
        company.otpExpiry = otpExpiry;
        await company.save();

        await sendMail({
            to: email,
            subject: "Password Reset Request – Product Expiry Reminder",
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    
                    <h2 style="color:#e67e22;">
                        Reset Your Owner Password
                    </h2>

                    <p>Hi <strong>${company.ownerName}</strong>,</p>

                    <p>
                        We received a request to reset your Company Owner password
                        for <strong>${company.companyName}</strong>.
                    </p>

                    <div style="text-align:center;margin:25px 0;">
                        <span style="font-size:28px;letter-spacing:6px;
                        font-weight:bold;color:#e67e22;">
                            ${otp}
                        </span>
                    </div>

                    <p>
                        This OTP will expire in <strong>10 minutes</strong>.
                    </p>

                    <p>
                        If you did not request this reset, please ignore this email.
                    </p>

                    <hr style="margin:25px 0;" />

                    <p style="font-size:12px;color:#888;">
                        © ${new Date().getFullYear()} Product Expiry Reminder. All rights reserved.
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

/* ========================================
   OWNER AUTH: RESET PASSWORD
======================================== */
export const resetCompanyOwnerPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email, OTP, and new password are required"
            });
        }

        const company = await companyModel.findOne({
            ownerEmail: email.toLowerCase()
        }).select("+otp +otpExpiry +ownerPassword");

        if (!company) {
            return res.status(404).json({
                success: false,
                message: "Company not found"
            });
        }

        if (
            !company.otp ||
            !company.otpExpiry ||
            company.otpExpiry < new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }

        if (String(otp) !== String(company.otp)) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });
        }

        // 🔐 Set new password (pre-save hook will handle hashing)
        company.ownerPassword = newPassword;

        company.otp = undefined;
        company.otpExpiry = undefined;

        await company.save();

        /* ===============================
           PROFESSIONAL SUCCESS EMAIL
        =============================== */

        await sendMail({
            to: company.ownerEmail,
            subject: "Password Updated Successfully – Product Expiry Reminder",
            html: `
            <div style="font-family: Arial; padding:30px; background:#f4f6f8;">
                <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:8px;">
                    
                    <h2 style="color:#4CAF50;">
                        ✅ Password Updated Successfully
                    </h2>

                    <p>Hi <strong>${company.ownerName}</strong>,</p>

                    <p>
                        Your password for <strong>${company.companyName}</strong>
                        has been successfully updated.
                    </p>

                    <div style="margin:20px 0;">
                        <a href="https://product-expiry-frontend.vercel.app"
                           style="background:#4CAF50;color:white;padding:12px 20px;
                           text-decoration:none;border-radius:5px;">
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

/* ========================================
   3️⃣ HELPER: CHECK COMPANY LOGIN RESTRICTION
======================================== */
export const isCompanyRestricted = async (companyId) => {
    try {
        const company = await companyModel.findById(companyId);
        if (!company) return { restricted: true, reason: "Company not found" };

        if (company.planStatus === "suspended") {
            return { restricted: true, reason: "Company is suspended" };
        }

        if (company.planStatus === "inactive") {
            return { restricted: true, reason: "Company is inactive" };
        }

        if (!company.isActive) {
            return { restricted: true, reason: "Company account is deactivated" };
        }

        return { restricted: false };
    } catch (error) {
        return { restricted: true, reason: error.message };
    }
};

/* ========================================
   4️⃣ GET ALL COMPANIES CONTROLLER
======================================== */
export const getAllCompanies = async (req, res) => {
    try {
        const { page = 1, limit = 10, plan, planStatus, search } = req.query;

        // Build filter object
        const filter = {};
        if (plan) filter.plan = plan;
        if (planStatus) filter.planStatus = planStatus;
        if (search) {
            filter.$or = [
                { companyName: { $regex: search, $options: "i" } },
                { ownerName: { $regex: search, $options: "i" } },
                { ownerEmail: { $regex: search, $options: "i" } },
                { companyCode: { $regex: search, $options: "i" } }
            ];
        }

        // Get total count for pagination
        const total = await companyModel.countDocuments(filter);

        // Aggregate to get companies with user counts
        const companies = await companyModel.aggregate([
            { $match: filter },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "companyId",
                    as: "users"
                }
            },
            {
                $addFields: {
                    totalUsers: { $size: "$users" }
                }
            },
            {
                $project: {
                    users: 0 // Remove the users array from output
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: parseInt(limit) }
        ]);

        return res.status(200).json({
            success: true,
            data: companies,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   5️⃣ UPDATE COMPANY PLAN CONTROLLER
======================================== */
export const updateCompanyPlan = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { plan, userLimit, planStatus, isActive } = req.body;

        // Validate companyId
        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company ID is required" });
        }

        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        // Prepare update object
        const updates = {};

        // Update plan if provided
        if (plan) {
            if (!["free", "basic", "premium"].includes(plan)) {
                return res.status(400).json({ success: false, message: "Invalid plan" });
            }
            updates.plan = plan;
        }

        // Update userLimit if provided
        if (userLimit !== undefined) {
            // If no userLimit provided, use default for the plan
            const planToUse = plan || company.plan;
            const defaultLimit = PLAN_USER_LIMITS[planToUse];

            // If reducing userLimit, check if it's below current user count
            if (userLimit < defaultLimit) {
                const currentUserCount = await User.countDocuments({ companyId });
                if (userLimit < currentUserCount) {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot reduce user limit below current user count (${currentUserCount} users)`
                    });
                }
            }
            updates.userLimit = userLimit;
        } else if (plan) {
            // If plan changed but no custom userLimit, use default
            updates.userLimit = PLAN_USER_LIMITS[plan];
        }

        // Update planStatus if provided
        if (planStatus) {
            if (!["active", "pending", "suspended", "inactive"].includes(planStatus)) {
                return res.status(400).json({ success: false, message: "Invalid plan status" });
            }
            updates.planStatus = planStatus;

            // If suspending or inactivating, set isActive to false
            if (planStatus === "suspended" || planStatus === "inactive") {
                updates.isActive = false;
            }
        }

        // Update isActive if provided
        if (isActive !== undefined) {
            updates.isActive = isActive;
        }

        // Update the company
        const updatedCompany = await companyModel.findByIdAndUpdate(
            companyId,
            updates,
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Company updated successfully",
            data: updatedCompany
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   6️⃣ SUSPEND COMPANY CONTROLLER
======================================== */
export const suspendCompany = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { reason } = req.body;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company ID is required" });
        }

        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        if (company.planStatus === "suspended") {
            return res.status(400).json({ success: false, message: "Company is already suspended" });
        }

        const suspendedCompany = await companyModel.findByIdAndUpdate(
            companyId,
            {
                planStatus: "suspended",
                isActive: false,
                ...(reason && { suspensionReason: reason })
            },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            success: true,
            message: "Company suspended successfully",
            data: suspendedCompany
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   7️⃣ ACTIVATE COMPANY CONTROLLER
======================================== */
export const activateCompany = async (req, res) => {
    try {
        const { companyId } = req.params;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company ID is required" });
        }

        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        if (company.planStatus === "active") {
            return res.status(400).json({ success: false, message: "Company is already active" });
        }

        const activatedCompany = await companyModel.findByIdAndUpdate(
            companyId,
            {
                planStatus: "active",
                isActive: true
            },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            success: true,
            message: "Company activated successfully",
            data: activatedCompany
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   8️⃣ DEACTIVATE COMPANY CONTROLLER
======================================== */
export const deactivateCompany = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { reason } = req.body;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company ID is required" });
        }

        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        const deactivatedCompany = await companyModel.findByIdAndUpdate(
            companyId,
            {
                isActive: false,
                planStatus: "inactive",
                ...(reason && { deactivationReason: reason })
            },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            success: true,
            message: "Company deactivated successfully",
            data: deactivatedCompany
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   9️⃣ GET SINGLE COMPANY DETAILS
======================================== */
export const getCompanyDetails = async (req, res) => {
    try {
        const { companyId } = req.params;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company ID is required" });
        }

        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        // Get user statistics for the company
        const totalUsers = await User.countDocuments({ companyId });
        const activeUsers = await User.countDocuments({ companyId, isVerified: true });
        const usersByRole = await User.aggregate([
            { $match: { companyId: new mongoose.Types.ObjectId(companyId) } },
            { $group: { _id: "$role", count: { $sum: 1 } } }
        ]);

        const roleStats = {};
        usersByRole.forEach(item => {
            roleStats[item._id] = item.count;
        });

        return res.status(200).json({
            success: true,
            data: {
                company,
                userStats: {
                    total: totalUsers,
                    active: activeUsers,
                    byRole: roleStats,
                    userLimitUsed: `${totalUsers}/${company.userLimit}`
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   🔟 UPDATE COMPANY DETAILS (NAME, OWNER INFO)
======================================== */
export const updateCompanyDetails = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { companyName, ownerName, ownerEmail } = req.body;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company ID is required" });
        }

        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        // Prepare update object
        const updates = {};

        if (companyName !== undefined && companyName.trim()) {
            updates.companyName = companyName.trim();
        }

        if (ownerName !== undefined && ownerName.trim()) {
            updates.ownerName = ownerName.trim();
        }

        if (ownerEmail !== undefined && ownerEmail.trim()) {
            const email = ownerEmail.trim().toLowerCase();

            // Check if email is being changed and if it already exists
            if (email !== company.ownerEmail) {
                const existingOwner = await companyModel.findOne({
                    ownerEmail: email,
                    _id: { $ne: companyId }
                });

                if (existingOwner) {
                    return res.status(400).json({
                        success: false,
                        message: "This owner email is already associated with another company"
                    });
                }
            }

            updates.ownerEmail = email;
        }

        // Update the company
        const updatedCompany = await companyModel.findByIdAndUpdate(
            companyId,
            updates,
            { returnDocument: 'after', runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Company details updated successfully",
            data: updatedCompany
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ========================================
   1️⃣1️⃣ DELETE COMPANY CONTROLLER
======================================== */
export const deleteCompany = async (req, res) => {
    try {
        const { companyId } = req.params;

        if (!companyId) {
            return res.status(400).json({ success: false, message: "Company ID is required" });
        }

        const company = await companyModel.findById(companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }

        // Delete all users associated with this company
        const deletedUsers = await User.deleteMany({ companyId });

        // Delete all products associated with this company
        const Product = mongoose.model("Product");
        const deletedProducts = await Product.deleteMany({ companyId });

        // Delete the company
        await companyModel.findByIdAndDelete(companyId);

        return res.status(200).json({
            success: true,
            message: "Company and all associated data deleted successfully",
            data: {
                companyName: company.companyName,
                deletedUsers: deletedUsers.deletedCount,
                deletedProducts: deletedProducts.deletedCount
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
