import mongoose from "mongoose";

export const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
    } catch (error: any) {
        process.exit(1);
    }
};
