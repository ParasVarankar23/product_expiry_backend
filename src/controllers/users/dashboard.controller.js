import Order from "../../models/users/order.model.js";
import Product from "../../models/users/product.model.js";
import User from "../../models/users/user.model.js";

/* ======================================================
   ADMIN DASHBOARD
====================================================== */

export const getAdminDashboard = async (req, res, next) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access only",
            });
        }

        const now = new Date();
        const sevenDaysFromNow = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        // Total products
        const totalProducts = await Product.countDocuments();

        // Expired products
        const expiredProducts = await Product.countDocuments({
            status: "expired",
        });

        // Active products
        const activeProducts = await Product.countDocuments({
            status: "active",
        });

        // Products expiring soon (within 7 days)
        const expiringSoon = await Product.countDocuments({
            expiryDate: { $lte: sevenDaysFromNow, $gt: now },
            status: "active",
        });

        // Category breakdown
        const categoryStats = await Product.aggregate([
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        // Recent products
        const recentProducts = await Product.find()
            .populate("addedBy", "name email role")
            .sort({ createdAt: -1 })
            .limit(5);

        // Products with AI advice
        const productsWithAI = await Product.countDocuments({
            aiAdvice: { $ne: "" },
        });

        // Total staff count
        const totalStaff = await User.countDocuments({
            companyId: req.user.companyId,
        });

        // Staff by role
        const staffByRole = await User.aggregate([
            { $match: { companyId: req.user.companyId } },
            {
                $group: {
                    _id: "$role",
                    count: { $sum: 1 },
                },
            },
        ]);

        // Total orders
        const totalOrders = await Order.countDocuments({
            companyId: req.user.companyId,
        });

        // Products sold (sum of quantities from completed orders)
        const soldStats = await Order.aggregate([
            {
                $match: {
                    companyId: req.user.companyId,
                    paymentStatus: "completed",
                },
            },
            { $unwind: "$items" },
            {
                $group: {
                    _id: null,
                    totalSold: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                },
            },
        ]);

        const productsSold = soldStats.length > 0 ? soldStats[0].totalSold : 0;
        const totalRevenue = soldStats.length > 0 ? soldStats[0].totalRevenue : 0;

        // Total stock remaining
        const stockStats = await Product.aggregate([
            { $match: { companyId: req.user.companyId } },
            {
                $group: {
                    _id: null,
                    totalStock: { $sum: "$stock" },
                },
            },
        ]);

        const remainingStock = stockStats.length > 0 ? stockStats[0].totalStock : 0;

        // Recent orders
        const recentOrders = await Order.find({ companyId: req.user.companyId })
            .populate("userId", "name email")
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            success: true,
            dashboard: {
                totalProducts,
                expiredProducts,
                activeProducts,
                expiringSoon,
                productsWithAI,
                totalStaff,
                staffByRole,
                totalOrders,
                productsSold,
                totalRevenue,
                remainingStock,
                categoryStats,
                recentProducts,
                recentOrders,
            },
        });
    } catch (error) {
        console.error("getAdminDashboard error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   STORE MANAGER DASHBOARD
====================================================== */

export const getStoreManagerDashboard = async (req, res, next) => {
    try {
        if (req.user.role !== "manager") {
            return res.status(403).json({
                success: false,
                message: "Manager access only",
            });
        }

        const now = new Date();
        const sevenDaysFromNow = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        const userId = req.user._id;

        // Total products added by manager
        const totalProducts = await Product.countDocuments({
            addedBy: userId,
        });

        // Expired products
        const expiredProducts = await Product.countDocuments({
            addedBy: userId,
            status: "expired",
        });

        // Active products
        const activeProducts = await Product.countDocuments({
            addedBy: userId,
            status: "active",
        });

        // Products expiring soon
        const expiringSoon = await Product.countDocuments({
            addedBy: userId,
            expiryDate: { $lte: sevenDaysFromNow, $gt: now },
            status: "active",
        });

        // Category breakdown
        const categoryStats = await Product.aggregate([
            { $match: { addedBy: userId } },
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        // Recent products
        const recentProducts = await Product.find({ addedBy: userId })
            .populate("assignedUsers", "name email")
            .sort({ createdAt: -1 })
            .limit(5);

        // Products with AI advice
        const productsWithAI = await Product.countDocuments({
            addedBy: userId,
            aiAdvice: { $ne: "" },
        });

        // Total staff count (same company)
        const totalStaff = await User.countDocuments({
            companyId: req.user.companyId,
        });

        // Products sold by this manager
        const managerProductIds = await Product.find({ addedBy: userId }).distinct("_id");

        const soldStats = await Order.aggregate([
            {
                $match: {
                    companyId: req.user.companyId,
                    paymentStatus: "completed",
                    "items.productId": { $in: managerProductIds },
                },
            },
            { $unwind: "$items" },
            {
                $match: {
                    "items.productId": { $in: managerProductIds },
                },
            },
            {
                $group: {
                    _id: null,
                    totalSold: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                },
            },
        ]);

        const productsSold = soldStats.length > 0 ? soldStats[0].totalSold : 0;
        const totalRevenue = soldStats.length > 0 ? soldStats[0].totalRevenue : 0;

        // Remaining stock
        const stockStats = await Product.aggregate([
            { $match: { addedBy: userId } },
            {
                $group: {
                    _id: null,
                    totalStock: { $sum: "$stock" },
                },
            },
        ]);

        const remainingStock = stockStats.length > 0 ? stockStats[0].totalStock : 0;

        res.status(200).json({
            success: true,
            dashboard: {
                totalProducts,
                expiredProducts,
                activeProducts,
                expiringSoon,
                productsWithAI,
                totalStaff,
                productsSold,
                totalRevenue,
                remainingStock,
                categoryStats,
                recentProducts,
            },
        });
    } catch (error) {
        console.error("getStoreManagerDashboard error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   USER DASHBOARD
====================================================== */

export const getUserDashboard = async (req, res, next) => {
    try {
        if (req.user.role !== "user") {
            return res.status(403).json({
                success: false,
                message: "User access only",
            });
        }

        const now = new Date();
        const sevenDaysFromNow = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        const userId = req.user._id;

        // Total assigned products
        const totalProducts = await Product.countDocuments({
            assignedUsers: userId,
        });

        // Expired products
        const expiredProducts = await Product.countDocuments({
            assignedUsers: userId,
            status: "expired",
        });

        // Active products
        const activeProducts = await Product.countDocuments({
            assignedUsers: userId,
            status: "active",
        });

        // Products expiring soon
        const expiringSoon = await Product.countDocuments({
            assignedUsers: userId,
            expiryDate: { $lte: sevenDaysFromNow, $gt: now },
            status: "active",
        });

        // Category breakdown
        const categoryStats = await Product.aggregate([
            { $match: { assignedUsers: userId } },
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        // Recent assigned products
        const recentProducts = await Product.find({
            assignedUsers: userId,
        })
            .populate("addedBy", "name email role")
            .sort({ createdAt: -1 })
            .limit(5);

        // Products with AI advice
        const productsWithAI = await Product.countDocuments({
            assignedUsers: userId,
            aiAdvice: { $ne: "" },
        });

        res.status(200).json({
            success: true,
            dashboard: {
                totalProducts,
                expiredProducts,
                activeProducts,
                expiringSoon,
                productsWithAI,
                categoryStats,
                recentProducts,
            },
        });
    } catch (error) {
        console.error("getUserDashboard error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   COMPANY OWNER DASHBOARD
====================================================== */

export const getCompanyOwnerDashboard = async (req, res, next) => {
    try {
        if (!req.isOwner || !req.company) {
            return res.status(403).json({
                success: false,
                message: "Company owner access only",
            });
        }

        const companyId = req.company._id;
        const now = new Date();
        const sevenDaysFromNow = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        // Total products (company scoped)
        const totalProducts = await Product.countDocuments({
            companyId,
        });

        // Expired products
        const expiredProducts = await Product.countDocuments({
            companyId,
            status: "expired",
        });

        // Active products
        const activeProducts = await Product.countDocuments({
            companyId,
            status: "active",
        });

        // Products expiring soon (within 7 days)
        const expiringSoon = await Product.countDocuments({
            companyId,
            expiryDate: { $lte: sevenDaysFromNow, $gt: now },
            status: "active",
        });

        // Category breakdown
        const categoryStats = await Product.aggregate([
            { $match: { companyId } },
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        // Recent products
        const recentProducts = await Product.find({ companyId })
            .populate("addedBy", "name email role")
            .sort({ createdAt: -1 })
            .limit(5);

        // Products with AI advice
        const productsWithAI = await Product.countDocuments({
            companyId,
            aiAdvice: { $ne: "" },
        });

        // Total staff (users in company)
        const totalStaff = await User.countDocuments({
            companyId,
        });

        // Staff by role
        const staffByRole = await User.aggregate([
            { $match: { companyId } },
            {
                $group: {
                    _id: "$role",
                    count: { $sum: 1 },
                },
            },
        ]);

        // Total orders
        const totalOrders = await Order.countDocuments({
            companyId,
        });

        // Products sold (sum of quantities from completed orders)
        const soldStats = await Order.aggregate([
            {
                $match: {
                    companyId,
                    paymentStatus: "completed",
                },
            },
            { $unwind: "$items" },
            {
                $group: {
                    _id: null,
                    totalSold: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                },
            },
        ]);

        const productsSold = soldStats.length > 0 ? soldStats[0].totalSold : 0;
        const totalRevenue = soldStats.length > 0 ? soldStats[0].totalRevenue : 0;

        // Total stock remaining
        const stockStats = await Product.aggregate([
            { $match: { companyId } },
            {
                $group: {
                    _id: null,
                    totalStock: { $sum: "$stock" },
                },
            },
        ]);

        const remainingStock = stockStats.length > 0 ? stockStats[0].totalStock : 0;

        // Recent orders
        const recentOrders = await Order.find({ companyId })
            .populate("userId", "name email")
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            success: true,
            dashboard: {
                totalProducts,
                expiredProducts,
                activeProducts,
                expiringSoon,
                productsWithAI,
                totalStaff,
                staffByRole,
                totalOrders,
                productsSold,
                totalRevenue,
                remainingStock,
                categoryStats,
                recentProducts,
                recentOrders,
            },
        });
    } catch (error) {
        console.error("getCompanyOwnerDashboard error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

