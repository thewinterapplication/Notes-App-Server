import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("No MONGO_URI found");
    process.exit(1);
}

console.log(`Testing connection to: ${MONGO_URI.replace(/:([^:@]+)@/, ":****@")}`);

async function testConnection() {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("✅ Connection Successful!");
        await mongoose.disconnect();
        process.exit(0);
    } catch (error: any) {
        console.error("❌ Connection Failed:");
        console.error(error.message);
        process.exit(1);
    }
}

testConnection();
