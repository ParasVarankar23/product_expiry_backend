import express from "express";

import {
    changePassword,
    forgotPassword,
    getProfile,
    googleLogin,
    loginUser,
    registerUser,
    resetPassword,
    setPassword,
    updateProfile,
    verifyEmailOtp,
    verifyForgotOtp,
} from "../controllers/user.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   AUTH ROUTES (PUBLIC)
====================================================== */

// Register user (send OTP)
router.post("/register", registerUser);

// Verify email OTP
router.post("/verify-email", verifyEmailOtp);

// Login with email OR phone
router.post("/login", loginUser);

// Google login
router.post("/google", googleLogin);

// Forgot password flow
router.post("/forgot-password", forgotPassword);
router.post("/verify-forgot-otp", verifyForgotOtp);
router.post("/reset-password", resetPassword);

/* ======================================================
   USER ROUTES (PROTECTED)
====================================================== */

// Get logged-in user profile
router.get("/profile", protect, getProfile);

// Update user profile
router.put("/update-profile", protect, updateProfile);

// Set password after OTP verification
router.put("/set-password", protect, setPassword);

// Change password (requires old password)
router.put("/change-password", protect, changePassword);

export default router;
