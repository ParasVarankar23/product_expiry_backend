import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

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
