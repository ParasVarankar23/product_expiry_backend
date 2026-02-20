import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import connectDB from "./src/init/db.js";
import { startExpiryJob } from "./src/jobs/expiry.job.js";


import paymentRoute from "./src/routes/superadmin/payment.route.js";
import superadminRoute from "./src/routes/superadmin/superadmin.route.js";
import dashboardRoute from "./src/routes/users/dashboard.route.js";
import productRoute from "./src/routes/users/product.route.js";
import userRoute from "./src/routes/users/user.route.js";

dotenv.config();
connectDB();

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

/* ================== PARSERS ================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ================== ROUTES ================== */

app.use("/api/user", userRoute);
app.use("/api/product", productRoute);
app.use("/api/dashboard", dashboardRoute);
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
