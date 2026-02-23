import express from "express";
import {
    getAdminDashboard,
    getCompanyOwnerDashboard,
    getStoreManagerDashboard,
    getUserDashboard,
} from "../../controllers/users/dashboard.controller.js";
import { protect } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   DASHBOARD ROUTES (ALL PROTECTED)
====================================================== */

// Admin dashboard
router.get("/admin", protect, getAdminDashboard);

// Company owner dashboard
router.get("/company", protect, getCompanyOwnerDashboard);

// Store manager dashboard
router.get("/store-manager", protect, getStoreManagerDashboard);

// User dashboard
router.get("/user", protect, getUserDashboard);

export default router;

