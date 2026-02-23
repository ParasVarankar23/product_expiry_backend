import express from "express";
import {
    analyzeAndCreateProduct,
    analyzeProductImage,
    createProductFromImage,
} from "../../controllers/users/imageProduct.controller.js";
import { protect } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   IMAGE PRODUCT ROUTES (ALL PROTECTED)
====================================================== */

// Analyze product image only (no creation)
router.post("/analyze", protect, analyzeProductImage);

// Create product from analyzed data
router.post("/create-from-analysis", protect, createProductFromImage);

// Analyze and create product in one step
router.post("/analyze-and-create", protect, analyzeAndCreateProduct);

export default router;
