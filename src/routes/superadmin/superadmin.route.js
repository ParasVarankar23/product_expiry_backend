import express from "express";
import {
    changeSuperAdminPassword,
    forgotSuperAdminPassword,
    googleLoginSuperAdmin,
    loginSuperAdmin,
    registerSuperAdmin,
    updateSuperAdminProfile,
    verifySuperAdminOtp,
} from "../../controllers/superadmin/superadmin.controller.js";
import { createCompany } from "../../controllers/users/company.controller.js";
import { protectSuperAdmin } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ===== Registration ===== */
router.post("/register", registerSuperAdmin);
router.post("/verify-otp", verifySuperAdminOtp);

/* ===== Company Management ===== */
router.post("/create-company", protectSuperAdmin, createCompany);

/* ===== Login ===== */
router.post("/login", loginSuperAdmin);
router.post("/google-login", googleLoginSuperAdmin);

/* ===== Forgot password ===== */
router.post("/forgot-password", forgotSuperAdminPassword);

/* ===== Protected ===== */
router.post("/change-password", protectSuperAdmin, changeSuperAdminPassword);
router.put("/profile-update", protectSuperAdmin, updateSuperAdminProfile);

export default router;
