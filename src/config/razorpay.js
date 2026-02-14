import Razorpay from "razorpay";

let razorpayClient;

export const getRazorpayClient = () => {
    if (!razorpayClient) {
        const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            throw new Error("Razorpay keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.");
        }
        razorpayClient = new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET,
        });
    }

    return razorpayClient;
};

export default getRazorpayClient;
