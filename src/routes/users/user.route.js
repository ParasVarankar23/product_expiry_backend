import express from "express";

import {
   changePassword,
   createStaff,
   deleteStaff,
   directLoginUser,
   forgotPassword,
   getCompanyStaff,
   getProfile,
   googleLogin,
   loginUser,
   publicRegisterUser,
   resetPassword,
   setPassword,
   updateProfile,
   updateStaff,
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

// Direct user login (email + name + company code - no password needed)
router.post("/direct-login", directLoginUser);


// Verify email OTP
router.post("/verify-email", verifyEmailOtp);

// Staff management (protected) - allow owner or admin via `protect` middleware;
// controller enforces finer-grained rules (owner vs admin) when needed.
router.get("/staff", protect, getCompanyStaff);
router.post("/staff", protect, createStaff);
router.put("/staff/:id", protect, updateStaff);
router.delete("/staff/:id", protect, deleteStaff);

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
