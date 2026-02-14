import cloudinary from "cloudinary";

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload a readable stream to Cloudinary (for Zoom recording automation)
export const uploadToCloudinary = (stream, public_id) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.v2.uploader.upload_stream(
            {
                public_id,
                folder: "zoom_recordings",
                resource_type: "video",
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.pipe(uploadStream);
    });
};

/* ============================
   UPLOAD BASE64 FILE
============================ */
export const uploadBase64File = async (base64, folder) => {
    try {
        const res = await cloudinary.v2.uploader.upload(base64, {
            folder,
            resource_type: "auto", // image / video auto-detect
        });

        return {
            url: res.secure_url,
            public_id: res.public_id,
            resource_type: res.resource_type, // ✅ image | video
        };
    } catch (err) {
        console.error("Cloudinary Upload Error:", err);
        return null;
    }
};

/* ============================
   DELETE FILE (SAFE)
============================ */
export const deleteCloudFile = async (public_id, resource_type) => {
    try {
        if (!public_id || !resource_type) return;

        await cloudinary.v2.uploader.destroy(public_id, {
            resource_type, // ✅ image | video
        });
    } catch (err) {
        console.error("Cloudinary Delete Error:", err);
    }
};

export default cloudinary;
