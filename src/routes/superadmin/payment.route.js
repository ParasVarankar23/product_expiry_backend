import express from "express";
import { createPaymentOrder, verifyPayment } from "../../controllers/superadmin/payment.controller.js";
import { protectSuperAdmin } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Protected routes (require superadmin auth)
router.post("/create-order", protectSuperAdmin, createPaymentOrder);

// Public route (for customers to verify payment after Razorpay)
router.post("/verify-payment", verifyPayment);

// Kept for backward compatibility
router.post("/verify", protectSuperAdmin, verifyPayment);

export default router;
