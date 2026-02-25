import { GoogleGenerativeAI } from "@google/generative-ai";

/* ======================================================
   INITIALIZE GEMINI AI + AUTO-DETECT MODEL
   - Detects a model supported by your API key at startup
   - Chooses the first model that supports generation methods
   - Falls back gracefully to a non-AI message when no model is available
====================================================== */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// console.log("Loaded GEMINI_API_KEY:", process.env.GEMINI_API_KEY);

let SELECTED_MODEL = null; // e.g. 'text-bison-001' or 'gemini-1.5-flash'
let RATE_LIMITED_UNTIL = 0; // timestamp (ms) until which API calls should be skipped due to quota

const modelIdFromName = (name) => (typeof name === "string" ? name.replace(/^models\//, "") : name);

const detectSupportedModel = async () => {
    if (!process.env.GEMINI_API_KEY) return;
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) {
            const txt = await res.text();
            // If rate-limited, try to parse RetryInfo and set cooldown
            try {
                const retryMatch = txt.match(/retry in (\d+(?:\.\d+)?)s/i) || txt.match(/retryDelay"?:"?(\d+)s/i);
                const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;
                if (retrySeconds) {
                    RATE_LIMITED_UNTIL = Date.now() + retrySeconds * 1000;
                    console.warn(`Model list rate-limited — skipping AI calls until ${new Date(RATE_LIMITED_UNTIL).toISOString()}`);
                }
            } catch (e) {
                // fallthrough
            }
            console.warn("ListModels failed:", res.status, txt);
            return;
        }
        const data = await res.json();
        const models = data.models || [];

        // Prefer a model that advertises generateContent/generateText
        const candidate = models.find((m) => {
            const methods = m.supportedMethods || m.methods || [];
            return methods.includes("generateContent") || methods.includes("generateText") || methods.includes("chat");
        }) || models[0];

        if (candidate && candidate.name) {
            SELECTED_MODEL = modelIdFromName(candidate.name);
            console.log("Selected AI model:", candidate.name, "->", SELECTED_MODEL);
        } else if (candidate) {
            SELECTED_MODEL = modelIdFromName(candidate);
            console.log("Selected AI model (raw):", SELECTED_MODEL);
        } else {
            console.warn("No AI models available for this API key");
        }
    } catch (err) {
        console.warn("Model detection failed:", err?.message || err);
    }
};

// Start detection in background (non-blocking)
detectSupportedModel();

// Export helper to allow other modules to use the detected model / model instance
export const getDetectedModel = () => SELECTED_MODEL;

export const getGenerativeModelInstance = () => {
    if (!SELECTED_MODEL) return null;
    try {
        return genAI.getGenerativeModel({ model: SELECTED_MODEL });
    } catch (err) {
        console.warn("Failed to create generative model instance:", err?.message || err);
        return null;
    }
};
/* ======================================================
   GENERATE PRODUCT SAFETY ADVICE
====================================================== */

export const generateProductAdvice = async (productName, expiryDate) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("⚠️ GEMINI_API_KEY not configured");
            return "Please check product safety guidelines and consume before expiry.";
        }

        // Short-circuit if we recently hit a rate-limit
        if (Date.now() < RATE_LIMITED_UNTIL) {
            console.warn(`Skipping AI generation until ${new Date(RATE_LIMITED_UNTIL).toISOString()} due to prior rate-limit`);
            return "Please check product safety guidelines and consume before expiry.";
        }

        // Choose detected model if available
        if (!SELECTED_MODEL) {
            console.warn("No AI model selected; skipping generation and returning fallback advice.");
            return "Please check product safety guidelines and consume before expiry.";
        }

        const model = genAI.getGenerativeModel({ model: SELECTED_MODEL });

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
        // If rate-limited, set cooldown to avoid repeated calls
        try {
            const msg = error?.message || String(error);
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i) || msg.match(/retryDelay"?:"?(\d+)s/i);
            const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;
            if (retrySeconds) {
                RATE_LIMITED_UNTIL = Date.now() + retrySeconds * 1000;
                console.warn(`Gemini rate-limited; skipping further AI calls until ${new Date(RATE_LIMITED_UNTIL).toISOString()}`);
            }
        } catch (e) {
            // ignore
        }
        console.warn("❌ Gemini AI error:", error?.message || error);
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

        // Short-circuit if rate-limited
        if (Date.now() < RATE_LIMITED_UNTIL) {
            console.warn(`Skipping AI expiry warning until ${new Date(RATE_LIMITED_UNTIL).toISOString()} due to prior rate-limit`);
            if (daysRemaining !== null && daysRemaining <= 0) {
                return `⛔ ${productName} has EXPIRED. Do not consume. Dispose immediately.`;
            }
            return `⚠️ ${productName} is expiring soon. Please consume or dispose safely.`;
        }

        if (!SELECTED_MODEL) {
            if (daysRemaining !== null && daysRemaining <= 0) {
                return `⛔ ${productName} has EXPIRED. Do not consume. Dispose immediately.`;
            }
            console.warn("No AI model selected; using simple expiry warning fallback.");
            return `⚠️ ${productName} is expiring soon. Please consume or dispose safely.`;
        }

        const model = genAI.getGenerativeModel({ model: SELECTED_MODEL });

        const days = daysRemaining !== null ? daysRemaining : Math.ceil(
            (new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
        );

        let urgencyLevel = "";
        if (days <= 0) urgencyLevel = "CRITICAL - Product is EXPIRED";
        else if (days === 1) urgencyLevel = "URGENT - Expires TOMORROW";
        else if (days === 2) urgencyLevel = "HIGH - Expires in 2 days";
        else if (days === 3) urgencyLevel = "MODERATE - Expires in 3 days";
        else urgencyLevel = "WARNING - Expiring soon";

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
        // If rate-limited, set cooldown to avoid repeated attempts
        try {
            const msg = error?.message || String(error);
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i) || msg.match(/retryDelay"?:"?(\d+)s/i);
            const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;
            if (retrySeconds) {
                RATE_LIMITED_UNTIL = Date.now() + retrySeconds * 1000;
                console.warn(`Gemini rate-limited; skipping further AI calls until ${new Date(RATE_LIMITED_UNTIL).toISOString()}`);
            }
        } catch (e) {
            // ignore
        }
        console.warn("❌ Gemini AI error:", error?.message || error);
        if (daysRemaining !== null && daysRemaining <= 0) {
            return `⛔ ${productName} has EXPIRED. Do not consume. Dispose immediately.`;
        }
        return `⚠️ ${productName} is expiring soon on ${new Date(
            expiryDate
        ).toLocaleDateString()}. Check quality before use.`;
    }
};