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
    #rt-progress-wrap{display:none;margin-top:.6rem}
    #rt-progress-wrap.active{display:block}
    .progress-bar{width:100%;height:8px;background:#0f172a;border:1px solid var(--border);border-radius:999px;overflow:hidden}
    .progress-fill{height:100%;width:0%;background:linear-gradient(90deg,var(--primary),#8b5cf6);transition:width .15s ease}
    .progress-label{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-top:.35rem}
    .dropzone{position:relative;display:flex;align-items:center;gap:1rem;padding:1.1rem 1.25rem;border:1.5px dashed var(--border);border-radius:.75rem;background:linear-gradient(135deg,rgba(99,102,241,.06),rgba(139,92,246,.04));cursor:pointer;transition:border-color .15s,background .15s}
    .dropzone:hover,.dropzone.drag{border-color:var(--primary);background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08))}
    .dropzone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer}
    .dz-icon{width:42px;height:42px;border-radius:.6rem;background:rgba(99,102,241,.18);display:flex;align-items:center;justify-content:center;color:#a5b4fc;flex-shrink:0}
    .dz-icon svg{width:22px;height:22px}
    .dz-text{display:flex;flex-direction:column;gap:.15rem;min-width:0;flex:1}
    .dz-title{font-size:.92rem;color:var(--text);font-weight:500}
    .dz-title strong{color:#a5b4fc;font-weight:600}
    .dz-sub{font-size:.78rem;color:var(--muted)}
    .dz-file{font-size:.85rem;color:#6ee7b7;word-break:break-all}
    .dropzone.has-file{border-style:solid;border-color:rgba(110,231,183,.5);background:linear-gradient(135deg,rgba(16,185,129,.08),rgba(99,102,241,.04))}
    .dropzone.has-file .dz-icon{background:rgba(16,185,129,.18);color:#6ee7b7}
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
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Template File (PDF)</label>
            <label class="dropzone" id="rt-dropzone" for="rt-file">
              <div class="dz-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>
              </div>
              <div class="dz-text">
                <span class="dz-title" id="rt-dz-title">Drop your PDF here or <strong>click to browse</strong></span>
                <span class="dz-sub" id="rt-dz-sub">PDF only · max 25&nbsp;MB</span>
              </div>
              <input type="file" id="rt-file" accept=".pdf,application/pdf">
            </label>
          </div>
          <div class="form-group" style="justify-content:flex-end">
            <button class="btn btn-primary" id="rt-submit" onclick="addTemplate()">Upload &amp; Add</button>
          </div>
        </div>
      </div>
      <div id="rt-status"></div>
      <div id="rt-progress-wrap">
        <div class="progress-bar"><div class="progress-fill" id="rt-progress-fill"></div></div>
        <div class="progress-label">
          <span id="rt-progress-text">0%</span>
          <span id="rt-progress-bytes"></span>
        </div>
      </div>
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

    const fileInputEl = document.getElementById('rt-file');
    const dropzoneEl = document.getElementById('rt-dropzone');
    const dzTitleEl = document.getElementById('rt-dz-title');
    const dzSubEl = document.getElementById('rt-dz-sub');
    const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';

    function reflectFile(f) {
      if (!f) {
        dropzoneEl.classList.remove('has-file');
        dzTitleEl.innerHTML = 'Drop your PDF here or <strong>click to browse</strong>';
        dzSubEl.textContent = 'PDF only · max 25 MB';
        return;
      }
      dropzoneEl.classList.add('has-file');
      dzTitleEl.textContent = f.name;
      dzSubEl.textContent = fmtSize(f.size) + ' · click to change';
    }

    fileInputEl.addEventListener('change', (e) => reflectFile(e.target.files[0]));

    ['dragenter','dragover'].forEach(ev => dropzoneEl.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); dropzoneEl.classList.add('drag');
    }));
    ['dragleave','drop'].forEach(ev => dropzoneEl.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); dropzoneEl.classList.remove('drag');
    }));
    dropzoneEl.addEventListener('drop', (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      const dt = new DataTransfer();
      dt.items.add(f);
      fileInputEl.files = dt.files;
      reflectFile(f);
    });

    async function addTemplate() {
      const name = document.getElementById('rt-name').value.trim();
      const fileType = 'pdf';
      const fileInput = fileInputEl;
      if (!name) { setStatus('Template name is required.', true); return; }
      if (!fileInput.files[0]) { setStatus('Please choose a template file.', true); return; }

      const form = new FormData();
      form.append('name', name);
      form.append('fileType', fileType);
      form.append('file', fileInput.files[0]);

      const btn = document.getElementById('rt-submit');
      const wrap = document.getElementById('rt-progress-wrap');
      const fill = document.getElementById('rt-progress-fill');
      const pctText = document.getElementById('rt-progress-text');
      const bytesText = document.getElementById('rt-progress-bytes');
      btn.disabled = true;
      setStatus('Uploading...');
      wrap.classList.add('active');
      fill.style.width = '0%';
      pctText.textContent = '0%';
      bytesText.textContent = '';

      const fmt = (n) => {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(2) + ' MB';
      };

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/resume-templates/upload?key=' + KEY);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          fill.style.width = pct + '%';
          pctText.textContent = pct + '%';
          bytesText.textContent = fmt(e.loaded) + ' / ' + fmt(e.total);
        } else {
          bytesText.textContent = fmt(e.loaded) + ' uploaded';
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          fill.style.width = '100%';
          pctText.textContent = '100%';
          setStatus('Template uploaded! Reloading...');
          setTimeout(() => location.reload(), 800);
        } else {
          let msg = 'Failed';
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
          setStatus(msg, true);
          btn.disabled = false;
          wrap.classList.remove('active');
        }
      };
      xhr.onerror = () => {
        setStatus('Upload error: network failure', true);
        btn.disabled = false;
        wrap.classList.remove('active');
      };
      xhr.send(form);
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
