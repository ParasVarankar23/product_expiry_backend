import twilio from "twilio";

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

export const sendSMS = async (phoneNumber, message) => {
    try {
        const from = process.env.TWILIO_PHONE_NUMBER;
        const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
        if (!from && !messagingServiceSid) {
            throw new Error("A 'From' phone number or 'MessagingServiceSid' must be set in environment variables.");
        }
        const msgOptions = {
            body: message,
            to: phoneNumber
        };
        if (from) msgOptions.from = from;
        if (!from && messagingServiceSid) msgOptions.messagingServiceSid = messagingServiceSid;

        await twilioClient.messages.create(msgOptions);
        console.log("✅ SMS sent successfully to:", phoneNumber);
    } catch (error) {
        console.error("❌ SMS sending failed:", error.message);
    }
};
