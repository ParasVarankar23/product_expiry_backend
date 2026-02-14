import companyModel from "../../models/users/company.model.js";
import User from "../../models/users/user.model.js";
import { generateCompanyCode } from "../../utils/companyCode.utils.js";
import { sendGeneratedPassword } from "../../utils/mailer.utils.js";
import { generatePassword } from "../../utils/passwordGenerator.utils.js";

const PLAN_PRICES = {
    free: 0,
    basic: 999,
    premium: 1999
};

export const createCompany = async (req, res) => {
    try {
        const { ownerName, ownerEmail, companyName, plan } = req.body;
        if (!ownerName || !ownerEmail || !companyName || !plan) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }
        // Check for duplicate owner email
        const existingOwner = await companyModel.findOne({ ownerEmail });
        if (existingOwner) {
            return res.status(400).json({ success: false, message: "Owner email already exists." });
        }
        // Generate unique company code
        let companyCode;
        let exists = true;
        while (exists) {
            companyCode = generateCompanyCode();
            exists = await companyModel.findOne({ companyCode });
        }
        // Free plan: activate immediately
        if (plan === "free") {
            const company = await companyModel.create({
                companyName,
                companyCode,
                ownerName,
                ownerEmail,
                plan,
                planStatus: "active",
                planStartDate: new Date(),
                planEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                paymentCreatedAt: null,
                createdBy: req.superadmin?._id || null
            });
            // Create owner as admin user
            const password = generatePassword(ownerName);
            await User.create({
                name: ownerName,
                email: ownerEmail.toLowerCase(),
                password,
                role: "admin",
                companyId: company._id,
                isVerified: true
            });
            await sendGeneratedPassword(ownerEmail, password, companyCode);
            return res.status(201).json({ success: true, paymentRequired: false, companyCode });
        }
        // Paid plan: create company with pending status
        const company = await companyModel.create({
            companyName,
            companyCode,
            ownerName,
            ownerEmail,
            plan,
            planStatus: "pending",
            createdBy: req.superadmin?._id || null
        });
        // Return payment required info
        return res.status(201).json({
            success: true,
            paymentRequired: true,
            companyId: company._id,
            companyCode,
            amount: PLAN_PRICES[plan],
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
