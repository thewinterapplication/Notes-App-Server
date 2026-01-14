import { Elysia } from "elysia";
import { CronJob } from "cron";
import { uploadController } from "./controllers/upload_controller";
import { otpController } from "./controllers/otp_controller";
import { userController } from "./controllers/user_controller";
import { fileController } from "./controllers/file_controller";
import { connectDB } from "./db";

// Cron job to ping Render server every 12 minutes to prevent spin-down
const keepAliveJob = new CronJob("*/12 * * * *", async () => {
  try {
    await fetch("https://notes-app-server-wczw.onrender.com");
  } catch (error) {
    // Silent fail
  }
});
keepAliveJob.start();

// Connect to MongoDB
connectDB();

const app = new Elysia()
  .get("/", () => "Hello Elysia")
  .get("/api/hello", () => ({ message: "Hello from Elysia!" }))
  .get("/test", () => Bun.file("test.html"))

  // Register Controllers
  .use(uploadController)
  .use(otpController)
  .use(userController)
  .use(fileController)

  .listen({
    port: 3000,
    hostname: '0.0.0.0',
  });
