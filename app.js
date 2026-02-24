import dotenv from "dotenv";
dotenv.config();

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import connectDB from "./src/init/db.js";

// Routes and scheduled jobs are dynamically imported after dotenv.config()
let paymentRoute, superadminRoute, cartRoute, companyRoute, dashboardRoute, feedbackRoute, imageProductRoute, orderRoute, productRoute, userRoute;
let startExpiryJob;

connectDB();

// Dynamically import job and routes after env is configured
({ startExpiryJob } = await import("./src/jobs/expiry.job.js"));
(
    paymentRoute = (await import("./src/routes/superadmin/payment.route.js")).default,
    superadminRoute = (await import("./src/routes/superadmin/superadmin.route.js")).default,
    cartRoute = (await import("./src/routes/users/cart.route.js")).default,
    companyRoute = (await import("./src/routes/users/company.route.js")).default,
    dashboardRoute = (await import("./src/routes/users/dashboard.route.js")).default,
    feedbackRoute = (await import("./src/routes/users/feedback.route.js")).default,
    imageProductRoute = (await import("./src/routes/users/imageProduct.route.js")).default,
    orderRoute = (await import("./src/routes/users/order.route.js")).default,
    productRoute = (await import("./src/routes/users/product.route.js")).default,
    userRoute = (await import("./src/routes/users/user.route.js")).default
);

// Start cron job for expiry checking
startExpiryJob();

const app = express();

/* ================== CORS ================== */
const FRONTEND_ORIGINS = (
    process.env.FRONTEND_ORIGIN ||
    "http://localhost:3000,http://localhost:3001"
)
    .split(",")
    .map((url) => url.trim());

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || FRONTEND_ORIGINS.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);

/* ================== SECURITY HEADERS ================== */
// Allow cross-origin window access for OAuth popups
app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});

/* ================== PARSERS ================== */
// Allow larger request bodies (e.g. base64 image uploads). Configure via .env: BODY_PARSER_LIMIT
const BODY_PARSER_LIMIT = process.env.BODY_PARSER_LIMIT || "10mb";
app.use(express.json({ limit: BODY_PARSER_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_PARSER_LIMIT }));
app.use(cookieParser());

/* ================== ROUTES ================== */

app.use("/api/user", userRoute);
app.use("/api/company", companyRoute);
app.use("/api/products", productRoute);
app.use("/api/dashboard", dashboardRoute);
app.use("/api/cart", cartRoute);
app.use("/api/orders", orderRoute);
app.use("/api/image-product", imageProductRoute);
app.use("/api/feedback", feedbackRoute);
app.use("/api/superadmin", superadminRoute);
app.use("/api/payment", paymentRoute);

/* ================== HEALTH CHECK ================== */
app.get("/", (req, res) => {
    res.json({ success: true, message: "Backend running 🚀" });
});

/* ================== ERROR ================== */
app.use((err, req, res, next) => {
    res.status(500).json({
        success: false,
        message: err.message,
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
