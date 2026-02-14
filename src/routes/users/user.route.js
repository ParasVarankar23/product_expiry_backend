import express from "express";

import {
   changePassword,
   forgotPassword,
   getProfile,
   googleLogin,
   loginUser,
   publicRegisterUser,
   registerUserInCompany,
   resetPassword,
   setPassword,
   updateProfile,
   verifyEmailOtp,
   verifyForgotOtp,
} from "../../controllers/users/user.controller.js";

import { protect } from "../../middleware/auth.middleware.js";


const router = express.Router();
/* ======================================================
   AUTH ROUTES (PUBLIC)
====================================================== */


// Public registration (self signup with company code)
router.post("/public-register", publicRegisterUser);

// Protected company registration (admin/manager creates user)
router.post("/register-company", protect, registerUserInCompany);

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
