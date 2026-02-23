import express from "express";
import {
    createFeedback,
    getAllFeedbacks,
    getFeedbackStats
} from "../../controllers/users/feedback.controller.js";

const router = express.Router();

// Public routes
router.post("/", createFeedback); // Submit feedback
router.get("/", getAllFeedbacks); // Get approved feedbacks for testimonials
router.get("/stats", getFeedbackStats); // Get feedback statistics

export default router;