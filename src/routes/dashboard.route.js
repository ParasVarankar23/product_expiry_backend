import express from "express";
import {
    getAdminDashboard,
    getStoreManagerDashboard,
    getUserDashboard,
} from "../controllers/dashboard.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   DASHBOARD ROUTES (ALL PROTECTED)
====================================================== */

// Admin dashboard
router.get("/admin", protect, getAdminDashboard);

// Store manager dashboard
router.get("/store", protect, getStoreManagerDashboard);

// User dashboard
router.get("/user", protect, getUserDashboard);

export default router;
