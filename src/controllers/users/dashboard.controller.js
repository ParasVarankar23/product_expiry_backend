import Product from "../../models/users/product.model.js";

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
        next(error);
    }
};

/* ======================================================
   STORE MANAGER DASHBOARD
====================================================== */

export const getStoreManagerDashboard = async (req, res, next) => {
    try {
        if (req.user.role !== "store_manager") {
            return res.status(403).json({
                success: false,
                message: "Store manager access only",
            });
        }

        const now = new Date();
        const sevenDaysFromNow = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        const userId = req.user._id;

        // Total products added by store manager
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
        next(error);
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
        next(error);
    }
};
