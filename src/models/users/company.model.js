import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    companyName: {
        type: String,
        required: true,
        trim: true
    },
    companyCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    ownerName: {
        type: String,
        required: true,
        trim: true
    },
    ownerEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdmin",
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

export default mongoose.model("Company", companySchema);