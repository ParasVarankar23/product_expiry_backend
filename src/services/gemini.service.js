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

export const generateExpiryWarning = async (productName, expiryDate) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return `⚠️ ${productName} is expiring soon. Please consume or dispose safely.`;
        }

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
Generate a SHORT urgent health warning (max 50 words) for:

Product: ${productName}
Expiry Date: ${new Date(expiryDate).toLocaleDateString()}

Make it urgent but not alarming. Include actionable advice.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return text.trim();
    } catch (error) {
        console.error("❌ Gemini AI error:", error.message);
        return `⚠️ ${productName} is expiring soon on ${new Date(
            expiryDate
        ).toLocaleDateString()}. Check quality before use.`;
    }
};
