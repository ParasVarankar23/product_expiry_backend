import cloudinary from "./cloudinary.utils.js";

export const uploadBase64Image = async (base64String, folder = "notifications") => {
    try {
        if (!base64String?.startsWith("data:image/")) return null;

        const upload = await cloudinary.uploader.upload(base64String, {
            folder,
            resource_type: "image",
            transformation: [
                { width: 800, crop: "limit" },
                { quality: "auto" }
            ]
        });

        return upload.secure_url;

    } catch (err) {
        console.log("Cloudinary Upload Error:", err);
        return null;
    }
};
