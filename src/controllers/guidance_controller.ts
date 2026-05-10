import { Elysia, t } from "elysia";
import { GuidanceRequestModel } from "../models/GuidanceRequest";
import { UserModel } from "../models/User";
import { createGuidanceMeet, exchangeCodeForTokens, getAuthUrl } from "../services/google_meet_service";
import { config } from "../config";
import { requireAdminAuth } from "../utils/admin_auth";

function formatDateLocal(date: Date): string {
    return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function buildAdminHtml(requests: any[]): string {
    const rows = requests.map((r) => `
        <tr>
            <td>${formatDateLocal(new Date(r.scheduledAt))}</td>
            <td>${r.userName || "—"}<br><span class="muted">${r.userPhone}</span></td>
            <td>${r.description}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td><a class="meet-btn" href="${r.meetLink}" target="_blank">Join Meet</a></td>
            <td class="muted">${formatDateLocal(new Date(r.createdAt))}</td>
        </tr>`).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guidance Requests</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root{--primary:#6366f1;--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f8fafc;--muted:#94a3b8;--success:#10b981;--warn:#f59e0b;--danger:#ef4444}
    *{box-sizing:border-box}
    body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);margin:0;min-height:100vh;padding:2rem 1rem}
    .container{max-width:1100px;margin:0 auto;background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:2rem}
    h1{margin:0 0 0.25rem;font-size:1.75rem;font-weight:600}
    .subtitle{color:var(--muted);margin:0 0 1.5rem}
    .nav-panels{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem}
    .nav-panel{background:rgba(30,41,59,.45);border:1px solid var(--border);border-radius:.75rem;padding:1rem}
    .nav-panel-title{font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:0 0 .5rem}
    .tab-links{display:flex;gap:.5rem;flex-wrap:wrap}
    .tab-link{padding:.4rem .9rem;border-radius:.5rem;border:1px solid var(--border);color:var(--muted);text-decoration:none;font-size:.9rem;transition:all .15s}
    .tab-link:hover,.tab-link.active{background:var(--primary);border-color:var(--primary);color:#fff}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    thead tr{border-bottom:1px solid var(--border)}
    th{text-align:left;padding:.6rem .75rem;color:var(--muted);font-weight:400}
    td{padding:.6rem .75rem;border-bottom:1px solid rgba(51,65,85,.5);vertical-align:top}
    .muted{color:var(--muted);font-size:.8rem}
    .meet-btn{display:inline-block;padding:.35rem .85rem;background:var(--primary);color:#fff;border-radius:.5rem;text-decoration:none;font-size:.85rem}
    .meet-btn:hover{opacity:.85}
    .badge{padding:.2rem .6rem;border-radius:999px;font-size:.75rem}
    .badge-scheduled{background:rgba(99,102,241,.2);color:#a5b4fc}
    .badge-completed{background:rgba(16,185,129,.2);color:#6ee7b7}
    .badge-cancelled{background:rgba(239,68,68,.2);color:#fca5a5}
    .empty{text-align:center;padding:3rem;color:var(--muted)}
  </style>
</head>
<body>
  <div class="container">
    <h1>Guidance Requests</h1>
    <p class="subtitle">All scheduled guidance sessions</p>
    <div class="nav-panels">
      <div class="nav-panel">
        <p class="nav-panel-title">Upload Tabs</p>
        <div class="tab-links">
          <a href="/upload" class="tab-link">Notes</a>
          <a href="/upload-placement" class="tab-link">Placements</a>
          <a href="/upload/jobs" class="tab-link">Jobs</a>
          <a href="/upload/upskills" class="tab-link">Upskill</a>
        </div>
      </div>
      <div class="nav-panel">
        <p class="nav-panel-title">View Uploaded</p>
        <div class="tab-links">
          <a href="/documents" class="tab-link">Notes</a>
          <a href="/placements" class="tab-link">Placements</a>
          <a href="/jobs" class="tab-link">Jobs</a>
          <a href="/upskills" class="tab-link">Upskills</a>
          <a href="/google-meet" class="tab-link active">Guidance</a>
        </div>
      </div>
    </div>
    ${requests.length === 0
        ? '<p class="empty">No guidance requests yet.</p>'
        : `<table>
        <thead><tr><th>Scheduled</th><th>User</th><th>Description</th><th>Status</th><th>Meet Link</th><th>Requested At</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
  </div>
</body>
</html>`;
}

export const guidanceController = new Elysia()

    // One-time admin OAuth flow — start
    .get("/google-oauth/start", ({ redirect }) => {
        return redirect(getAuthUrl());
    })

    // One-time admin OAuth flow — callback
    .get("/google-oauth/callback", async ({ query, set }) => {
        const code = query.code as string | undefined;
        if (!code) {
            set.status = 400;
            return { error: "Missing code" };
        }
        const refreshToken = await exchangeCodeForTokens(code);
        return `<pre>Refresh token captured. Paste this into .env as GOOGLE_ADMIN_REFRESH_TOKEN:\n\n${refreshToken}\n\nThen restart the server.</pre>`;
    })

    // POST /api/guidance — create guidance request + Google Meet event
    .post("/api/guidance", async ({ body, set }) => {
        const { userPhone, scheduledAt, description } = body;

        const user = await UserModel.findOne({ phone: userPhone });
        const userName = user ? user.name : "Unknown";

        const startDate = new Date(scheduledAt);
        if (isNaN(startDate.getTime())) {
            set.status = 400;
            return { error: "Invalid scheduledAt date" };
        }
        if (startDate <= new Date()) {
            set.status = 400;
            return { error: "Scheduled time must be in the future" };
        }

        const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

        let meetResult;
        try {
            meetResult = await createGuidanceMeet({
                summary: `Guidance Session — ${userName} (${userPhone})`,
                description: description,
                startISO: startDate.toISOString(),
                endISO: endDate.toISOString(),
            });
        } catch (err: any) {
            set.status = 500;
            return { error: "Failed to create Google Meet event", detail: err.message };
        }

        const request = await GuidanceRequestModel.create({
            userPhone,
            userName,
            scheduledAt: startDate,
            description,
            meetLink: meetResult.meetLink,
            calendarEventId: meetResult.eventId,
        });

        return {
            id: request._id.toString(),
            meetLink: meetResult.meetLink,
            scheduledAt: startDate.toISOString(),
        };
    }, {
        body: t.Object({
            userPhone: t.String({ minLength: 10 }),
            scheduledAt: t.String({ minLength: 1 }),
            description: t.String({ minLength: 1, maxLength: 1000 }),
        }),
    })

    // GET /api/guidance — list all guidance requests (admin JSON)
    .get("/api/guidance", async ({ query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const filter: Record<string, string> = {};
        if (query.status) filter.status = query.status as string;
        const requests = await GuidanceRequestModel.find(filter).sort({ scheduledAt: 1 }).lean();
        return { requests };
    })

    // GET /google-meet — admin HTML dashboard
    .get("/google-meet", async ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;

        const requests = await GuidanceRequestModel.find().sort({ scheduledAt: -1 }).lean();
        set.headers["Content-Type"] = "text/html";
        return buildAdminHtml(requests);
    });
