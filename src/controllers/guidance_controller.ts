import { Elysia, t } from "elysia";
import { GuidanceRequestModel } from "../models/GuidanceRequest";
import { CareerGuidanceTypeModel } from "../models/CareerGuidanceType";
import { BroadcastSessionModel } from "../models/BroadcastSession";
import { PendingGuidanceBookingModel } from "../models/PendingGuidanceBooking";
import { UserModel } from "../models/User";
import { createGuidanceMeet, exchangeCodeForTokens, getAuthUrl } from "../services/google_meet_service";
import { createRazorpayOrder, verifyRazorpayOrderSignature } from "../services/razorpay_service";
import { config } from "../config";
import { requireAdminAuth } from "../utils/admin_auth";

function formatDateLocal(date: Date): string {
    return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: true,
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildAdminHtml(requests: any[], types: any[], broadcasts: any[]): string {
    const now = new Date();
    const makeRow = (r: any) => `
        <tr>
            <td>${formatDateLocal(new Date(r.scheduledAt))}</td>
            <td>${r.userName || "—"}<br><span class="muted">${r.userPhone}</span></td>
            <td>${r.typeName ? `<span class="badge badge-type">${r.typeName}</span><br>` : ""}${r.description}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td>${r.amountInPaise ? `<span class="amount">₹${(r.amountInPaise / 100).toFixed(0)}</span>` : '<span class="muted">—</span>'}</td>
            <td><a class="meet-btn" href="${r.meetLink}" target="_blank">Join Meet</a></td>
            <td class="muted">${formatDateLocal(new Date(r.createdAt))}</td>
        </tr>`;
    const upcoming = requests.filter(r => new Date(r.scheduledAt) >= now);
    const past = requests.filter(r => new Date(r.scheduledAt) < now);
    const upcomingRows = upcoming.map(makeRow).join("");
    const pastRows = past.map(makeRow).join("");

    const typeRows = types.map((tp) => `
        <tr id="type-row-${tp._id}">
            <td>${tp.name}</td>
            <td class="muted">₹${(tp.priceInPaise / 100).toFixed(0)}</td>
            <td><span class="badge ${tp.active ? "badge-scheduled" : "badge-cancelled"}">${tp.active ? "active" : "inactive"}</span></td>
            <td>
                <button class="action-btn" onclick="toggleType('${tp._id}', ${!tp.active})">${tp.active ? "Disable" : "Enable"}</button>
                <button class="action-btn danger-btn" onclick="deleteType('${tp._id}')">Delete</button>
            </td>
        </tr>`).join("");

    const broadcastRows = broadcasts.map((b) => `
        <tr id="bc-row-${b._id}">
            <td><strong>${b.title}</strong>${b.description ? `<br><span class="muted">${b.description}</span>` : ""}</td>
            <td>${formatDateLocal(new Date(b.scheduledAt))}</td>
            <td class="muted">${b.durationMinutes || 60} min</td>
            <td><a class="meet-btn" href="${b.meetLink}" target="_blank">Join</a></td>
            <td><span class="badge ${b.isActive ? "badge-scheduled" : "badge-cancelled"}">${b.isActive ? "active" : "inactive"}</span></td>
            <td>
                <button class="action-btn" onclick="toggleBroadcast('${b._id}', ${!b.isActive})">${b.isActive ? "Disable" : "Enable"}</button>
                <button class="action-btn danger-btn" onclick="deleteBroadcast('${b._id}')">Delete</button>
            </td>
        </tr>`).join("");

    const adminKey = config.adminDashboardKey;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guidance Dashboard</title>
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
    input[type=text],input[type=number],input[type=date]{background:#0f172a;border:1px solid var(--border);color:var(--text);padding:.65rem .75rem;border-radius:.5rem;font-size:.9rem;font-family:inherit;outline:none;color-scheme:dark}
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
    #status-msg,#bc-status-msg{margin:.5rem 0;font-size:.85rem;color:var(--success);min-height:1.2em}
    .tabs{display:flex;gap:0;margin-bottom:1.75rem;border-bottom:2px solid var(--border)}
    .tab-btn{padding:.65rem 1.4rem;border:none;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-size:1rem;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s}
    .tab-btn.active{color:var(--primary);border-bottom-color:var(--primary)}
    .tab-btn:hover:not(.active){color:var(--text)}
    .sub-tabs{display:flex;gap:.5rem;margin-bottom:1rem}
    .sub-tab-btn{padding:.35rem .9rem;border:1px solid var(--border);border-radius:.4rem;background:transparent;color:var(--muted);cursor:pointer;font-family:inherit;font-size:.85rem;font-weight:500;transition:all .15s}
    .sub-tab-btn.active{background:var(--primary);border-color:var(--primary);color:#fff}
    .sub-tab-btn:hover:not(.active){border-color:var(--primary);color:var(--primary)}
    .form-grid{display:flex;flex-direction:column;gap:1rem}
    select.time-sel{background:#0f172a;border:1px solid var(--border);color:var(--text);padding:.65rem .5rem;border-radius:.5rem;font-size:.9rem;font-family:inherit;outline:none}
    select.time-sel:focus{border-color:var(--primary)}
    .time-box{background:#0f172a;border:1px solid var(--border);border-radius:.5rem;display:flex;align-items:center;padding:0 .5rem;gap:.15rem}
    .time-box select{background:#0f172a;border:none;color:var(--text);font-size:.9rem;font-family:inherit;outline:none;padding:.65rem .25rem;color-scheme:dark}
  </style>
</head>
<body>
  <div class="container">
    <h1>Guidance Dashboard</h1>
    <p class="subtitle">Manage 1-on-1 sessions and broadcasts</p>

    <div class="tabs">
      <button class="tab-btn active" onclick="showTab('one-on-one', this)">1 vs 1</button>
      <button class="tab-btn" onclick="showTab('broadcast', this)">Broadcast</button>
    </div>

    <!-- Tab: 1 vs 1 -->
    <div id="tab-one-on-one">
      <h2>Career Guidance Types</h2>
      <div class="section">
        <div class="form-row">
          <div class="form-group">
            <label>Name</label>
            <input type="text" id="type-name" placeholder="e.g. Resume Review" style="width:220px">
          </div>
          <div class="form-group">
            <label>Price (₹)</label>
            <input type="number" id="type-price" placeholder="299" min="0" style="width:120px">
          </div>
          <div class="form-group" style="justify-content:flex-end">
            <button class="btn btn-primary" onclick="addType()">Add Type</button>
          </div>
        </div>
        <div id="status-msg"></div>
        ${types.length === 0
          ? '<p class="empty" style="padding:1rem">No career types yet. Add one above.</p>'
          : `<table>
            <thead><tr><th>Name</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="types-tbody">${typeRows}</tbody>
          </table>`}
      </div>

      <h2>Booking Requests</h2>
      <div class="sub-tabs">
        <button class="sub-tab-btn active" onclick="showBookingTab('upcoming', this)">Upcoming (${upcoming.length})</button>
        <button class="sub-tab-btn" onclick="showBookingTab('past', this)">Past (${past.length})</button>
      </div>
      <div id="booking-upcoming">
        ${upcoming.length === 0
          ? '<p class="empty">No upcoming sessions.</p>'
          : `<table>
            <thead><tr><th>Scheduled</th><th>User</th><th>Type / Description</th><th>Status</th><th>Paid</th><th>Meet Link</th><th>Requested At</th></tr></thead>
            <tbody>${upcomingRows}</tbody>
          </table>`}
      </div>
      <div id="booking-past" style="display:none">
        ${past.length === 0
          ? '<p class="empty">No past sessions.</p>'
          : `<table>
            <thead><tr><th>Scheduled</th><th>User</th><th>Type / Description</th><th>Status</th><th>Paid</th><th>Meet Link</th><th>Requested At</th></tr></thead>
            <tbody>${pastRows}</tbody>
          </table>`}
      </div>
    </div>

    <!-- Tab: Broadcast -->
    <div id="tab-broadcast" style="display:none">
      <h2>Create Broadcast Session</h2>
      <div class="section">
        <div class="form-row" style="align-items:flex-end;flex-wrap:nowrap">
          <div class="form-group" style="flex:1.5">
            <label>Title</label>
            <input type="text" id="bc-title" placeholder="e.g. Interview Prep Q&amp;A" style="width:100%">
          </div>
          <div class="form-group" style="flex:1.5">
            <label>Description (optional)</label>
            <input type="text" id="bc-desc" placeholder="What this session covers" style="width:100%">
          </div>
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="bc-date" style="width:155px">
          </div>
          <div class="form-group">
            <label>Time (IST)</label>
            <div style="display:flex;gap:.4rem;align-items:center">
              <div class="time-box">
                <select id="bc-hour">
                  ${Array.from({length: 12}, (_, i) => { const v = i + 1; return '<option value="' + v + '">' + String(v).padStart(2,'0') + '</option>'; }).join('')}
                </select>
                <span style="color:var(--muted)">:</span>
                <select id="bc-minute">
                  ${Array.from({length: 60}, (_, i) => { const v = String(i).padStart(2,'0'); return '<option value="' + v + '">' + v + '</option>'; }).join('')}
                </select>
              </div>
              <select id="bc-ampm" class="time-sel">
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Duration (min)</label>
            <input type="number" id="bc-duration" value="60" min="5" style="width:90px">
          </div>
          <div class="form-group">
            <button class="btn btn-primary" style="padding:.65rem 1.4rem;font-size:.95rem;white-space:nowrap" onclick="createBroadcast()">Create &amp; Schedule</button>
          </div>
        </div>
        <div id="bc-status-msg"></div>
      </div>

      <h2>All Broadcast Sessions</h2>
      ${broadcasts.length === 0
          ? '<p class="empty">No broadcast sessions yet. Create one above.</p>'
          : `<table>
          <thead><tr><th>Title / Description</th><th>Scheduled</th><th>Duration</th><th>Meet Link</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="bc-tbody">${broadcastRows}</tbody>
        </table>`}
    </div>
  </div>

  <script>
    const KEY = '${adminKey}';
    const statusEl = document.getElementById('status-msg');
    const bcStatusEl = document.getElementById('bc-status-msg');

    function showTab(name, btn) {
      document.getElementById('tab-one-on-one').style.display = name === 'one-on-one' ? '' : 'none';
      document.getElementById('tab-broadcast').style.display = name === 'broadcast' ? '' : 'none';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    function showBookingTab(name, btn) {
      document.getElementById('booking-upcoming').style.display = name === 'upcoming' ? '' : 'none';
      document.getElementById('booking-past').style.display = name === 'past' ? '' : 'none';
      document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    function setStatus(msg, isErr) {
      statusEl.style.color = isErr ? '#fca5a5' : '#6ee7b7';
      statusEl.textContent = msg;
    }
    function setBcStatus(msg, isErr) {
      bcStatusEl.style.color = isErr ? '#fca5a5' : '#6ee7b7';
      bcStatusEl.textContent = msg;
    }

    async function addType() {
      const name = document.getElementById('type-name').value.trim();
      const price = parseInt(document.getElementById('type-price').value, 10);
      if (!name || isNaN(price) || price < 0) { setStatus('Name and valid price are required.', true); return; }
      const res = await fetch('/api/admin/career-types?key=' + KEY, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, priceInPaise: price * 100 })
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

    async function createBroadcast() {
      const title = document.getElementById('bc-title').value.trim();
      const desc = document.getElementById('bc-desc').value.trim();
      const date = document.getElementById('bc-date').value;
      let hour = parseInt(document.getElementById('bc-hour').value, 10);
      const minute = document.getElementById('bc-minute').value;
      const ampm = document.getElementById('bc-ampm').value;
      const duration = parseInt(document.getElementById('bc-duration').value || '60', 10);
      if (!title || !date) { setBcStatus('Title and date are required.', true); return; }
      if (ampm === 'AM' && hour === 12) hour = 0;
      else if (ampm === 'PM' && hour !== 12) hour += 12;
      const hh = String(hour).padStart(2, '0');
      const scheduledAt = new Date(date + 'T' + hh + ':' + minute + ':00+05:30').toISOString();
      setBcStatus('Creating session and Google Meet link...', false);
      const res = await fetch('/api/admin/broadcast?key=' + KEY, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ title, description: desc, scheduledAt, durationMinutes: duration })
      });
      if (res.ok) { setBcStatus('Session created! Reload to see it in the list.'); }
      else { const d = await res.json(); setBcStatus(d.error || 'Failed', true); }
    }

    async function toggleBroadcast(id, isActive) {
      const res = await fetch('/api/admin/broadcast/id/' + id + '?key=' + KEY, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ isActive })
      });
      if (res.ok) { setBcStatus('Updated. Reload to reflect changes.'); }
      else { const d = await res.json(); setBcStatus(d.error || 'Failed', true); }
    }

    async function deleteBroadcast(id) {
      if (!confirm('Delete this broadcast session?')) return;
      const res = await fetch('/api/admin/broadcast/id/' + id + '?key=' + KEY, { method: 'DELETE' });
      if (res.ok) { document.getElementById('bc-row-' + id)?.remove(); setBcStatus('Deleted.'); }
      else { const d = await res.json(); setBcStatus(d.error || 'Failed', true); }
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

    // ── Broadcast Sessions ────────────────────────────────────────────────────

    // GET /api/broadcast — public list for Flutter (upcoming + recently started)
    .get("/api/broadcast", async () => {
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const sessions = await BroadcastSessionModel
            .find({ isActive: true, scheduledAt: { $gte: cutoff } })
            .sort({ scheduledAt: 1 })
            .lean();
        return { sessions };
    })

    // POST /api/admin/broadcast — admin creates a broadcast session with Google Meet
    .post("/api/admin/broadcast", async ({ body, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const { title, description, scheduledAt, durationMinutes } = body;
        const startDate = new Date(scheduledAt);
        if (isNaN(startDate.getTime())) {
            set.status = 400;
            return { error: "Invalid scheduledAt date" };
        }
        const mins = durationMinutes ?? 60;
        const endDate = new Date(startDate.getTime() + mins * 60 * 1000);

        let meetResult;
        try {
            meetResult = await createGuidanceMeet({
                summary: `[Broadcast] ${title}`,
                description: description || "",
                startISO: startDate.toISOString(),
                endISO: endDate.toISOString(),
            });
        } catch (err: any) {
            set.status = 500;
            return { error: "Failed to create Google Meet event", detail: err.message };
        }

        const session = await BroadcastSessionModel.create({
            title,
            description: description || "",
            scheduledAt: startDate,
            durationMinutes: mins,
            meetLink: meetResult.meetLink,
            calendarEventId: meetResult.eventId,
        });
        return { success: true, session };
    }, {
        body: t.Object({
            title: t.String({ minLength: 1 }),
            description: t.Optional(t.String()),
            scheduledAt: t.String({ minLength: 1 }),
            durationMinutes: t.Optional(t.Number({ minimum: 5 })),
        }),
    })

    // PATCH /api/admin/broadcast/id/:id — toggle active or update fields
    .patch("/api/admin/broadcast/id/:id", async ({ params, body, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const updated = await BroadcastSessionModel.findByIdAndUpdate(
            params.id,
            { $set: body },
            { new: true }
        ).lean();
        if (!updated) {
            set.status = 404;
            return { error: "Session not found" };
        }
        return { success: true, session: updated };
    }, {
        body: t.Object({
            isActive: t.Optional(t.Boolean()),
            title: t.Optional(t.String({ minLength: 1 })),
            description: t.Optional(t.String()),
        }),
    })

    // DELETE /api/admin/broadcast/id/:id — remove a broadcast session
    .delete("/api/admin/broadcast/id/:id", async ({ params, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        await BroadcastSessionModel.findByIdAndDelete(params.id);
        return { success: true };
    })

    // GET /google-meet — admin HTML dashboard
    .get("/google-meet", async ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;

        const [requests, types, broadcasts] = await Promise.all([
            GuidanceRequestModel.find().sort({ scheduledAt: 1 }).lean(),
            CareerGuidanceTypeModel.find().sort({ sortOrder: 1, name: 1 }).lean(),
            BroadcastSessionModel.find().sort({ scheduledAt: -1 }).lean(),
        ]);
        set.headers["Content-Type"] = "text/html";
        return buildAdminHtml(requests, types, broadcasts);
    });
