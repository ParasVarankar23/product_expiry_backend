import cron from "node-cron";
import { checkExpiryProducts } from "../controllers/users/product.controller.js";

/* ======================================================
   EXPIRY CHECK CRON JOB
   Runs daily at 9:00 AM
====================================================== */

export const startExpiryJob = () => {
    // Schedule: default changed to 15:00 (3:00 PM) server time
    // Use env `EXPIRY_CRON_SCHEDULE` to override. For testing: "*/5 * * * *" = Every 5 minutes
    const schedule = process.env.EXPIRY_CRON_SCHEDULE || "30 16 * * *";

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

    // Schedule hourly 1-hour-before notifications
    const hourlySchedule = process.env.EXPIRY_ONE_HOUR_CRON || "0 * * * *"; // at minute 0 every hour
    cron.schedule(hourlySchedule, async () => {
        console.log("⏰ [CRON] Running hourly 1-hour expiry check...");
        try {
            const result = await import("../controllers/users/product.controller.js").then(m => m.checkExpiryOneHour());
            if (result.success) {
                console.log(`✅ [CRON] 1-hour expiry check completed. Products checked: ${result.count}`);
            } else {
                console.error(`❌ [CRON] 1-hour expiry check failed: ${result.error}`);
            }
        } catch (error) {
            console.error("❌ [CRON] Error in 1-hour expiry check:", error.message);
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
