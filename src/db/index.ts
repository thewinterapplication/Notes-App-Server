import mongoose from "mongoose";

export const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        console.error("❌ MONGO_URI is not defined in .env file");
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        console.log("✅ MongoDB Connected!");
    } catch (error: any) {
        console.error("❌ MongoDB Connection Error:", error.message);
        process.exit(1);
    }
};
