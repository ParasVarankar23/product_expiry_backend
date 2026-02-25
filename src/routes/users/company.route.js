import express from "express";

import {
    changeCompanyOwnerPassword,
    forgotCompanyOwnerPassword,
    getCompanyOwnerProfile,
    loginCompanyOwner,
    resetCompanyOwnerPassword,
    updateCompanyOwnerProfile,
    googleLoginCompany,
    completeGoogleRegistrationCompany,
} from "../../controllers/users/company.controller.js";

import { protect, protectCompanyOwner } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* =============================
    OWNER AUTH ROUTES (PUBLIC)
============================= */

router.post("/login", loginCompanyOwner);
// Google login for company owners / company users
router.post("/google", googleLoginCompany);
router.post("/google/complete", completeGoogleRegistrationCompany);
router.post("/forgot-password", forgotCompanyOwnerPassword);
router.post("/reset-password", resetCompanyOwnerPassword);

/* =============================
    OWNER AUTH ROUTES (PROTECTED)
============================= */

router.get("/profile", protect, protectCompanyOwner, getCompanyOwnerProfile);
router.put("/update-profile", protect, protectCompanyOwner, updateCompanyOwnerProfile);
router.put("/change-password", protect, protectCompanyOwner, changeCompanyOwnerPassword);

export default router;
