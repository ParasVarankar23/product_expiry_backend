import crypto from "crypto";
import { getRazorpayClient } from "../../config/razorpay.js";
import Cart from "../../models/users/cart.model.js";
import Order from "../../models/users/order.model.js";
import Product from "../../models/users/product.model.js";
import User from "../../models/users/user.model.js";

/* ======================================================
   CREATE ORDER (RAZORPAY)
====================================================== */

export const createOrder = async (req, res, next) => {
    try {
        const { items, shippingAddress, notes } = req.body;

        // Validate items
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Cart items are required",
            });
        }

        // Calculate total and verify products
        let totalAmount = 0;
        const orderItems = [];

        for (const item of items) {
            const product = await Product.findById(item.productId);

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product ${item.productId} not found`,
                });
            }

            if (!product.isAvailableForSale || product.status !== "active") {
                return res.status(400).json({
                    success: false,
                    message: `Product ${product.name} is not available for sale`,
                });
            }

            if (product.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}`,
                });
            }

            const itemTotal = product.price * item.quantity;
            totalAmount += itemTotal;

            orderItems.push({
                productId: product._id,
                productName: product.name,
                quantity: item.quantity,
                price: product.price,
            });
        }

        // Determine companyId and userId (support owner tokens)
        let companyId = req.user?.companyId || req.company?._id;
        let userId = req.user?._id;
        if (!userId && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) userId = ownerUser._id;
        }

        // Create Razorpay order
        const razorpay = getRazorpayClient();
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(totalAmount * 100), // Amount in paise
            currency: "INR",
            receipt: `order_${Date.now()}`,
            notes: {
                userId: userId ? userId.toString() : "",
                companyId: companyId ? companyId.toString() : "",
            },
        });

        // Generate order number
        const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Create order in database
        const order = await Order.create({
            orderNumber,
            userId: userId,
            companyId: companyId,
            items: orderItems,
            totalAmount,
            razorpayOrderId: razorpayOrder.id,
            shippingAddress: shippingAddress || {},
            notes: notes || "",
            paymentStatus: "pending",
            status: "pending",
        });

        await order.populate("items.productId", "name image expiryDate");
        await order.populate("userId", "name email phone");

        res.status(201).json({
            success: true,
            message: "Order created successfully",
            order,
            razorpayOrderId: razorpayOrder.id,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            amount: totalAmount,
        });
    } catch (error) {
        console.error("createOrder error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   VERIFY PAYMENT
====================================================== */

export const verifyPayment = async (req, res, next) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Missing payment verification details",
            });
        }

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            return res.status(400).json({
                success: false,
                message: "Payment verification failed",
            });
        }

        // Update order
        const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        order.razorpayPaymentId = razorpay_payment_id;
        order.razorpaySignature = razorpay_signature;
        order.paymentStatus = "completed";
        order.status = "confirmed";

        await order.save();

        // Update product stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stock: -item.quantity },
            });
        }

        // Clear user's cart
        await Cart.findOneAndUpdate(
            { userId: order.userId },
            { $set: { items: [] } }
        );

        await order.populate("items.productId", "name image expiryDate");
        await order.populate("userId", "name email phone");

        res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            order,
        });
    } catch (error) {
        console.error("verifyPayment error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GET USER ORDERS
====================================================== */

export const getUserOrders = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;

        // Resolve requester user id (support owner tokens)
        let requesterUserId = req.user?._id;
        if (!requesterUserId && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) requesterUserId = ownerUser._id;
        }
        const query = { userId: requesterUserId };
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const orders = await Order.find(query)
            .populate("items.productId", "name image expiryDate")
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        const total = await Order.countDocuments(query);

        res.status(200).json({
            success: true,
            orders,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("getUserOrders error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GET ORDER BY ID
====================================================== */

export const getOrderById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id)
            .populate("items.productId", "name image expiryDate description")
            .populate("userId", "name email phone");

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        // Check access (support owner tokens)
        let requesterUserId = req.user?._id?.toString();
        if (!requesterUserId && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) requesterUserId = ownerUser._id.toString();
        }

        const isAdmin = req.user?.role === "admin";
        const isCompanyOwner = req.isOwner && req.company && order.companyId.toString() === req.company._id.toString();

        if (
            order.userId._id.toString() !== requesterUserId &&
            !isAdmin &&
            !isCompanyOwner
        ) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        res.status(200).json({
            success: true,
            order,
        });
    } catch (error) {
        console.error("getOrderById error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GET ALL ORDERS (ADMIN/MANAGER)
====================================================== */

export const getAllOrders = async (req, res, next) => {
    try {
        if (req.user?.role !== "admin" && req.user?.role !== "manager" && !req.isOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        const { status, page = 1, limit = 20 } = req.query;

        const companyIdQuery = req.user?.companyId || req.company?._id;
        const query = { companyId: companyIdQuery };
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const orders = await Order.find(query)
            .populate("items.productId", "name image")
            .populate("userId", "name email phone")
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        const total = await Order.countDocuments(query);

        res.status(200).json({
            success: true,
            orders,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("getAllOrders error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   UPDATE ORDER STATUS (ADMIN/MANAGER)
====================================================== */

export const updateOrderStatus = async (req, res, next) => {
    try {
        if ((req.user?.role !== "admin" && req.user?.role !== "manager") && !req.isOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ["pending", "confirmed", "processing", "delivered", "cancelled"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status",
            });
        }

        const order = await Order.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        order.status = status;
        await order.save();

        await order.populate("items.productId", "name image");
        await order.populate("userId", "name email phone");

        res.status(200).json({
            success: true,
            message: "Order status updated",
            order,
        });
    } catch (error) {
        console.error("updateOrderStatus error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};
