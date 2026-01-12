import { join } from "path";

// In a real app, these would come from process.env
const STORAGE_ROOT = process.env.STORAGE_PATH || join(process.cwd(), "../elysia-uploads");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY || "";

export const config = {
    baseUrl: BASE_URL,
    storage: {
        path: STORAGE_ROOT,
        // Helper to get full path
        getFullPath: (fileName: string) => join(STORAGE_ROOT, fileName)
    },
    otp: {
        apiKey: TWOFACTOR_API_KEY,
        baseUrl: "https://2factor.in/API/V1"
    }
};
