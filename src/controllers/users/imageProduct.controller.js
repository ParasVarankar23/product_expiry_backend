import { GoogleGenerativeAI } from "@google/generative-ai";
import Product from "../../models/users/product.model.js";
import { sendBatchNotifications } from "../../services/notification.service.js";
import { uploadBase64File } from "../../utils/cloudinary.utils.js";

/* ======================================================
   ANALYZE PRODUCT IMAGE WITH GEMINI VISION
====================================================== */

export const analyzeProductImage = async (req, res, next) => {
    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({
                success: false,
                message: "Image is required",
            });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                success: false,
                message: "Gemini API key not configured",
            });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Prepare image data
        let imageData;
        if (image.startsWith("data:image")) {
            // Extract base64 data and mime type
            const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid image format",
                });
            }
            imageData = {
                inlineData: {
                    data: matches[2],
                    mimeType: matches[1],
                },
            };
        } else {
            return res.status(400).json({
                success: false,
                message: "Image must be in base64 format",
            });
        }

        const prompt = `
Analyze this product image and extract the following information in JSON format:

{
  "productName": "name of the product",
  "category": "product category (e.g., Dairy, Bakery, Beverage, Snacks, etc.)",
  "expiryDate": "expiry date in YYYY-MM-DD format (if visible)",
  "packingDate": "packing date in YYYY-MM-DD format (if visible)",
  "description": "brief description of the product",
  "confidence": "high/medium/low based on clarity of information"
}

Important:
- If expiry date is not visible or unclear, set it to null
- If packing date is not visible, set it to null
- Try to identify the product even if dates are not visible
- For dates, convert any format to YYYY-MM-DD
- Be accurate with date recognition

Return ONLY valid JSON, no additional text.
`;

        const result = await model.generateContent([prompt, imageData]);
        const response = await result.response;
        const text = response.text();

        // Parse JSON response
        let analysisData;
        try {
            // Clean the response text
            const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
            analysisData = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("Failed to parse Gemini response:", text);
            return res.status(500).json({
                success: false,
                message: "Failed to parse AI response",
                rawResponse: text,
            });
        }

        // Upload image to Cloudinary
        let imageUrl = "";
        try {
            const upload = await uploadBase64File(image, "products");
            imageUrl = upload?.url || "";
        } catch (uploadError) {
            console.error("Image upload failed:", uploadError);
        }

        res.status(200).json({
            success: true,
            message: "Image analyzed successfully",
            analysis: {
                ...analysisData,
                imageUrl,
            },
        });
    } catch (error) {
        console.error("Image analysis error:", error);
        next(error);
    }
};

/* ======================================================
   CREATE PRODUCT FROM IMAGE ANALYSIS
====================================================== */

export const createProductFromImage = async (req, res, next) => {
    try {
        const {
            productName,
            category,
            expiryDate,
            packingDate,
            description,
            imageUrl,
            price,
            stock,
            isAvailableForSale,
        } = req.body;

        if (!productName || !expiryDate) {
            return res.status(400).json({
                success: false,
                message: "Product name and expiry date are required",
            });
        }

        // Validate expiry date is in the future
        const expiryDateObj = new Date(expiryDate);
        const now = new Date();
        if (expiryDateObj < now) {
            return res.status(400).json({
                success: false,
                message: "Product is already expired",
            });
        }

        // Generate AI advice
        const { generateProductAdvice } = await import(
            "../../services/gemini.service.js"
        );
        const aiAdvice = await generateProductAdvice(productName, expiryDate);

        // Create product
        const product = await Product.create({
            name: productName,
            category: category || "",
            description: description || "",
            packingDate: packingDate || null,
            expiryDate,
            image: imageUrl || "",
            price: price || 0,
            stock: stock || 0,
            isAvailableForSale:
                isAvailableForSale !== undefined ? isAvailableForSale : false,
            companyId: req.user.companyId,
            addedBy: req.user._id,
            assignedUsers: [req.user._id], // Auto-assign to creator
            aiAdvice,
        });

        await product.populate("addedBy", "name email phone");
        await product.populate("assignedUsers", "name email phone");

        // Calculate days until expiry
        const daysUntilExpiry = Math.ceil(
            (expiryDateObj - now) / (1000 * 60 * 60 * 24)
        );

        // If product expires within 3 days, send immediate notification
        if (daysUntilExpiry <= 3 && daysUntilExpiry > 0) {
            const usersToNotify = [req.user];
            await sendBatchNotifications(
                usersToNotify,
                product,
                "expiry",
                daysUntilExpiry
            );
        }

        res.status(201).json({
            success: true,
            message: "Product created successfully from image analysis",
            product,
            daysUntilExpiry,
            notificationSent: daysUntilExpiry <= 3,
        });
    } catch (error) {
        console.error("Create product from image error:", error);
        next(error);
    }
};

/* ======================================================
   ANALYZE AND CREATE PRODUCT (ONE STEP)
====================================================== */

export const analyzeAndCreateProduct = async (req, res, next) => {
    try {
        const { image, price, stock, isAvailableForSale } = req.body;

        if (!image) {
            return res.status(400).json({
                success: false,
                message: "Image is required",
            });
        }

        // Step 1: Analyze image
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let imageData;
        if (image.startsWith("data:image")) {
            const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid image format",
                });
            }
            imageData = {
                inlineData: {
                    data: matches[2],
                    mimeType: matches[1],
                },
            };
        } else {
            return res.status(400).json({
                success: false,
                message: "Image must be in base64 format",
            });
        }

        const prompt = `
Analyze this product image and extract the following information in JSON format:

{
  "productName": "name of the product",
  "category": "product category (e.g., Dairy, Bakery, Beverage, Snacks, Frozen Food, Canned Food, etc.)",
  "expiryDate": "expiry date in YYYY-MM-DD format (if visible)",
  "packingDate": "packing date in YYYY-MM-DD format (if visible)",
  "description": "brief description of the product (2-3 sentences)",
  "confidence": "high/medium/low based on clarity of information"
}

Important:
- If expiry date is not visible or unclear, set it to null
- If packing date is not visible, set it to null
- Try to identify the product even if dates are not visible
- For dates, convert any format to YYYY-MM-DD
- Be accurate with date recognition

Return ONLY valid JSON, no additional text.
`;

        const result = await model.generateContent([prompt, imageData]);
        const response = await result.response;
        const text = response.text();

        let analysisData;
        try {
            const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
            analysisData = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("Failed to parse Gemini response:", text);
            return res.status(500).json({
                success: false,
                message: "Failed to parse AI response",
            });
        }

        // Step 2: Upload image
        let imageUrl = "";
        try {
            const upload = await uploadBase64File(image, "products");
            imageUrl = upload?.url || "";
        } catch (uploadError) {
            console.error("Image upload failed:", uploadError);
        }

        // Step 3: Create product if expiry date is available
        if (!analysisData.expiryDate) {
            return res.status(400).json({
                success: false,
                message: "Could not detect expiry date from image. Please provide it manually.",
                analysis: analysisData,
                imageUrl,
            });
        }

        const expiryDateObj = new Date(analysisData.expiryDate);
        const now = new Date();

        if (expiryDateObj < now) {
            return res.status(400).json({
                success: false,
                message: "Product is already expired",
                analysis: analysisData,
            });
        }

        // Generate AI advice
        const { generateProductAdvice } = await import(
            "../../services/gemini.service.js"
        );
        const aiAdvice = await generateProductAdvice(
            analysisData.productName,
            analysisData.expiryDate
        );

        // Create product
        const product = await Product.create({
            name: analysisData.productName,
            category: analysisData.category || "",
            description: analysisData.description || "",
            packingDate: analysisData.packingDate || null,
            expiryDate: analysisData.expiryDate,
            image: imageUrl,
            price: price || 0,
            stock: stock || 0,
            isAvailableForSale:
                isAvailableForSale !== undefined ? isAvailableForSale : false,
            companyId: req.user.companyId,
            addedBy: req.user._id,
            assignedUsers: [req.user._id],
            aiAdvice,
        });

        await product.populate("addedBy", "name email phone");

        // Calculate days until expiry
        const daysUntilExpiry = Math.ceil(
            (expiryDateObj - now) / (1000 * 60 * 60 * 24)
        );

        // Send notification if expiring within 3 days
        if (daysUntilExpiry <= 3 && daysUntilExpiry > 0) {
            const usersToNotify = [req.user];
            await sendBatchNotifications(
                usersToNotify,
                product,
                "expiry",
                daysUntilExpiry
            );
        }

        res.status(201).json({
            success: true,
            message: "Product created successfully from image",
            product,
            analysis: analysisData,
            daysUntilExpiry,
            notificationSent: daysUntilExpiry <= 3,
        });
    } catch (error) {
        console.error("Analyze and create product error:", error);
        next(error);
    }
};
