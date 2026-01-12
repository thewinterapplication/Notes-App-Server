import { Elysia } from "elysia";
import { uploadController } from "./controllers/upload_controller";
import { otpController } from "./controllers/otp_controller";
import { userController } from "./controllers/user_controller";
import { config } from "./config";
import { connectDB } from "./db";
import { FileModel } from "./models/File";

// Connect to MongoDB
connectDB();

console.log("Storage Path:", config.storage.path);

const app = new Elysia()
  .get("/", () => "Hello Elysia")
  .get("/api/hello", () => ({ message: "Hello from Elysia!" }))
  .get("/test", () => Bun.file("test.html"))

  // API: Get files by subject
  .get("/api/files/subject/:subject", async ({ params }) => {
    const files = await FileModel.find({ subject: params.subject }).sort({ createdAt: -1 });
    return { files };
  })

  // Register the Upload Controller
  .use(uploadController)

  // Register the OTP Controller
  .use(otpController)

  // Register the User Controller
  .use(userController)

  // Serve static files from the configured external storage
  .get("/files/*", ({ params }) => {
    const filePath = decodeURIComponent(params['*']); // Decode URL-encoded characters like %20 -> space
    return Bun.file(config.storage.getFullPath(filePath))
  })
  .listen({
    port: 3000,
    hostname: '0.0.0.0', // Listen on all interfaces (accessible from network)
  });

console.log(
  `🦊 Elysia is running at http://192.168.1.8:${app.server?.port}`
);
