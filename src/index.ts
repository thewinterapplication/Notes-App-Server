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
import { jntuController } from "./controllers/jntu_controller";
import { jntuUploadController } from "./controllers/jntu_upload_controller";
import { subscriptionController } from "./controllers/subscription_controller";
import { mappingController } from "./controllers/mapping_controller";
import { placementMappingController } from "./controllers/placement_mapping_controller";
import { jntuMappingController } from "./controllers/jntu_mapping_controller";
import { documentController } from "./controllers/document_controller";
import { placementDocumentController } from "./controllers/placement_document_controller";
import { jntuDocumentController } from "./controllers/jntu_document_controller";
import { jobController } from "./controllers/job_controller";
import { upskillController } from "./controllers/upskill_controller";
import { guidanceController } from "./controllers/guidance_controller";
import { adminLoginController } from "./controllers/admin_login_controller";
import { resumeTemplateController } from "./controllers/resume_template_controller";
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

// Injected into every admin HTML page. Detects whether THIS page load was a
// browser refresh (vs a normal link navigation) using the Navigation Timing
// API, and if so logs out — so refreshing any page re-prompts for the password
// while navigating between pages does not.
const LOCK_SCRIPT = `<script>(function(){try{var n=performance.getEntriesByType('navigation')[0];var t=n?n.type:((performance.navigation||{}).type===1?'reload':'navigate');if(t==='reload'){location.replace('/admin-logout?next='+encodeURIComponent(location.pathname+location.search));}}catch(e){}})();</script>`;

// Pages that must NOT get the reload-lock script (public APIs, file downloads,
// OAuth callbacks, and the login/logout endpoints themselves).
function isInjectablePath(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/files/")) return false;
  if (pathname.startsWith("/google-oauth/")) return false;
  if (pathname === "/admin-login" || pathname === "/admin-logout") return false;
  return true;
}

const app = new Elysia()
  .onAfterHandle({ as: "global" }, async ({ response, request, set }) => {
    const pathname = new URL(request.url).pathname;
    if (!isInjectablePath(pathname)) return;

    // Resolve the response body to HTML text, whether the handler returned a
    // string (generated pages) or a Bun.file (static .html files).
    let html: string | null = null;
    if (typeof response === "string") {
      if (response.includes("</head>") || response.includes("<head")) html = response;
    } else if (response && typeof (response as any).text === "function") {
      const type = (response as any).type;
      if (typeof type === "string" && type.includes("html")) {
        html = await (response as any).text();
      }
    }
    if (html == null) return;

    const m = html.match(/<head[^>]*>/i);
    const injected = m ? html.replace(m[0], m[0] + LOCK_SCRIPT) : LOCK_SCRIPT + html;
    set.headers["Content-Type"] = "text/html; charset=utf-8";
    return injected;
  })
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
  .use(jntuController)
  .use(jntuUploadController)
  .use(subscriptionController)
  .use(mappingController)
  .use(placementMappingController)
  .use(jntuMappingController)
  .use(documentController)
  .use(placementDocumentController)
  .use(jntuDocumentController)
  .use(jobController)
  .use(upskillController)
  .use(guidanceController)
  .use(adminLoginController)
  .use(resumeTemplateController)

  .listen({
    port: 3000,
    hostname: '0.0.0.0',
  }, ({ hostname, port }) => {
    console.log(`Backend running at http://${hostname}:${port}`);
  });
