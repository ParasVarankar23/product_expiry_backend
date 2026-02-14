import cron from "node-cron";
import { checkExpiryProducts } from "../controllers/users/product.controller.js";

/* ======================================================
   EXPIRY CHECK CRON JOB
   Runs daily at 9:00 AM
====================================================== */

export const startExpiryJob = () => {
    // Schedule: "0 9 * * *" = Every day at 9:00 AM
    // For testing: "*/5 * * * *" = Every 5 minutes
    const schedule = process.env.EXPIRY_CRON_SCHEDULE || "0 9 * * *";

    cron.schedule(schedule, async () => {
        console.log("⏰ [CRON] Running daily expiry check...");
        try {
            const result = await checkExpiryProducts();
            if (result.success) {
                console.log(
                    `✅ [CRON] Expiry check completed. Products checked: ${result.count}`
                );
            } else {
                console.error(
                    `❌ [CRON] Expiry check failed: ${result.error}`
                );
            }
        } catch (error) {
            console.error("❌ [CRON] Error:", error.message);
        }
    });

    console.log(`🕐 Expiry check cron job scheduled: ${schedule}`);
};

/* ======================================================
   MANUAL TRIGGER (OPTIONAL)
====================================================== */

export const triggerExpiryCheckManually = async () => {
    console.log("🔄 Manual expiry check triggered...");
    return await checkExpiryProducts();
};
