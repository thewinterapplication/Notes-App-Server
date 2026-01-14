import { Elysia } from "elysia";
import { CronJob } from "cron";
import { Client } from "minio";
import { uploadController } from "./controllers/upload_controller";
import { otpController } from "./controllers/otp_controller";
import { userController } from "./controllers/user_controller";
import { config } from "./config";
import { connectDB } from "./db";
import { FileModel } from "./models/File";

// MinIO client for streaming files
const minioClient = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey
});

// Cron job to ping Render server every 12 minutes to prevent spin-down
const keepAliveJob = new CronJob("*/12 * * * *", async () => {
  try {
    const response = await fetch("https://notes-app-server-wczw.onrender.com");
    console.log(`[KeepAlive] Pinged Render server: ${response.status}`);
  } catch (error) {
    console.error("[KeepAlive] Failed to ping Render server:", error);
  }
});
keepAliveJob.start();
console.log("[KeepAlive] Cron job started - pinging Render every 12 minutes");

// Connect to MongoDB
connectDB();

console.log("MinIO Endpoint:", `${config.minio.endPoint}:${config.minio.port}`);
console.log("MinIO Bucket:", config.minio.bucket);

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

  // Stream files from MinIO through backend
  .get("/files/:name", async ({ params, set }) => {
    try {
      console.log("[Files] Raw param:", params.name);
      // Elysia auto-decodes, so use params.name directly
      const fileName = params.name;
      console.log("[Files] Looking for:", fileName);
      const stream = await minioClient.getObject(config.minio.bucket, fileName);
      set.headers["Content-Type"] = "application/pdf";
      return stream;
    } catch (error: any) {
      console.error("[Files] Error:", error.message);
      set.status = 404;
      return { error: "File not found" };
    }
  })

  .listen({
    port: 3000,
    hostname: '0.0.0.0',
  });

console.log(
  `🦊 Elysia is running at ${config.baseUrl}`
);
