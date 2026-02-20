import jwt from "jsonwebtoken";
import SuperAdmin from "../models/superadmin/superadmin.model.js";
import companyModel from "../models/users/company.model.js";
import User from "../models/users/user.model.js";
// Protect Company Owner Middleware
export const protectCompanyOwner = async (req, res, next) => {
    try {
        // Check if user is owner (via owner token with req.company) or admin user matching company owner
        if (req.isOwner && req.company) {
            return next();
        }

        // Fallback for team member admins (for backward compatibility)
        if (req.user && req.user.role === "admin") {
            const company = await companyModel.findById(req.user.companyId);
            if (company && req.user.email === company.ownerEmail) {
                return next();
            }
        }

        return res.status(403).json({ success: false, message: "Only company owner access allowed" });
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

        // Ensure only id and sessionId are in the decoded token
        if (!decoded.id || !decoded.sessionId) {
            return res.status(401).json({
                success: false,
                message: "Invalid token structure",
            });
        }

        // Find superadmin with sessions
        const superadmin = await SuperAdmin.findById(decoded.id).select("+sessions");

        if (!superadmin) {
            return res.status(401).json({
                success: false,
                message: "SuperAdmin not found",
            });
        }

        // Validate session
        if (!superadmin.isSessionValid(decoded.sessionId)) {
            return res.status(401).json({
                success: false,
                message: "Session expired or invalid",
            });
        }

        // Attach to request (only id and sessionId from token)
        req.superadmin = superadmin;
        req.sessionId = decoded.sessionId;

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

        // Handle owner token
        if (decoded.type === "owner") {
            const company = await companyModel.findById(decoded.id);
            if (!company) {
                return res.status(401).json({
                    success: false,
                    message: "Company not found",
                });
            }
            req.company = company;
            req.isOwner = true;
            next();
        } else {
            // Handle user token
            const user = await User.findById(decoded.id).select("-password");
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "User not found",
                });
            }
            req.user = user;
            req.isOwner = false;
            next();
        }
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
