import Cart from "../../models/users/cart.model.js";
import Product from "../../models/users/product.model.js";
import User from "../../models/users/user.model.js";

/* ======================================================
   ADD TO CART
====================================================== */

export const addToCart = async (req, res, next) => {
    try {
        const { productId, quantity = 1 } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required",
            });
        }

        // Verify product exists and is available
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        if (!product.isAvailableForSale) {
            return res.status(400).json({
                success: false,
                message: "Product is not available for sale",
            });
        }

        if (product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: "Insufficient stock",
            });
        }

        // Resolve userId and companyId (support owner tokens)
        let userId = req.user?._id;
        let companyId = req.user?.companyId || req.company?._id;
        if (!userId && req.company) {
            // Try to find or create a lightweight owner user for company owner
            let ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (!ownerUser) {
                const tmpPassword = `owner-${Date.now()}`;
                ownerUser = await User.create({
                    name: req.company.ownerName || "Company Owner",
                    email: req.company.ownerEmail,
                    password: tmpPassword,
                    role: "admin",
                    companyId: req.company._id,
                    isVerified: true,
                });
            }
            userId = ownerUser._id;
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = await Cart.create({
                userId,
                companyId,
                items: [],
            });
        }

        // Check if product already in cart
        const existingItemIndex = cart.items.findIndex(
            (item) => item.productId.toString() === productId
        );

        if (existingItemIndex > -1) {
            // Update quantity
            cart.items[existingItemIndex].quantity += quantity;
        } else {
            // Add new item
            cart.items.push({
                productId,
                quantity,
                addedAt: new Date(),
            });
        }

        await cart.save();
        await cart.populate("items.productId", "name description image price stock expiryDate");

        res.status(200).json({
            success: true,
            message: "Product added to cart",
            cart,
        });
    } catch (error) {
        console.error("addToCart error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GET CART
====================================================== */

export const getCart = async (req, res, next) => {
    try {
        // Resolve userId and companyId (support owner tokens)
        let userId = req.user?._id;
        let companyId = req.user?.companyId || req.company?._id;
        if (!userId && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) userId = ownerUser._id;
        }

        let cart = await Cart.findOne({ userId }).populate(
            "items.productId",
            "name description image price stock expiryDate status isAvailableForSale"
        );

        if (!cart) {
            cart = await Cart.create({
                userId,
                companyId,
                items: [],
            });
        }

        // Filter out unavailable products
        cart.items = cart.items.filter(
            (item) =>
                item.productId &&
                item.productId.isAvailableForSale &&
                item.productId.status === "active"
        );

        await cart.save();

        // Calculate total
        const total = cart.items.reduce((sum, item) => {
            return sum + (item.productId?.price || 0) * item.quantity;
        }, 0);

        res.status(200).json({
            success: true,
            cart,
            total,
            itemCount: cart.items.length,
        });
    } catch (error) {
        console.error("getCart error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   UPDATE CART ITEM QUANTITY
====================================================== */

export const updateCartItem = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const { quantity } = req.body;

        if (!quantity || quantity < 0) {
            return res.status(400).json({
                success: false,
                message: "Valid quantity is required",
            });
        }

        // Resolve userId (support owner tokens)
        let userId = req.user?._id;
        if (!userId && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) userId = ownerUser._id;
        }

        const cart = await Cart.findOne({ userId });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found",
            });
        }

        const itemIndex = cart.items.findIndex(
            (item) => item.productId.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Product not found in cart",
            });
        }

        if (quantity === 0) {
            // Remove item
            cart.items.splice(itemIndex, 1);
        } else {
            // Update quantity
            const product = await Product.findById(productId);
            if (product.stock < quantity) {
                return res.status(400).json({
                    success: false,
                    message: "Insufficient stock",
                });
            }
            cart.items[itemIndex].quantity = quantity;
        }

        await cart.save();
        await cart.populate("items.productId", "name description image price stock expiryDate");

        res.status(200).json({
            success: true,
            message: "Cart updated",
            cart,
        });
    } catch (error) {
        console.error("updateCartItem error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   REMOVE FROM CART
====================================================== */

export const removeFromCart = async (req, res, next) => {
    try {
        const { productId } = req.params;

        // Resolve userId (support owner tokens)
        let userId = req.user?._id;
        if (!userId && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) userId = ownerUser._id;
        }

        const cart = await Cart.findOne({ userId });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found",
            });
        }

        cart.items = cart.items.filter(
            (item) => item.productId.toString() !== productId
        );

        await cart.save();
        await cart.populate("items.productId", "name description image price stock expiryDate");

        res.status(200).json({
            success: true,
            message: "Product removed from cart",
            cart,
        });
    } catch (error) {
        console.error("removeFromCart error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   CLEAR CART
====================================================== */

export const clearCart = async (req, res, next) => {
    try {
        // Resolve userId (support owner tokens)
        let userId = req.user?._id;
        if (!userId && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) userId = ownerUser._id;
        }

        const cart = await Cart.findOne({ userId });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found",
            });
        }

        cart.items = [];
        await cart.save();

        res.status(200).json({
            success: true,
            message: "Cart cleared",
            cart,
        });
    } catch (error) {
        console.error("clearCart error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};
