import express from "express";
import {
    createOrder,
    getAllOrders,
    getOrderById,
    getUserOrders,
    updateOrderStatus,
    verifyPayment,
} from "../../controllers/users/order.controller.js";
import { protect } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   ORDER ROUTES (ALL PROTECTED)
====================================================== */

// Create new order
router.post("/create", protect, createOrder);

// Verify Razorpay payment
router.post("/verify-payment", protect, verifyPayment);

// Get user's orders
router.get("/my-orders", protect, getUserOrders);

// Get all orders (admin/manager only)
router.get("/all", protect, getAllOrders);

// Get single order by ID
router.get("/:id", protect, getOrderById);

// Update order status (admin/manager only)
router.put("/:id/status", protect, updateOrderStatus);

export default router;
