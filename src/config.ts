const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY || "";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
const RAZORPAY_BRAND_NAME = process.env.RAZORPAY_BRAND_NAME || "College Notes";
const RAZORPAY_THEME_COLOR = process.env.RAZORPAY_THEME_COLOR || "#FF6A3D";

// MinIO Configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "localhost";
const MINIO_PORT = parseInt(process.env.MINIO_PORT || "9000");
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "notes-app";
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === "true";

export const config = {
    baseUrl: BASE_URL,
    minio: {
        endPoint: MINIO_ENDPOINT,
        port: MINIO_PORT,
        useSSL: MINIO_USE_SSL,
        accessKey: MINIO_ACCESS_KEY,
        secretKey: MINIO_SECRET_KEY,
        bucket: MINIO_BUCKET,
        // Get public URL for a file
        getFileUrl: (fileName: string) =>
            `http://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}/${fileName}`
    },
    otp: {
        apiKey: TWOFACTOR_API_KEY,
        baseUrl: "https://2factor.in/API/V1"
    },
    razorpay: {
        keyId: RAZORPAY_KEY_ID,
        keySecret: RAZORPAY_KEY_SECRET,
        webhookSecret: RAZORPAY_WEBHOOK_SECRET,
        brandName: RAZORPAY_BRAND_NAME,
        themeColor: RAZORPAY_THEME_COLOR
    }
};
