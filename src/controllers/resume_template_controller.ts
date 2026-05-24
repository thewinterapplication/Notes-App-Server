import { Elysia, t } from "elysia";
import { ResumeTemplateModel } from "../models/ResumeTemplate";
import { FileStorageService } from "../services/file_storage";
import { requireAdminAuth } from "../utils/admin_auth";
import { config } from "../config";

function buildResumeAdminHtml(templates: any[]): string {
    const rows = templates.map((tp) => `
        <tr id="rt-row-${tp._id}">
            <td>
                <strong>${tp.name}</strong>
            </td>
            <td>
                <span class="badge ${tp.fileType === 'pdf' ? 'badge-pdf' : 'badge-docx'}">${tp.fileType.toUpperCase()}</span>
            </td>
            <td>
                <a href="${tp.fileUrl}" target="_blank" class="meet-btn" style="font-size:.8rem">Open</a>
            </td>
            <td><span class="badge ${tp.isActive ? 'badge-scheduled' : 'badge-cancelled'}">${tp.isActive ? 'active' : 'inactive'}</span></td>
            <td>
                <button class="action-btn" onclick="toggleTemplate('${tp._id}', ${!tp.isActive})">${tp.isActive ? 'Disable' : 'Enable'}</button>
                <button class="action-btn danger-btn" onclick="deleteTemplate('${tp._id}')">Delete</button>
            </td>
        </tr>`).join("");

    const adminKey = config.adminDashboardKey;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resume Templates</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root{--primary:#6366f1;--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f8fafc;--muted:#94a3b8;--success:#10b981;--danger:#ef4444}
    *{box-sizing:border-box}
    body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);margin:0;min-height:100vh;padding:2rem 1rem}
    .container{max-width:1100px;margin:0 auto;background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:2rem}
    h1{margin:0 0 .25rem;font-size:1.75rem;font-weight:600}
    h2{font-size:1.1rem;font-weight:600;margin:2rem 0 1rem}
    .subtitle{color:var(--muted);margin:0 0 1.75rem}
    .section{background:rgba(30,41,59,.45);border:1px solid var(--border);border-radius:.75rem;padding:1.25rem;margin-bottom:1.5rem}
    .form-grid{display:flex;flex-direction:column;gap:.85rem}
    .form-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end}
    .form-group{display:flex;flex-direction:column;gap:.3rem}
    .form-group label{font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
    input[type=text],input[type=number],input[type=file].field,select.field{background:#0f172a;border:1px solid var(--border);color:var(--text);padding:.6rem .75rem;border-radius:.5rem;font-size:.9rem;font-family:inherit;outline:none;color-scheme:dark}
    input[type=file].field{padding:.45rem .55rem;cursor:pointer}
    input:focus,select.field:focus{border-color:var(--primary)}
    .btn{padding:.55rem 1.1rem;border-radius:.5rem;border:none;cursor:pointer;font-size:.9rem;font-family:inherit;font-weight:500;transition:opacity .15s}
    .btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{opacity:.85}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    thead tr{border-bottom:1px solid var(--border)}
    th{text-align:left;padding:.6rem .75rem;color:var(--muted);font-weight:400}
    td{padding:.65rem .75rem;border-bottom:1px solid rgba(51,65,85,.5);vertical-align:middle}
    .muted{color:var(--muted);font-size:.8rem}
    .meet-btn{display:inline-block;padding:.3rem .75rem;background:var(--primary);color:#fff;border-radius:.45rem;text-decoration:none;font-size:.82rem}
    .badge{padding:.2rem .55rem;border-radius:999px;font-size:.73rem;font-weight:600}
    .badge-scheduled{background:rgba(99,102,241,.2);color:#a5b4fc}
    .badge-cancelled{background:rgba(239,68,68,.2);color:#fca5a5}
    .badge-pdf{background:rgba(239,68,68,.15);color:#fca5a5}
    .badge-docx{background:rgba(59,130,246,.15);color:#93c5fd}
    .action-btn{padding:.3rem .65rem;border-radius:.4rem;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:.8rem;cursor:pointer;font-family:inherit}
    .action-btn:hover{border-color:var(--primary);color:var(--primary)}
    .danger-btn:hover{border-color:var(--danger);color:var(--danger)}
    .empty{text-align:center;padding:2.5rem;color:var(--muted)}
    #rt-status{margin:.5rem 0;font-size:.85rem;min-height:1.2em;color:var(--success)}
  </style>
</head>
<body>
  <div class="container">
    <h1>Resume Templates</h1>
    <p class="subtitle">Manage downloadable resume templates shown in the app</p>

    <h2>Add New Template</h2>
    <div class="section">
      <div class="form-grid">
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Template Name</label>
            <input type="text" id="rt-name" placeholder="e.g. Modern Professional Resume">
          </div>
          <div class="form-group">
            <label>File Type</label>
            <select id="rt-type" class="field" style="width:120px">
              <option value="pdf">PDF</option>
              <option value="docx">Word (DOCX)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Template File (PDF or DOCX)</label>
            <input type="file" id="rt-file" class="field" accept=".pdf,.doc,.docx,application/pdf">
          </div>
          <div class="form-group" style="justify-content:flex-end">
            <button class="btn btn-primary" id="rt-submit" onclick="addTemplate()">Upload &amp; Add</button>
          </div>
        </div>
      </div>
      <div id="rt-status"></div>
    </div>

    <h2>All Templates</h2>
    ${templates.length === 0
        ? '<p class="empty">No templates yet. Add one above.</p>'
        : `<table>
          <thead><tr><th>Name</th><th>Type</th><th>File</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
  </div>
  <script>
    const KEY = '${adminKey}';
    const statusEl = document.getElementById('rt-status');
    function setStatus(msg, isErr) {
      statusEl.style.color = isErr ? '#fca5a5' : '#6ee7b7';
      statusEl.textContent = msg;
    }

    // Auto-detect file type from the chosen file's extension
    document.getElementById('rt-file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'pdf') document.getElementById('rt-type').value = 'pdf';
      else if (ext === 'doc' || ext === 'docx') document.getElementById('rt-type').value = 'docx';
    });

    async function addTemplate() {
      const name = document.getElementById('rt-name').value.trim();
      const fileType = document.getElementById('rt-type').value;
      const fileInput = document.getElementById('rt-file');
      if (!name) { setStatus('Template name is required.', true); return; }
      if (!fileInput.files[0]) { setStatus('Please choose a template file.', true); return; }

      const form = new FormData();
      form.append('name', name);
      form.append('fileType', fileType);
      form.append('file', fileInput.files[0]);

      const btn = document.getElementById('rt-submit');
      btn.disabled = true;
      setStatus('Uploading...');
      try {
        const res = await fetch('/api/admin/resume-templates/upload?key=' + KEY, {
          method: 'POST',
          body: form
        });
        if (res.ok) { setStatus('Template uploaded! Reloading...'); setTimeout(() => location.reload(), 800); }
        else { const d = await res.json(); setStatus(d.error || 'Failed', true); btn.disabled = false; }
      } catch (err) {
        setStatus('Upload error: ' + err.message, true);
        btn.disabled = false;
      }
    }

    async function toggleTemplate(id, isActive) {
      const res = await fetch('/api/admin/resume-templates/id/' + id + '?key=' + KEY, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ isActive })
      });
      if (res.ok) { setStatus('Updated. Reload to reflect.'); }
      else { const d = await res.json(); setStatus(d.error || 'Failed', true); }
    }

    async function deleteTemplate(id) {
      if (!confirm('Delete this template?')) return;
      const res = await fetch('/api/admin/resume-templates/id/' + id + '?key=' + KEY, { method: 'DELETE' });
      if (res.ok) { document.getElementById('rt-row-' + id)?.remove(); setStatus('Deleted.'); }
      else { const d = await res.json(); setStatus(d.error || 'Failed', true); }
    }
  </script>
</body>
</html>`;
}

export const resumeTemplateController = new Elysia()
    .decorate("storage", new FileStorageService())

    // GET /api/resume-templates — public list for the Flutter app
    .get("/api/resume-templates", async () => {
        const templates = await ResumeTemplateModel
            .find({ isActive: true })
            .sort({ sortOrder: 1, name: 1 })
            .lean();
        return { templates };
    })

    // GET /admin/resume-templates — admin HTML page.
    // Accepts either the ?key= query param or the dashboard adminAuth cookie,
    // so it can be linked from the cookie-authed /upload dashboard.
    .get("/admin/resume-templates", async ({ query, set, cookie, request }) => {
        if (query.key !== config.adminDashboardKey) {
            const authError = requireAdminAuth({ cookie, set, request });
            if (authError) return authError;
        }
        const templates = await ResumeTemplateModel.find().sort({ sortOrder: 1, name: 1 }).lean();
        set.headers["Content-Type"] = "text/html";
        return buildResumeAdminHtml(templates);
    })

    // POST /api/admin/resume-templates — create
    .post("/api/admin/resume-templates", async ({ body, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const template = await ResumeTemplateModel.create(body);
        return { success: true, template };
    }, {
        body: t.Object({
            name: t.String({ minLength: 1 }),
            fileType: t.Union([t.Literal("pdf"), t.Literal("docx")]),
            fileUrl: t.String({ minLength: 1 }),
            thumbnailUrl: t.Optional(t.String()),
            description: t.Optional(t.String()),
            sortOrder: t.Optional(t.Number()),
        }),
    })

    // POST /api/admin/resume-templates/upload — upload file (+ optional thumbnail) and create
    .post("/api/admin/resume-templates/upload", async ({ body, query, set, storage }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        try {
            const { file, thumbnail, name, fileType, description, sortOrder } = body;
            const { url: fileUrl } = await storage.saveResumeTemplateFile(file);
            let thumbnailUrl = "";
            if (thumbnail) {
                const thumbResult = await storage.saveResumeTemplateFile(thumbnail);
                thumbnailUrl = thumbResult.url;
            }
            const template = await ResumeTemplateModel.create({
                name,
                fileType,
                fileUrl,
                thumbnailUrl,
                description: description || "",
                sortOrder: sortOrder ? parseInt(sortOrder, 10) || 0 : 0,
            });
            return { success: true, template };
        } catch (error: any) {
            set.status = 500;
            return { error: error.message || "Upload failed" };
        }
    }, {
        body: t.Object({
            file: t.File(),
            thumbnail: t.Optional(t.File()),
            name: t.String({ minLength: 1 }),
            fileType: t.Union([t.Literal("pdf"), t.Literal("docx")]),
            description: t.Optional(t.String()),
            sortOrder: t.Optional(t.String()),
        }),
    })

    // PATCH /api/admin/resume-templates/id/:id — update
    .patch("/api/admin/resume-templates/id/:id", async ({ params, body, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        const updated = await ResumeTemplateModel.findByIdAndUpdate(
            params.id, { $set: body }, { new: true }
        ).lean();
        if (!updated) { set.status = 404; return { error: "Not found" }; }
        return { success: true, template: updated };
    }, {
        body: t.Object({
            isActive: t.Optional(t.Boolean()),
            name: t.Optional(t.String({ minLength: 1 })),
            description: t.Optional(t.String()),
            sortOrder: t.Optional(t.Number()),
        }),
    })

    // DELETE /api/admin/resume-templates/id/:id — delete
    .delete("/api/admin/resume-templates/id/:id", async ({ params, query, set }) => {
        if (query.key !== config.adminDashboardKey) {
            set.status = 401;
            return { error: "Unauthorized" };
        }
        await ResumeTemplateModel.findByIdAndDelete(params.id);
        return { success: true };
    });
