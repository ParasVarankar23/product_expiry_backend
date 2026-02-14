import express from "express";
import {
    addProduct,
    deleteProduct,
    getProductById,
    getProducts,
    updateProduct,
} from "../../controllers/users/product.controller.js";
import { protect } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   PRODUCT ROUTES (ALL PROTECTED)
====================================================== */

// Add new product (admin/store_manager only)
router.post("/add", protect, addProduct);

// Get all products (role-based filtering)
router.get("/", protect, getProducts);

// Get single product by ID
router.get("/:id", protect, getProductById);

// Update product (admin/owner only)
router.put("/:id", protect, updateProduct);

// Delete product (admin/owner only)
router.delete("/:id", protect, deleteProduct);

export default router;
