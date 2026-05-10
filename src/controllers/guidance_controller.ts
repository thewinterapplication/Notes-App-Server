import { Elysia, t } from "elysia";
import { GuidanceRequestModel } from "../models/GuidanceRequest";
import { CareerGuidanceTypeModel } from "../models/CareerGuidanceType";
import { PendingGuidanceBookingModel } from "../models/PendingGuidanceBooking";
import { UserModel } from "../models/User";
import { createGuidanceMeet, exchangeCodeForTokens, getAuthUrl } from "../services/google_meet_service";
import { createRazorpayOrder, verifyRazorpayOrderSignature } from "../services/razorpay_service";
import { config } from "../config";
import { requireAdminAuth } from "../utils/admin_auth";

function formatDateLocal(date: Date): string {
    return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildAdminHtml(requests: any[], types: any[]): string {
    const rows = requests.map((r) => `
        <tr>
            <td>${formatDateLocal(new Date(r.scheduledAt))}</td>
            <td>${r.userName || "—"}<br><span class="muted">${r.userPhone}</span></td>
            <td>${r.typeName ? `<span class="badge badge-type">${r.typeName}</span><br>` : ""}${r.description}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td>${r.amountInPaise ? `<span class="amount">₹${(r.amountInPaise / 100).toFixed(0)}</span>` : '<span class="muted">—</span>'}</td>
            <td><a class="meet-btn" href="${r.meetLink}" target="_blank">Join Meet</a></td>
            <td class="muted">${formatDateLocal(new Date(r.createdAt))}</td>
        </tr>`).join("");

    const typeRows = types.map((tp) => `
        <tr id="type-row-${tp._id}">
            <td>${tp.name}</td>
            <td class="muted">₹${(tp.priceInPaise / 100).toFixed(0)}</td>
            <td class="muted">${tp.description || "—"}</td>
            <td><span class="badge ${tp.active ? "badge-scheduled" : "badge-cancelled"}">${tp.active ? "active" : "inactive"}</span></td>
            <td>
                <button class="action-btn" onclick="toggleType('${tp._id}', ${!tp.active})">${tp.active ? "Disable" : "Enable"}</button>
                <button class="action-btn danger-btn" onclick="deleteType('${tp._id}')">Delete</button>
            </td>
        </tr>`).join("");

    const adminKey = config.adminDashboardKey;

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
    .container{max-width:1200px;margin:0 auto;background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:2rem}
    h1{margin:0 0 0.25rem;font-size:1.75rem;font-weight:600}
    h2{font-size:1.2rem;font-weight:600;margin:2rem 0 1rem}
    .subtitle{color:var(--muted);margin:0 0 1.5rem}
    .section{background:rgba(30,41,59,.45);border:1px solid var(--border);border-radius:.75rem;padding:1.25rem;margin-bottom:1.5rem}
    .form-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end;margin-bottom:.75rem}
    .form-group{display:flex;flex-direction:column;gap:.3rem}
    .form-group label{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
    input[type=text],input[type=number]{background:#0f172a;border:1px solid var(--border);color:var(--text);padding:.45rem .75rem;border-radius:.5rem;font-size:.9rem;font-family:inherit;outline:none}
    input:focus{border-color:var(--primary)}
    .btn{padding:.45rem 1rem;border-radius:.5rem;border:none;cursor:pointer;font-size:.9rem;font-family:inherit;font-weight:500;transition:opacity .15s}
    .btn-primary{background:var(--primary);color:#fff}
    .btn-primary:hover{opacity:.85}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    thead tr{border-bottom:1px solid var(--border)}
    th{text-align:left;padding:.6rem .75rem;color:var(--muted);font-weight:400}
    td{padding:.6rem .75rem;border-bottom:1px solid rgba(51,65,85,.5);vertical-align:top}
    .muted{color:var(--muted);font-size:.8rem}
    .amount{color:#6ee7b7;font-weight:600}
    .meet-btn{display:inline-block;padding:.35rem .85rem;background:var(--primary);color:#fff;border-radius:.5rem;text-decoration:none;font-size:.85rem}
    .meet-btn:hover{opacity:.85}
    .badge{padding:.2rem .6rem;border-radius:999px;font-size:.75rem}
    .badge-scheduled{background:rgba(99,102,241,.2);color:#a5b4fc}
    .badge-completed{background:rgba(16,185,129,.2);color:#6ee7b7}
    .badge-cancelled{background:rgba(239,68,68,.2);color:#fca5a5}
    .badge-type{background:rgba(245,158,11,.15);color:#fcd34d;font-size:.75rem;padding:.15rem .5rem;border-radius:999px}
    .action-btn{padding:.3rem .7rem;border-radius:.4rem;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:.8rem;cursor:pointer;font-family:inherit}
    .action-btn:hover{border-color:var(--primary);color:var(--primary)}
    .danger-btn:hover{border-color:var(--danger);color:var(--danger)}
    .empty{text-align:center;padding:3rem;color:var(--muted)}
    #status-msg{margin:.5rem 0;font-size:.85rem;color:var(--success);min-height:1.2em}
  </style>
</head>
<body>
  <div class="container">
    <h1>Guidance Requests</h1>
    <p class="subtitle">All scheduled guidance sessions</p>

    <h2>Career Guidance Types</h2>
    <div class="section">
      <div class="form-row">
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="type-name" placeholder="e.g. Resume Review" style="width:180px">
        </div>
        <div class="form-group">
          <label>Price (₹)</label>
          <input type="number" id="type-price" placeholder="299" min="0" style="width:100px">
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <input type="text" id="type-desc" placeholder="Short description" style="width:220px">
        </div>
        <div class="form-group">
          <label>Sort Order</label>
          <input type="number" id="type-sort" value="0" min="0" style="width:80px">
        </div>
        <div class="form-group" style="justify-content:flex-end">
          <button class="btn btn-primary" onclick="addType()">Add Type</button>
        </div>
      </div>
      <div id="status-msg"></div>
      ${types.length === 0
        ? '<p class="empty" style="padding:1rem">No career types yet. Add one above.</p>'
        : `<table>
          <thead><tr><th>Name</th><th>Price</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="types-tbody">${typeRows}</tbody>
        </table>`}
    </div>

    <h2>Booking Requests</h2>
    ${requests.length === 0
        ? '<p class="empty">No guidance requests yet.</p>'
        : `<table>
        <thead><tr><th>Scheduled</th><th>User</th><th>Type / Description</th><th>Status</th><th>Paid</th><th>Meet Link</th><th>Requested At</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
  </div>
  <script>
    const KEY = '${adminKey}';
    const statusEl = document.getElementById('status-msg');
    function setStatus(msg, isErr) {
      statusEl.style.color = isErr ? '#fca5a5' : '#6ee7b7';
      statusEl.textContent = msg;
    }

    async function addType() {
      const name = document.getElementById('type-name').value.trim();
      const price = parseInt(document.getElementById('type-price').value, 10);
      const desc = document.getElementById('type-desc').value.trim();
      const sort = parseInt(document.getElementById('type-sort').value || '0', 10);
      if (!name || isNaN(price) || price < 0) { setStatus('Name and valid price are required.', true); return; }
      const res = await fetch('/api/admin/career-types?key=' + KEY, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, priceInPaise: price * 100, description: desc, sortOrder: sort })
      });
      if (res.ok) { setStatus('Type added. Reload to see it.'); }
      else { const d = await res.json(); setStatus(d.error || 'Failed', true); }
    }

    async function toggleType(id, active) {
      const res = await fetch('/api/admin/career-types/id/' + id + '?key=' + KEY, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ active })
      });
      if (res.ok) { setStatus('Updated. Reload to reflect changes.'); }
      else { const d = await res.json(); setStatus(d.error || 'Failed', true); }
    }

    async function deleteType(id) {
      if (!confirm('Delete this type?')) return;
      const res = await fetch('/api/admin/career-types/id/' + id + '?key=' + KEY, { method: 'DELETE' });
      if (res.ok) { document.getElementById('type-row-' + id)?.remove(); setStatus('Deleted.'); }
      else { const d = await res.json(); setStatus(d.error || 'Failed', true); }
    }
  </script>
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

    // ── Career Guidance Types ─────────────────────────────────────────────────

    // GET /api/career-types — public list for Flutter dropdown
    .get("/api/career-types", async () => {
        const types = await CareerGuidanceTypeModel
            .find({ active: true })
            .sort({ sortOrder: 1, name: 1 })
            .select("name slug description priceInPaise")
            .lean();
        return { types };
    })

    // GET /api/admin/career-types — admin: all types incl. inactive
    .get("/api/admin/career-types", async ({ query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const types = await CareerGuidanceTypeModel.find().sort({ sortOrder: 1, name: 1 }).lean();
        return { types };
    })

    // POST /api/admin/career-types — create a new type
    .post("/api/admin/career-types", async ({ body, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const { name, description, priceInPaise, sortOrder } = body;
        const slug = slugify(name);
        const existing = await CareerGuidanceTypeModel.findOne({ slug });
        if (existing) {
            set.status = 409;
            return { error: `A type with slug "${slug}" already exists` };
        }
        const type = await CareerGuidanceTypeModel.create({
            name, slug, description, priceInPaise, sortOrder: sortOrder ?? 0,
        });
        return { success: true, type };
    }, {
        body: t.Object({
            name: t.String({ minLength: 1 }),
            description: t.Optional(t.String()),
            priceInPaise: t.Number({ minimum: 0 }),
            sortOrder: t.Optional(t.Number()),
        }),
    })

    // PATCH /api/admin/career-types/id/:id — update a type by Mongo ID
    .patch("/api/admin/career-types/id/:id", async ({ params, body, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const updated = await CareerGuidanceTypeModel.findByIdAndUpdate(
            params.id,
            { $set: body },
            { new: true }
        ).lean();
        if (!updated) {
            set.status = 404;
            return { error: "Type not found" };
        }
        return { success: true, type: updated };
    }, {
        body: t.Object({
            name: t.Optional(t.String({ minLength: 1 })),
            description: t.Optional(t.String()),
            priceInPaise: t.Optional(t.Number({ minimum: 0 })),
            active: t.Optional(t.Boolean()),
            sortOrder: t.Optional(t.Number()),
        }),
    })

    // DELETE /api/admin/career-types/id/:id — hard delete or soft-disable
    .delete("/api/admin/career-types/id/:id", async ({ params, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const type = await CareerGuidanceTypeModel.findById(params.id).lean();
        if (!type) {
            set.status = 404;
            return { error: "Type not found" };
        }
        const usageCount = await GuidanceRequestModel.countDocuments({ typeSlug: type.slug });
        if (usageCount > 0) {
            // Has existing bookings — soft-disable instead of hard delete
            await CareerGuidanceTypeModel.findByIdAndUpdate(params.id, { active: false });
            return { success: true, action: "disabled", reason: "has_existing_bookings" };
        }
        await CareerGuidanceTypeModel.findByIdAndDelete(params.id);
        return { success: true, action: "deleted" };
    })

    // ── Payment-gated booking flow ────────────────────────────────────────────

    // POST /api/guidance/create-order — step 1: create Razorpay order + pending booking
    .post("/api/guidance/create-order", async ({ body, set }) => {
        const { userPhone, typeSlug, scheduledAt, description } = body;

        const type = await CareerGuidanceTypeModel.findOne({ slug: typeSlug, active: true }).lean();
        if (!type) {
            set.status = 404;
            return { error: "Career guidance type not found or inactive" };
        }

        const startDate = new Date(scheduledAt);
        if (isNaN(startDate.getTime()) || startDate <= new Date()) {
            set.status = 400;
            return { error: "scheduledAt must be a valid future date" };
        }

        const user = await UserModel.findOne({ phone: userPhone }).lean();
        const userName = user ? user.name : "Unknown";

        let rzOrder;
        try {
            rzOrder = await createRazorpayOrder({
                amountInPaise: type.priceInPaise,
                receipt: `guidance-${userPhone}-${Date.now()}`.slice(0, 40),
                notes: { userPhone, typeSlug, app: "college_notes" },
            });
        } catch (err: any) {
            set.status = 500;
            return { error: "Failed to create payment order", detail: err.message };
        }

        await PendingGuidanceBookingModel.create({
            userPhone,
            typeSlug,
            typeName: type.name,
            scheduledAt: startDate,
            description,
            amountInPaise: type.priceInPaise,
            razorpayOrderId: rzOrder.id,
        });

        return {
            orderId: rzOrder.id,
            amount: rzOrder.amount,
            currency: rzOrder.currency,
            keyId: config.razorpay.keyId,
            brandName: config.razorpay.brandName,
            themeColor: config.razorpay.themeColor,
            prefill: {
                name: userName,
                contact: userPhone.startsWith("+") ? userPhone : `+91${userPhone}`,
            },
            typeName: type.name,
            priceInPaise: type.priceInPaise,
        };
    }, {
        body: t.Object({
            userPhone: t.String({ minLength: 10 }),
            typeSlug: t.String({ minLength: 1 }),
            scheduledAt: t.String({ minLength: 1 }),
            description: t.String({ minLength: 1, maxLength: 1000 }),
        }),
    })

    // POST /api/guidance/verify-payment — step 2: verify signature, create Meet + booking
    .post("/api/guidance/verify-payment", async ({ body, set }) => {
        const { orderId, paymentId, signature } = body;

        const isValid = verifyRazorpayOrderSignature({ orderId, paymentId, signature });
        if (!isValid) {
            set.status = 400;
            return { error: "Payment signature verification failed" };
        }

        const pending = await PendingGuidanceBookingModel.findOne({
            razorpayOrderId: orderId,
            status: "created",
        });
        if (!pending) {
            set.status = 404;
            return { error: "Pending booking not found or already processed" };
        }

        const endDate = new Date(pending.scheduledAt.getTime() + 30 * 60 * 1000);

        const user = await UserModel.findOne({ phone: pending.userPhone }).lean();
        const userName = user ? user.name : "Unknown";

        let meetResult;
        try {
            meetResult = await createGuidanceMeet({
                summary: `Guidance Session — ${userName} (${pending.userPhone}) — ${pending.typeName}`,
                description: pending.description,
                startISO: pending.scheduledAt.toISOString(),
                endISO: endDate.toISOString(),
            });
        } catch (err: any) {
            await PendingGuidanceBookingModel.findByIdAndUpdate(pending._id, { status: "failed" });
            set.status = 500;
            return { error: "Failed to create Google Meet event", detail: err.message };
        }

        const request = await GuidanceRequestModel.create({
            userPhone: pending.userPhone,
            userName,
            scheduledAt: pending.scheduledAt,
            description: pending.description,
            meetLink: meetResult.meetLink,
            calendarEventId: meetResult.eventId,
            typeSlug: pending.typeSlug,
            typeName: pending.typeName,
            amountInPaise: pending.amountInPaise,
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            paidAt: new Date(),
        });

        await PendingGuidanceBookingModel.findByIdAndUpdate(pending._id, { status: "paid" });

        return {
            id: request._id.toString(),
            meetLink: meetResult.meetLink,
            scheduledAt: pending.scheduledAt.toISOString(),
        };
    }, {
        body: t.Object({
            orderId: t.String({ minLength: 1 }),
            paymentId: t.String({ minLength: 1 }),
            signature: t.String({ minLength: 1 }),
        }),
    })

    // POST /api/guidance — legacy endpoint (kept for backwards compatibility)
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

    // GET /api/guidance/my — user's own sessions by phone
    .get("/api/guidance/my", async ({ query, set }) => {
        const phone = query.phone as string | undefined;
        if (!phone || phone.length < 10) {
            set.status = 400;
            return { error: "phone query param required" };
        }
        const sessions = await GuidanceRequestModel
            .find({ userPhone: phone })
            .sort({ scheduledAt: -1 })
            .select("scheduledAt typeName description status meetLink amountInPaise paidAt createdAt")
            .lean();
        return { sessions };
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

        const [requests, types] = await Promise.all([
            GuidanceRequestModel.find().sort({ scheduledAt: -1 }).lean(),
            CareerGuidanceTypeModel.find().sort({ sortOrder: 1, name: 1 }).lean(),
        ]);
        set.headers["Content-Type"] = "text/html";
        return buildAdminHtml(requests, types);
    });
