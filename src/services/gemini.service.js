import { GoogleGenerativeAI } from "@google/generative-ai";

/* ======================================================
   INITIALIZE GEMINI AI
====================================================== */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ======================================================
   GENERATE PRODUCT SAFETY ADVICE
====================================================== */

export const generateProductAdvice = async (productName, expiryDate) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("⚠️ GEMINI_API_KEY not configured");
            return "Please check product safety guidelines and consume before expiry.";
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const daysUntilExpiry = Math.ceil(
            (new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
        );

        const prompt = `
You are a product safety expert. Generate a short, clear health and safety advice (max 100 words) for the following:

Product: ${productName}
Days until expiry: ${daysUntilExpiry} days

Focus on:
- Health risks if consumed after expiry
- Storage recommendations
- Safety precautions
- What to look for before consuming

Keep it concise and actionable.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return text.trim();
    } catch (error) {
        console.error("❌ Gemini AI error:", error.message);
        return "Please check product quality before consumption and follow standard food safety guidelines.";
    }
};

/* ======================================================
   GENERATE EXPIRY WARNING
====================================================== */

export const generateExpiryWarning = async (productName, expiryDate, daysRemaining = null) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            if (daysRemaining !== null && daysRemaining <= 0) {
                return `⛔ ${productName} has EXPIRED. Do not consume. Dispose immediately.`;
            }
            return `⚠️ ${productName} is expiring soon. Please consume or dispose safely.`;
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const days = daysRemaining !== null ? daysRemaining : Math.ceil(
            (new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
        );

        let urgencyLevel = "";
        if (days <= 0) {
            urgencyLevel = "CRITICAL - Product is EXPIRED";
        } else if (days === 1) {
            urgencyLevel = "URGENT - Expires TOMORROW";
        } else if (days === 2) {
            urgencyLevel = "HIGH - Expires in 2 days";
        } else if (days === 3) {
            urgencyLevel = "MODERATE - Expires in 3 days";
        } else {
            urgencyLevel = "WARNING - Expiring soon";
        }

        const prompt = `
Generate a SHORT health warning (max 50 words) for:

Product: ${productName}
Expiry Date: ${new Date(expiryDate).toLocaleDateString()}
Days Remaining: ${days <= 0 ? "EXPIRED" : days + " day(s)"}
Urgency: ${urgencyLevel}

Make it ${days <= 0 ? "CRITICAL and direct - tell them to dispose immediately" : days === 1 ? "very urgent" : "urgent but helpful"}. Include specific actionable advice.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return text.trim();
    } catch (error) {
        console.error("❌ Gemini AI error:", error.message);
        if (daysRemaining !== null && daysRemaining <= 0) {
            return `⛔ ${productName} has EXPIRED. Do not consume. Dispose immediately.`;
        }
        return `⚠️ ${productName} is expiring soon on ${new Date(
            expiryDate
        ).toLocaleDateString()}. Check quality before use.`;
    }
};
