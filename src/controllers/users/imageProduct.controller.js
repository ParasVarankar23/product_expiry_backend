import companyModel from "../../models/users/company.model.js";
import Product from "../../models/users/product.model.js";
import User from "../../models/users/user.model.js";
import { getDetectedModel, getGenerativeModelInstance } from "../../services/gemini.service.js";
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

        // Use the detected model instance from gemini.service if available
        let model = getGenerativeModelInstance();
        if (!model) {
            const detected = getDetectedModel();
            console.error("Gemini model unavailable for image analysis; detected:", detected);
            return res.status(503).json({ success: false, message: "AI image analysis is currently unavailable. Please provide expiry details manually." });
        }

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

        let text;
        try {
            const result = await model.generateContent([prompt, imageData]);
            const response = await result.response;
            text = response.text();
        } catch (aiErr) {
            console.error("Image analysis error:", aiErr?.message || aiErr);
            // Try to extract retry seconds from error message
            const msg = aiErr?.message || String(aiErr);
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i) || msg.match(/retryDelay\"\:\"(\d+)s/i);
            const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;
            if (retrySeconds) {
                res.setHeader("Retry-After", String(retrySeconds));
                return res.status(429).json({ success: false, message: `AI quota exceeded. Please retry after ${retrySeconds} seconds.` });
            }
            return res.status(503).json({ success: false, message: "AI image analysis is currently unavailable. Please try again later." });
        }

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
        console.error("Image analysis error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
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

        // Determine companyId and addedBy (support owner tokens)
        let companyId = req.user?.companyId || req.company?._id;
        let addedById = req.user?._id;
        if (!addedById && req.company) {
            // Try to find a user record for the company owner
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) addedById = ownerUser._id;
        }

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
            companyId,
            addedBy: addedById,
            assignedUsers: addedById ? [addedById] : [], // Auto-assign to creator when available
            aiAdvice,
        });

        await product.populate("addedBy", "name email phone");
        await product.populate("assignedUsers", "name email phone");

        // Calculate days until expiry
        const daysUntilExpiry = Math.ceil(
            (expiryDateObj - now) / (1000 * 60 * 60 * 24)
        );

        // Send 'new' notifications to assigned users + company users (deduped)
        try {
            const usersMap = new Map();
            if (product.addedBy) usersMap.set(product.addedBy._id.toString(), product.addedBy);
            if (product.assignedUsers && product.assignedUsers.length > 0) product.assignedUsers.forEach(u => usersMap.set(u._id.toString(), u));
            if (product.companyId) {
                const companyUsers = await User.find({ companyId: product.companyId });
                companyUsers.forEach(u => usersMap.set(u._id.toString(), u));
                try {
                    const company = await companyModel.findById(product.companyId);
                    if (company && company.ownerEmail) {
                        const ownerKey = `owner-${company.ownerEmail}`;
                        if (!Array.from(usersMap.values()).some(u => u.email === company.ownerEmail)) {
                            usersMap.set(ownerKey, { email: company.ownerEmail, name: company.ownerName || 'Company Owner' });
                        }
                    }
                } catch (e) {
                    console.error('Failed to load company owner for new-product notifications:', e?.message || e);
                }
            }
            const usersToNotify = Array.from(usersMap.values());
            if (usersToNotify.length > 0) {
                await sendBatchNotifications(usersToNotify, product, "new");
            }
        } catch (e) {
            console.error("Failed to send new-product notifications:", e?.message || e);
        }

        // If product expires within 3 days, send immediate expiry notification as well
        if (daysUntilExpiry <= 3 && daysUntilExpiry > 0) {
            try {
                const usersMap2 = new Map();
                if (product.addedBy) usersMap2.set(product.addedBy._id.toString(), product.addedBy);
                if (product.assignedUsers && product.assignedUsers.length > 0) product.assignedUsers.forEach(u => usersMap2.set(u._id.toString(), u));
                if (product.companyId) {
                    const companyUsers = await User.find({ companyId: product.companyId });
                    companyUsers.forEach(u => usersMap2.set(u._id.toString(), u));
                    try {
                        const company = await companyModel.findById(product.companyId);
                        if (company && company.ownerEmail) {
                            const ownerKey = `owner-${company.ownerEmail}`;
                            if (!Array.from(usersMap2.values()).some(u => u.email === company.ownerEmail)) {
                                usersMap2.set(ownerKey, { email: company.ownerEmail, name: company.ownerName || 'Company Owner' });
                            }
                        }
                    } catch (e) {
                        console.error('Failed to load company owner for immediate expiry notifications:', e?.message || e);
                    }
                }
                const usersToNotifyExpiry = Array.from(usersMap2.values());
                if (usersToNotifyExpiry.length > 0) {
                    await sendBatchNotifications(usersToNotifyExpiry, product, "expiry", daysUntilExpiry);
                }
            } catch (e) {
                console.error("Failed to send immediate expiry notifications:", e?.message || e);
            }
        }

        res.status(201).json({
            success: true,
            message: "Product created successfully from image analysis",
            product,
            daysUntilExpiry,
            notificationSent: daysUntilExpiry <= 3,
        });
    } catch (error) {
        console.error("createProductFromImage error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
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
        // use detected model instance
        let model = getGenerativeModelInstance();
        if (!model) {
            const detected = getDetectedModel();
            console.error("Gemini model unavailable for analyze-and-create; detected:", detected);
            return res.status(503).json({ success: false, message: "AI image analysis is currently unavailable. Please provide expiry details manually." });
        }

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

        let text;
        try {
            const result = await model.generateContent([prompt, imageData]);
            const response = await result.response;
            text = response.text();
        } catch (aiErr) {
            console.error("Image analysis error:", aiErr?.message || aiErr);
            const msg = aiErr?.message || String(aiErr);
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i) || msg.match(/retryDelay\"\:\"(\d+)s/i);
            const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;
            if (retrySeconds) {
                res.setHeader("Retry-After", String(retrySeconds));
                return res.status(429).json({ success: false, message: `AI quota exceeded. Please retry after ${retrySeconds} seconds.`, retryAfter: retrySeconds });
            }
            return res.status(503).json({ success: false, message: "AI image analysis is currently unavailable. Please try again later." });
        }

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

        // Determine companyId and addedBy (support owner tokens)
        let companyId = req.user?.companyId || req.company?._id;
        let addedById = req.user?._id;
        if (!addedById && req.company) {
            const ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (ownerUser) addedById = ownerUser._id;
        }

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
            companyId,
            addedBy: addedById,
            assignedUsers: addedById ? [addedById] : [],
            aiAdvice,
        });

        await product.populate("addedBy", "name email phone");

        // Calculate days until expiry
        const daysUntilExpiry = Math.ceil(
            (expiryDateObj - now) / (1000 * 60 * 60 * 24)
        );

        // Send notification if expiring within 3 days — notify creator, assigned users, and company users
        if (daysUntilExpiry <= 3 && daysUntilExpiry > 0) {
            try {
                const usersMap = new Map();
                if (product.addedBy) usersMap.set(product.addedBy._id.toString(), product.addedBy);
                if (product.assignedUsers && product.assignedUsers.length > 0) product.assignedUsers.forEach(u => usersMap.set(u._id.toString(), u));
                if (product.companyId) {
                    const companyUsers = await User.find({ companyId: product.companyId });
                    companyUsers.forEach(u => usersMap.set(u._id.toString(), u));
                    try {
                        const company = await companyModel.findById(product.companyId);
                        if (company && company.ownerEmail) {
                            const ownerKey = `owner-${company.ownerEmail}`;
                            if (!Array.from(usersMap.values()).some(u => u.email === company.ownerEmail)) {
                                usersMap.set(ownerKey, { email: company.ownerEmail, name: company.ownerName || 'Company Owner' });
                            }
                        }
                    } catch (e) {
                        console.error('Failed to load company owner for immediate expiry notifications (analyzeAndCreate):', e?.message || e);
                    }
                }
                const usersToNotify = Array.from(usersMap.values());
                if (usersToNotify.length > 0) {
                    await sendBatchNotifications(
                        usersToNotify,
                        product,
                        "expiry",
                        daysUntilExpiry
                    );
                }
            } catch (e) {
                console.error("Failed to send immediate expiry notifications (analyzeAndCreate):", e?.message || e);
            }
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
        console.error("analyzeAndCreateProduct error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};
