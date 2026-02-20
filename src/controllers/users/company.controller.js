import mongoose from "mongoose";
import companyModel from "../../models/users/company.model.js";
import User from "../../models/users/user.model.js";
import { generateCompanyCode } from "../../utils/companyCode.utils.js";
import { sendGeneratedPassword } from "../../utils/mailer.utils.js";
import { generatePassword } from "../../utils/passwordGenerator.utils.js";

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

export const createCompany = async (req, res) => {
    try {
        const { ownerName, ownerEmail, companyName, plan } = req.body;
        if (!ownerName || !ownerEmail || !companyName || !plan) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }
        // Check for duplicate owner email
        const existingOwner = await companyModel.findOne({ ownerEmail });
        if (existingOwner) {
            return res.status(400).json({ success: false, message: "Owner email already exists." });
        }
        // Generate unique company code
        let companyCode;
        let exists = true;
        while (exists) {
            companyCode = generateCompanyCode();
            exists = await companyModel.findOne({ companyCode });
        }
        // Free plan: activate immediately
        if (plan === "free") {
            const company = await companyModel.create({
                companyName,
                companyCode,
                ownerName,
                ownerEmail,
                plan,
                planStatus: "active",
                planStartDate: new Date(),
                planEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                paymentCreatedAt: null,
                userLimit: PLAN_USER_LIMITS[plan],
                createdBy: req.superadmin?._id || null
            });
            // Create owner as admin user
            const password = generatePassword(ownerName);
            await User.create({
                name: ownerName,
                email: ownerEmail.toLowerCase(),
                password,
                role: "admin",
                companyId: company._id,
                isVerified: true
            });
            await sendGeneratedPassword(ownerEmail, password, companyCode);
            return res.status(201).json({ success: true, paymentRequired: false, companyCode });
        }
        // Paid plan: create company with pending status
        const company = await companyModel.create({
            companyName,
            companyCode,
            ownerName,
            ownerEmail,
            plan,
            planStatus: "pending",
            userLimit: PLAN_USER_LIMITS[plan],
            createdBy: req.superadmin?._id || null
        });
        // Return payment required info
        return res.status(201).json({
            success: true,
            paymentRequired: true,
            companyId: company._id,
            companyCode,
            amount: PLAN_PRICES[plan],
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
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
        const employeeUsers = await User.countDocuments({ role: "employee" });

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
                        employee: employeeUsers
                    }
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
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
            { new: true }
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
            { new: true }
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
            { new: true }
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
