import Product from "../../models/users/product.model.js";
import User from "../../models/users/user.model.js";
import { generateProductAdvice } from "../../services/gemini.service.js";
import {
    sendBatchNotifications
} from "../../services/notification.service.js";
import { uploadBase64File } from "../../utils/cloudinary.utils.js";

/* ======================================================
   ADD PRODUCT (ADMIN / STORE MANAGER)
====================================================== */

export const addProduct = async (req, res, next) => {
    try {
        const { name, category, description, packingDate, expiryDate, expiredDate, image, assignedUsers } = req.body;

        // Validate required fields
        if (!name || !expiryDate) {
            return res.status(400).json({
                success: false,
                message: "Product name and expiry date are required",
            });
        }

        // Check role authorization
        if (req.user.role !== "admin" && req.user.role !== "manager") {
            return res.status(403).json({
                success: false,
                message: "Only Admin or Manager can add products",
            });
        }

        // Upload image to Cloudinary if base64 provided
        let imageUrl = "";
        if (image && image.startsWith("data:")) {
            const upload = await uploadBase64File(image, "products");
            imageUrl = upload?.url || "";
        } else if (image) {
            imageUrl = image;
        }

        // Generate AI advice
        const aiAdvice = await generateProductAdvice(name, expiryDate);

        // Create product
        const product = await Product.create({
            name,
            category: category || "",
            description: description || "",
            packingDate: packingDate || null,
            expiryDate,
            expiredDate: expiredDate || null,
            image: imageUrl,
            companyId: req.user.companyId,
            addedBy: req.user._id,
            assignedUsers: assignedUsers || [],
            aiAdvice,
        });

        // Populate for response
        await product.populate("addedBy", "name email phone");
        await product.populate("assignedUsers", "name email phone");

        // Send notifications to assigned users
        if (assignedUsers && assignedUsers.length > 0) {
            const users = await User.find({ _id: { $in: assignedUsers } });
            await sendBatchNotifications(users, product, "new");
        }

        res.status(201).json({
            success: true,
            message: "Product added successfully",
            product,
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   GET PRODUCTS (ROLE-BASED)
====================================================== */

export const getProducts = async (req, res, next) => {
    try {
        const { status, category, search, limit = 50, page = 1 } = req.query;

        let query = {};

        // Role-based filtering
        if (req.user.role === "admin") {
            // Admin sees all products
        } else if (req.user.role === "manager") {
            // Manager sees only their products
            query.addedBy = req.user._id;
        } else {
            // Regular user sees only assigned products
            query.assignedUsers = req.user._id;
        }

        // Additional filters
        if (status) query.status = status;
        if (category) query.category = new RegExp(category, "i");
        if (search) query.name = new RegExp(search, "i");

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const products = await Product.find(query)
            .populate("addedBy", "name email role")
            .populate("assignedUsers", "name email phone")
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        const total = await Product.countDocuments(query);

        res.status(200).json({
            success: true,
            products,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   GET PRODUCT BY ID
====================================================== */

export const getProductById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id)
            .populate("addedBy", "name email role")
            .populate("assignedUsers", "name email phone");

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Check access rights
        const hasAccess =
            req.user.role === "admin" ||
            product.addedBy._id.toString() === req.user._id.toString() ||
            product.assignedUsers.some(
                (user) => user._id.toString() === req.user._id.toString()
            );

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        res.status(200).json({
            success: true,
            product,
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   UPDATE PRODUCT
====================================================== */

export const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, category, description, expiryDate, image, assignedUsers } =
            req.body;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Check ownership
        const isOwner =
            req.user.role === "admin" ||
            product.addedBy.toString() === req.user._id.toString();

        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: "Only admin or product owner can update",
            });
        }

        // Update fields
        if (name) product.name = name;
        if (category) product.category = category;
        if (description) product.description = description;
        if (expiryDate) product.expiryDate = expiryDate;
        if (assignedUsers) product.assignedUsers = assignedUsers;

        // Update image if provided
        if (image) {
            if (image.startsWith("data:")) {
                const upload = await uploadBase64File(image, "products");
                product.image = upload?.url || product.image;
            } else {
                product.image = image;
            }
        }

        // Regenerate AI advice if name or expiry changed
        if (name || expiryDate) {
            product.aiAdvice = await generateProductAdvice(
                product.name,
                product.expiryDate
            );
        }

        await product.save();

        await product.populate("addedBy", "name email role");
        await product.populate("assignedUsers", "name email phone");

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product,
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   DELETE PRODUCT
====================================================== */

export const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Check ownership
        const isOwner =
            req.user.role === "admin" ||
            product.addedBy.toString() === req.user._id.toString();

        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: "Only admin or product owner can delete",
            });
        }

        await Product.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Product deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

/* ======================================================
   CHECK EXPIRY PRODUCTS (CRON READY)
====================================================== */

export const checkExpiryProducts = async () => {
    try {
        console.log("🔍 Running expiry check...");

        const now = new Date();
        const sevenDaysFromNow = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        );

        // Find products expiring within 7 days or already expired
        const expiringProducts = await Product.find({
            expiryDate: { $lte: sevenDaysFromNow },
            status: { $in: ["active", "expired"] },
        })
            .populate("addedBy", "name email phone")
            .populate("assignedUsers", "name email phone");

        console.log(`📦 Found ${expiringProducts.length} expiring products`);

        for (const product of expiringProducts) {
            // Update status if expired
            if (new Date(product.expiryDate) < now && product.status !== "expired") {
                product.status = "expired";
                await product.save();
            }

            // Regenerate AI advice
            const { generateExpiryWarning } = await import(
                "../services/gemini.service.js"
            );
            product.aiAdvice = await generateExpiryWarning(
                product.name,
                product.expiryDate
            );
            await product.save();

            // Collect all users to notify
            const usersToNotify = [];

            if (product.addedBy) {
                usersToNotify.push(product.addedBy);
            }

            if (product.assignedUsers && product.assignedUsers.length > 0) {
                usersToNotify.push(...product.assignedUsers);
            }

            // Send notifications
            if (usersToNotify.length > 0) {
                await sendBatchNotifications(usersToNotify, product, "expiry");
            }
        }

        console.log("✅ Expiry check completed");
        return { success: true, count: expiringProducts.length };
    } catch (error) {
        console.error("❌ Expiry check failed:", error.message);
        return { success: false, error: error.message };
    }
};
