import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            // Owner is stored only on Company model; userId is optional to allow company-owned carts
            required: false,
        },
        items: [
            {
                productId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                    default: 1,
                },
                addedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Index for faster queries
cartSchema.index({ userId: 1 });
cartSchema.index({ companyId: 1 });

export default mongoose.model("Cart", cartSchema);
