import express from "express";
import {
    addToCart,
    clearCart,
    getCart,
    removeFromCart,
    updateCartItem,
} from "../../controllers/users/cart.controller.js";
import { protect } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   CART ROUTES (ALL PROTECTED)
====================================================== */

// Get user's cart
router.get("/", protect, getCart);

// Add product to cart
router.post("/add", protect, addToCart);

// Update cart item quantity
router.put("/:productId", protect, updateCartItem);

// Remove product from cart
router.delete("/:productId", protect, removeFromCart);

// Clear entire cart
router.delete("/", protect, clearCart);

export default router;
