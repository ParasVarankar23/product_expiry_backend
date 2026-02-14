import express from "express";
import { createPaymentOrder, verifyPayment } from "../../controllers/payment.controller.js";
import { protectSuperAdmin } from "../../middleware/auth.middleware.js";

const router = express.Router();



// Create Razorpay order for company
router.post("/create-order", protectSuperAdmin, createPaymentOrder);

// Verify payment for company
router.post("/verify", protectSuperAdmin, verifyPayment);

export default router;
