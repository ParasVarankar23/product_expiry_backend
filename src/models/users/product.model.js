import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: [true, "Product name is required"], trim: true },
        category: { type: String, trim: true, default: "" },
        description: { type: String, trim: true, default: "" },
        packingDate: { type: Date, required: false },
        expiryDate: { type: Date, required: [true, "Expiry date is required"] },
        expiredDate: { type: Date, required: false },
        image: { type: String, default: "" },
        price: { type: Number, required: false, min: 0, default: 0 },
        stock: { type: Number, required: false, min: 0, default: 0 },
        isAvailableForSale: { type: Boolean, default: true },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        aiAdvice: { type: String, default: "" },
        status: { type: String, enum: ["active", "expired"], default: "active" },
        notificationsSent: {
            threeDays: { type: Boolean, default: false },
            twoDays: { type: Boolean, default: false },
            oneDay: { type: Boolean, default: false },
            expired: { type: Boolean, default: false },
        },
    },
    {
        timestamps: true,
    }
);

/* ================= AUTO UPDATE STATUS ================= */
productSchema.pre("save", function () {
    try {
        if (this.expiryDate && new Date(this.expiryDate) < new Date()) {
            this.status = "expired";
        } else {
            this.status = "active";
        }
    } catch (err) {
        // do not throw from middleware; log and continue
        console.error("productSchema.pre save error:", err?.message || err);
    }
});

/* ================= INDEXES ================= */
productSchema.index({ addedBy: 1 });
productSchema.index({ assignedUsers: 1 });
productSchema.index({ status: 1 });
productSchema.index({ expiryDate: 1 });

export default mongoose.model("Product", productSchema);
