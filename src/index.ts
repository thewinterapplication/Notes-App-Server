import { Elysia } from "elysia";
import { CronJob } from "cron";
import { uploadController } from "./controllers/upload_controller";
import { otpController } from "./controllers/otp_controller";
import { userController } from "./controllers/user_controller";
import { fileController } from "./controllers/file_controller";
import { pyqController } from "./controllers/pyq_controller";
import { pyqUploadController } from "./controllers/pyq_upload_controller";
import { placementController } from "./controllers/placement_controller";
import { placementUploadController } from "./controllers/placement_upload_controller";
import { subscriptionController } from "./controllers/subscription_controller";
import { mappingController } from "./controllers/mapping_controller";
import { documentController } from "./controllers/document_controller";
import { jobController } from "./controllers/job_controller";
import { upskillController } from "./controllers/upskill_controller";
import { connectDB } from "./db";

// Cron job to ping Render server every 12 minutes to prevent spin-down
const keepAliveJob = new CronJob("*/12 * * * *", async () => {
  try {
    await fetch("https://notes.codebinary.com");
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
  .get("/privacy-policy", () => Bun.file("privacy-policy.html"))
  .get("/terms-and-conditions", () => Bun.file("terms-and-conditions.html"))
  .get("/shipping-policy", () => Bun.file("shipping-policy.html"))
  .get("/contact-us", () => Bun.file("contact-us.html"))
  .get(
    "/cancellation-and-refunds",
    () => Bun.file("cancellation-and-refunds.html")
  )

  // Register Controllers
  .use(uploadController)
  .use(otpController)
  .use(userController)
  .use(fileController)
  .use(pyqController)
  .use(pyqUploadController)
  .use(placementController)
  .use(placementUploadController)
  .use(subscriptionController)
  .use(mappingController)
  .use(documentController)
  .use(jobController)
  .use(upskillController)

  .listen({
    port: 3000,
    hostname: '0.0.0.0',
  });
