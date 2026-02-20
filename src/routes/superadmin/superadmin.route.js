import express from "express";
import {
    changeSuperAdminPassword,
    forgotSuperAdminPassword,
    getSuperAdminProfile,
    googleLoginSuperAdmin,
    loginSuperAdmin,
    logoutSuperAdmin,
    registerSuperAdmin,
    updateSuperAdminProfile,
    verifyResetOtp,
    verifySuperAdminOtp,
} from "../../controllers/superadmin/superadmin.controller.js";
import {
    activateCompany,
    createCompany,
    deactivateCompany,
    deleteCompany,
    getAllCompanies,
    getCompanyDetails,
    getDashboardStats,
    suspendCompany,
    updateCompanyDetails,
    updateCompanyPlan,
} from "../../controllers/users/company.controller.js";
import { protectSuperAdmin } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ===== Registration ===== */
router.post("/register", registerSuperAdmin);
router.post("/verify-otp", verifySuperAdminOtp);

/* ===== Company Management ===== */
router.post("/create-company", protectSuperAdmin, createCompany);
router.get("/dashboard-stats", protectSuperAdmin, getDashboardStats);
router.get("/companies", protectSuperAdmin, getAllCompanies);
router.get("/company/:companyId", protectSuperAdmin, getCompanyDetails);
router.put("/company/:companyId/plan", protectSuperAdmin, updateCompanyPlan);
router.put("/company/:companyId/details", protectSuperAdmin, updateCompanyDetails);
router.post("/company/:companyId/suspend", protectSuperAdmin, suspendCompany);
router.post("/company/:companyId/activate", protectSuperAdmin, activateCompany);
router.post("/company/:companyId/deactivate", protectSuperAdmin, deactivateCompany);
router.delete("/company/:companyId", protectSuperAdmin, deleteCompany);

/* ===== Login ===== */
router.post("/login", loginSuperAdmin);
router.post("/google-login", googleLoginSuperAdmin);

/* ===== Logout ===== */
router.post("/logout", protectSuperAdmin, logoutSuperAdmin);

/* ===== Forgot password ===== */
router.post("/forgot-password", forgotSuperAdminPassword);
router.post("/verify-reset-otp", verifyResetOtp);

/* ===== Protected ===== */
router.get("/profile", protectSuperAdmin, getSuperAdminProfile);
router.post("/change-password", protectSuperAdmin, changeSuperAdminPassword);
router.put("/profile-update", protectSuperAdmin, updateSuperAdminProfile);

export default router;
