import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    image: {
        type: String, // Cloudinary URL
        default: null
    },
    imagePublicId: {
        type: String, // Cloudinary public_id for deletion
        default: null
    },
    imageResourceType: {
        type: String, // image | video
        default: 'image'
    },
    isApproved: {
        type: Boolean,
        default: false // Admin can approve to show on testimonials
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

export default mongoose.model('Feedback', feedbackSchema);