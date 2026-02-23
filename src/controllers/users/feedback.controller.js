import Feedback from "../../models/users/feedback.model.js";
import { uploadBase64File } from "../../utils/cloudinary.utils.js";

/**
 * Create a new feedback with image upload to Cloudinary
 * POST /api/feedback
 * Body: { name, email, message, rating, image (base64) }
 */
export const createFeedback = async (req, res) => {
    try {
        const { name, email, message, rating, photo, image } = req.body;
        const imageData = photo || image; // Support both 'photo' and 'image' field names

        // Validation
        if (!name || !email || !message || !rating) {
            return res.status(400).json({
                success: false,
                message: "Name, email, message, and rating are required"
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address"
            });
        }

        let imageUrl = null;
        let imagePublicId = null;
        let imageResourceType = "image";

        // Upload image to Cloudinary if provided
        if (imageData?.trim()) {
            // Check if Cloudinary is configured
            if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
                // Continue without image instead of failing
            } else {
                try {
                    const folder = `feedbacks/${new Date().getFullYear()}`;
                    const uploadResult = await uploadBase64File(imageData, folder);

                    if (uploadResult) {
                        imageUrl = uploadResult.url;
                        imagePublicId = uploadResult.public_id;
                        imageResourceType = uploadResult.resource_type;
                    }
                } catch (error) {
                    // Continue without image instead of failing the entire feedback
                }
            }
        }

        // Create feedback
        const feedback = new Feedback({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            message: message.trim(),
            rating: Number(rating),
            image: imageUrl,
            imagePublicId,
            imageResourceType,
            isApproved: true, // Auto-approve to display immediately
            isActive: true
        });

        await feedback.save();

        return res.status(201).json({
            success: true,
            message: "Feedback submitted successfully! It will be reviewed by our team.",
            data: feedback
        });

    } catch (error) {
        console.error("Create Feedback Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit feedback. Please try again later."
        });
    }
};

/**
 * Get all approved feedbacks (for testimonials display)
 * GET /api/feedback
 */
export const getAllFeedbacks = async (req, res) => {
    try {
        const feedbacks = await Feedback.find({
            isApproved: true,
            isActive: true
        })
            .sort({ createdAt: -1 })
            .select("-__v")
            .lean();

        return res.status(200).json({
            success: true,
            data: feedbacks,
            count: feedbacks.length
        });

    } catch (error) {
        console.error("Get Feedbacks Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch feedbacks"
        });
    }
};

/**
 * Get feedback statistics
 * GET /api/feedback/stats
 */
export const getFeedbackStats = async (req, res) => {
    try {
        const stats = await Feedback.aggregate([
            { $match: { isApproved: true, isActive: true } },
            {
                $group: {
                    _id: null,
                    totalFeedback: { $sum: 1 },
                    averageRating: { $avg: "$rating" },
                    fiveStarCount: {
                        $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] },
                    },
                    fourStarCount: {
                        $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] },
                    },
                    threeStarCount: {
                        $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] },
                    },
                    twoStarCount: {
                        $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] },
                    },
                    oneStarCount: {
                        $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] },
                    },
                },
            },
        ]);

        return res.status(200).json({
            success: true,
            data: stats[0] || {
                totalFeedback: 0,
                averageRating: 0,
                fiveStarCount: 0,
                fourStarCount: 0,
                threeStarCount: 0,
                twoStarCount: 0,
                oneStarCount: 0,
            },
        });
    } catch (error) {
        console.error("Get Feedback Stats Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch feedback statistics",
        });
    }
};