import companyModel from "../../models/users/company.model.js";
import Product from "../../models/users/product.model.js";
import User from "../../models/users/user.model.js";
import { generateProductAdvice } from "../../services/gemini.service.js";
import {
    sendBatchNotifications
} from "../../services/notification.service.js";
import { uploadBase64File } from "../../utils/cloudinary.utils.js";

/* ======================================================
   ADD PRODUCT (ADMIN / STORE MANAGER)
====================================================== */

export const addProduct = async (req, res, next) => {
    try {
        const { name, category, description, packingDate, expiryDate, expiredDate, image, assignedUsers, price, stock, isAvailableForSale } = req.body;

        // Validate required fields
        if (!name || !expiryDate) {
            return res.status(400).json({
                success: false,
                message: "Product name and expiry date are required",
            });
        }

        // Determine caller role (support company owner tokens)
        const callerRole = req.user?.role || (req.company ? "company" : null);

        if (!callerRole) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // Check role authorization: allow admin or manager (company owner can act as admin but must have a user context)
        if (callerRole !== "admin" && callerRole !== "manager" && callerRole !== "company") {
            return res.status(403).json({ success: false, message: "Only Admin or Manager can add products" });
        }

        // If req.user is missing we'll map the company owner to a user later (below)

        // Upload image to Cloudinary if base64 provided
        let imageUrl = "";
        if (image && image.startsWith("data:")) {
            const upload = await uploadBase64File(image, "products");
            imageUrl = upload?.url || "";
        } else if (image) {
            imageUrl = image;
        }

        // Generate AI advice (tolerate failures from the external service)
        let aiAdvice = "";
        try {
            aiAdvice = await generateProductAdvice(name, expiryDate);
        } catch (aiErr) {
            console.error("generateProductAdvice failed:", aiErr?.message || aiErr);
            aiAdvice = "";
        }

        // Determine addedBy: prefer authenticated user, otherwise try to map company owner to a user
        let addedById = req.user?._id;
        if (!addedById && req.company) {
            // Try to find a user record for the company owner
            let ownerUser = await User.findOne({ email: req.company.ownerEmail, companyId: req.company._id });
            if (!ownerUser) {
                // create a lightweight owner user so products have an addedBy reference
                const tmpPassword = `owner-${Date.now()}`;
                ownerUser = await User.create({
                    name: req.company.ownerName || "Company Owner",
                    email: req.company.ownerEmail,
                    password: tmpPassword,
                    role: "admin",
                    companyId: req.company._id,
                    isVerified: true,
                });
            }
            addedById = ownerUser._id;
        }

        // Create product
        const product = await Product.create({
            name,
            category: category || "",
            description: description || "",
            packingDate: packingDate || null,
            expiryDate,
            expiredDate: expiredDate || null,
            image: imageUrl,
            price: price || 0,
            stock: stock || 0,
            isAvailableForSale: isAvailableForSale !== undefined ? isAvailableForSale : true,
            companyId: req.user?.companyId || req.company?._id,
            addedBy: addedById,
            assignedUsers: assignedUsers || [],
            aiAdvice,
        });

        // Populate for response
        await product.populate("addedBy", "name email phone");
        await product.populate("assignedUsers", "name email phone");

        // Send notifications to assigned users and all users in the company (deduped) including company owner email
        try {
            const usersToNotifyMap = new Map();

            if (assignedUsers && assignedUsers.length > 0) {
                const assigned = await User.find({ _id: { $in: assignedUsers } });
                assigned.forEach((u) => usersToNotifyMap.set(u._id.toString(), u));
            }

            // Include all company users and owner email
            if (product.companyId) {
                try {
                    const companyUsers = await User.find({ companyId: product.companyId });
                    companyUsers.forEach((u) => usersToNotifyMap.set(u._id.toString(), u));

                    const company = await companyModel.findById(product.companyId);
                    if (company && company.ownerEmail) {
                        const ownerKey = `owner-${company.ownerEmail}`;
                        if (!Array.from(usersToNotifyMap.values()).some(u => u.email === company.ownerEmail)) {
                            usersToNotifyMap.set(ownerKey, { email: company.ownerEmail, name: company.ownerName || 'Company Owner' });
                        }
                    }
                } catch (e) {
                    console.error("Failed to load company users for new-product notifications:", e?.message || e);
                }
            }

            const usersToNotify = Array.from(usersToNotifyMap.values());
            if (usersToNotify.length > 0) {
                await sendBatchNotifications(usersToNotify, product, "new");
            }
        } catch (notifyErr) {
            console.error("Failed to send new-product notifications:", notifyErr?.message || notifyErr);
        }

        res.status(201).json({
            success: true,
            message: "Product added successfully",
            product,
        });
    } catch (error) {
        console.error("addProduct error:", error);
        if (error && error.stack) console.error(error.stack);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GET PRODUCTS (ROLE-BASED)
====================================================== */

export const getProducts = async (req, res, next) => {
    try {
        const { status, category, search, limit = 50, page = 1 } = req.query;

        let query = {};

        // Role-based filtering
        const callerRole = req.user?.role || (req.company ? "admin" : null);
        if (!callerRole) return res.status(401).json({ success: false, message: "Unauthorized" });

        // Resolve current user id (if present)
        const currentUserId = req.user?._id;

        if (callerRole === "admin") {
            // Admin sees all products
        } else if (callerRole === "manager") {
            // Manager sees only their products
            if (currentUserId) query.addedBy = currentUserId;
        } else {
            // Regular user: show products assigned to them OR products belonging to their company
            if (currentUserId) {
                // if companyId available on user, include company products too
                if (req.user.companyId) {
                    query.$or = [
                        { assignedUsers: currentUserId },
                        { companyId: req.user.companyId },
                    ];
                } else {
                    query.assignedUsers = currentUserId;
                }
            }
        }

        // Additional filters
        if (status) query.status = status;
        if (category) query.category = new RegExp(category, "i");
        if (search) query.name = new RegExp(search, "i");

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const products = await Product.find(query)
            .populate("addedBy", "name email role")
            .populate("assignedUsers", "name email phone")
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        const total = await Product.countDocuments(query);

        res.status(200).json({
            success: true,
            products,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("getProducts error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   GET PRODUCT BY ID
====================================================== */

export const getProductById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id)
            .populate("addedBy", "name email role")
            .populate("assignedUsers", "name email phone");

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Check access rights
        const callerRole = req.user?.role || (req.company ? "admin" : null);

        const userId = req.user?._id?.toString();

        const hasAccess =
            callerRole === "admin" ||
            (userId && product.addedBy?._id?.toString() === userId) ||
            (userId && product.assignedUsers.some((user) => user._id.toString() === userId)) ||
            (!!req.company); // company owner has access to company products

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        res.status(200).json({
            success: true,
            product,
        });
    } catch (error) {
        console.error("getProductById error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   UPDATE PRODUCT
====================================================== */

export const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, category, description, expiryDate, image, assignedUsers, price, stock, isAvailableForSale } =
            req.body;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Check ownership / permission
        const callerRole = req.user?.role || (req.company ? "admin" : null);
        const userId = req.user?._id?.toString();

        const isOwner =
            callerRole === "admin" ||
            (userId && product.addedBy.toString() === userId) ||
            !!req.company;

        if (!isOwner) {
            return res.status(403).json({ success: false, message: "Only admin or product owner can update" });
        }

        // Update fields
        if (name) product.name = name;
        if (category) product.category = category;
        if (description) product.description = description;
        if (expiryDate) product.expiryDate = expiryDate;
        if (assignedUsers) product.assignedUsers = assignedUsers;
        if (price !== undefined) product.price = price;
        if (stock !== undefined) product.stock = stock;
        if (isAvailableForSale !== undefined) product.isAvailableForSale = isAvailableForSale;

        // Update image if provided
        if (image) {
            if (image.startsWith("data:")) {
                const upload = await uploadBase64File(image, "products");
                product.image = upload?.url || product.image;
            } else {
                product.image = image;
            }
        }

        // Regenerate AI advice if name or expiry changed
        if (name || expiryDate) {
            try {
                product.aiAdvice = await generateProductAdvice(product.name, product.expiryDate);
            } catch (aiErr) {
                console.error("generateProductAdvice failed on update:", aiErr?.message || aiErr);
                product.aiAdvice = product.aiAdvice || "";
            }
        }

        await product.save();

        await product.populate("addedBy", "name email role");
        await product.populate("assignedUsers", "name email phone");

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product,
        });
    } catch (error) {
        console.error("updateProduct error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   DELETE PRODUCT
====================================================== */

export const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Check ownership / permission
        const callerRole = req.user?.role || (req.company ? "admin" : null);
        const userId = req.user?._id?.toString();

        const isOwner =
            callerRole === "admin" ||
            (userId && product.addedBy.toString() === userId) ||
            !!req.company;

        if (!isOwner) {
            return res.status(403).json({ success: false, message: "Only admin or product owner can delete" });
        }

        await Product.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Product deleted successfully",
        });
    } catch (error) {
        console.error("deleteProduct error:", error?.message || error);
        return res.status(500).json({ success: false, message: error?.message || "Internal server error" });
    }
};

/* ======================================================
   CHECK EXPIRY PRODUCTS (CRON READY)
   Sends notifications at 3 days, 2 days, 1 day before expiry, and when expired
====================================================== */

export const checkExpiryProducts = async () => {
    try {
        console.log("🔍 Running expiry check...");

        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today

        const threeDaysFromNow = new Date(now);
        threeDaysFromNow.setDate(now.getDate() + 3);
        threeDaysFromNow.setHours(23, 59, 59, 999);

        const twoDaysFromNow = new Date(now);
        twoDaysFromNow.setDate(now.getDate() + 2);
        twoDaysFromNow.setHours(23, 59, 59, 999);

        const oneDayFromNow = new Date(now);
        oneDayFromNow.setDate(now.getDate() + 1);
        oneDayFromNow.setHours(23, 59, 59, 999);

        // Find products expiring within 3 days or already expired
        const expiringProducts = await Product.find({
            expiryDate: { $lte: threeDaysFromNow },
            status: { $in: ["active", "expired"] },
        })
            .populate("addedBy", "name email phone")
            .populate("assignedUsers", "name email phone");

        console.log(`📦 Found ${expiringProducts.length} expiring products`);

        let notificationsSent = 0;

        for (const product of expiringProducts) {
            const expiryDate = new Date(product.expiryDate);
            expiryDate.setHours(0, 0, 0, 0);

            // Calculate days remaining
            const diffTime = expiryDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            console.log(`📅 Product: ${product.name}, Days remaining: ${daysRemaining}`);

            // Update status if expired
            if (daysRemaining < 0 && product.status !== "expired") {
                product.status = "expired";
                if (!product.expiredDate) {
                    product.expiredDate = now;
                }
            }

            // Determine if we should send notification
            let shouldNotify = false;
            let notificationType = "";
            let notificationFlag = null;

            if (daysRemaining <= 0 && product.notificationsSent.expired === false) {
                shouldNotify = true;
                notificationType = "expired";
                notificationFlag = "expired";
            } else if (daysRemaining === 1 && product.notificationsSent.oneDay === false) {
                shouldNotify = true;
                notificationType = "oneDay";
                notificationFlag = "oneDay";
            } else if (daysRemaining === 2 && product.notificationsSent.twoDays === false) {
                shouldNotify = true;
                notificationType = "twoDays";
                notificationFlag = "twoDays";
            } else if (daysRemaining === 3 && product.notificationsSent.threeDays === false) {
                shouldNotify = true;
                notificationType = "threeDays";
                notificationFlag = "threeDays";
            }

            if (shouldNotify) {
                console.log(`🔔 Sending ${notificationType} notification for: ${product.name}`);

                // Regenerate AI advice based on urgency
                const { generateExpiryWarning } = await import(
                    "../../services/gemini.service.js"
                );
                product.aiAdvice = await generateExpiryWarning(
                    product.name,
                    product.expiryDate,
                    daysRemaining
                );

                // Collect all users to notify (deduped) and include company users + owner email if present
                const usersMap = new Map();
                if (product.addedBy) usersMap.set(product.addedBy._id.toString(), product.addedBy);
                if (product.assignedUsers && product.assignedUsers.length > 0) {
                    product.assignedUsers.forEach((u) => usersMap.set(u._id.toString(), u));
                }

                if (product.companyId) {
                    try {
                        const companyUsers = await User.find({ companyId: product.companyId });
                        companyUsers.forEach((u) => usersMap.set(u._id.toString(), u));

                        // include company owner email even if owner isn't a User
                        const company = await companyModel.findById(product.companyId);
                        if (company && company.ownerEmail) {
                            const ownerKey = `owner-${company.ownerEmail}`;
                            if (!Array.from(usersMap.values()).some(u => u.email === company.ownerEmail)) {
                                usersMap.set(ownerKey, { email: company.ownerEmail, name: company.ownerName || 'Company Owner' });
                            }
                        }
                    } catch (e) {
                        console.error("Failed to load company users for expiry notifications:", e?.message || e);
                    }
                }

                const usersToNotify = Array.from(usersMap.values());
                if (usersToNotify.length > 0) {
                    try {
                        await sendBatchNotifications(usersToNotify, product, "expiry", daysRemaining);
                        // mark flag only after successful send
                        if (notificationFlag) {
                            product.notificationsSent[notificationFlag] = true;
                        }
                        notificationsSent++;
                    } catch (e) {
                        console.error(`Failed to send ${notificationType} notifications for ${product.name}:`, e?.message || e);
                        // do not set the notificationsSent flag so it can be retried later
                    }
                }
            }

            await product.save();
        }

        console.log(`✅ Expiry check completed. Notifications sent: ${notificationsSent}`);
        return {
            success: true,
            count: expiringProducts.length,
            notificationsSent
        };
    } catch (error) {
        console.error("❌ Expiry check failed:", error.message);
        return { success: false, error: error.message };
    }
};

/* ======================================================
   CHECK EXPIRY WITHIN ONE HOUR
   Sends a 1-hour-before notification (runs hourly)
====================================================== */
export const checkExpiryOneHour = async () => {
    try {
        console.log("🔍 Running 1-hour expiry check...");

        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

        // Find products expiring within the next hour and not yet flagged for oneHour
        const products = await Product.find({
            expiryDate: { $lte: oneHourFromNow, $gte: now },
            status: { $in: ["active"] },
            "notificationsSent.oneHour": false,
        })
            .populate("addedBy", "name email phone")
            .populate("assignedUsers", "name email phone");

        console.log(`📦 Found ${products.length} products expiring within an hour`);

        let notificationsSent = 0;

        for (const product of products) {
            // Calculate minutes remaining
            const diffMs = new Date(product.expiryDate).getTime() - now.getTime();
            const minutesRemaining = Math.ceil(diffMs / (1000 * 60));

            // Regenerate AI advice for urgency
            try {
                const { generateExpiryWarning } = await import(
                    "../../services/gemini.service.js"
                );
                product.aiAdvice = await generateExpiryWarning(
                    product.name,
                    product.expiryDate,
                    0
                );
            } catch (e) {
                // ignore
            }

            // Collect users: addedBy, assignedUsers, and all company users
            const usersMap = new Map();
            if (product.addedBy) usersMap.set(product.addedBy._id.toString(), product.addedBy);
            if (product.assignedUsers && product.assignedUsers.length > 0) {
                product.assignedUsers.forEach((u) => usersMap.set(u._id.toString(), u));
            }

            if (product.companyId) {
                try {
                    const companyUsers = await User.find({ companyId: product.companyId });
                    companyUsers.forEach((u) => usersMap.set(u._id.toString(), u));
                } catch (e) {
                    console.error("Failed to load company users for 1-hour notifications:", e?.message || e);
                }
            }

            const usersToNotify = Array.from(usersMap.values());

            if (usersToNotify.length > 0) {
                await sendBatchNotifications(usersToNotify, product, "expiry", Math.ceil(minutesRemaining / 1440));
                notificationsSent++;
            }

            product.notificationsSent.oneHour = true;
            await product.save();
        }

        console.log(`✅ 1-hour expiry check completed. Notifications sent: ${notificationsSent}`);
        return { success: true, count: products.length, notificationsSent };
    } catch (error) {
        console.error("❌ 1-hour expiry check failed:", error?.message || error);
        return { success: false, error: error?.message };
    }
};
