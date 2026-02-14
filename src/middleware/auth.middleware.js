import jwt from "jsonwebtoken";
import SuperAdmin from "../models/superadmin/superadmin.model.js";
import companyModel from "../models/users/company.model.js";
import User from "../models/users/user.model.js";
// Protect Company Owner Middleware
export const protectCompanyOwner = async (req, res, next) => {
    try {
        // User must be authenticated
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        // Find company
        const company = await companyModel.findById(req.user.companyId);
        if (!company) {
            return res.status(404).json({ success: false, message: "Company not found" });
        }
        // Check if user is the owner (admin and email matches ownerEmail)
        if (req.user.role !== "admin" || req.user.email !== company.ownerEmail) {
            return res.status(403).json({ success: false, message: "Only company owner access allowed" });
        }
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Not authorized (company owner)" });
    }
};
// Protect SuperAdmin Middleware
export const protectSuperAdmin = async (req, res, next) => {
    try {
        let token;

        // Check Authorization header
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authorized, token missing",
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find superadmin
        const superadmin = await SuperAdmin.findById(decoded.id);

        if (!superadmin) {
            return res.status(401).json({
                success: false,
                message: "SuperAdmin not found",
            });
        }

        // Attach to request
        req.superadmin = superadmin;

        // VERY IMPORTANT
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Not authorized",
        });
    }
};

/* ===== BASE PROTECT ===== */
export const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            message: "Invalid or expired token",
        });
    }
};

/* ===== ROLE PROTECTION ===== */

export const protectUser = (req, res, next) => {
    if (req.user.role !== "user") {
        return res.status(403).json({
            success: false,
            message: "User access only",
        });
    }
    next();
};

export const protectAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access only",
        });
    }
    next();
};

export const protectStoreManager = (req, res, next) => {
    if (req.user.role !== "store_manager") {
        return res.status(403).json({
            success: false,
            message: "Store Manager access only",
        });
    }
    next();
};
