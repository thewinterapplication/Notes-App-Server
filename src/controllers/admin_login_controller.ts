import { Elysia, t } from "elysia";
import { config } from "../config";

function loginPageHtml(next: string, error: boolean): string {
    const safeNext = next.replace(/"/g, "&quot;");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box}
    body{font-family:'Outfit',sans-serif;background:#0f172a;color:#f8fafc;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
    .box{background:#1e293b;border:1px solid #334155;border-radius:1rem;padding:2.5rem 2rem;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
    h1{margin:0 0 .25rem;font-size:1.5rem;font-weight:600;text-align:center}
    .subtitle{color:#94a3b8;text-align:center;margin:0 0 1.75rem;font-size:.9rem}
    label{display:block;font-size:.8rem;color:#94a3b8;margin-bottom:.5rem;letter-spacing:.05em;text-transform:uppercase}
    input[type=password]{width:100%;padding:.85rem 1rem;background:#0f172a;border:1px solid #334155;border-radius:.6rem;color:#f8fafc;font-size:1rem;font-family:inherit;outline:none;transition:border .15s}
    input[type=password]:focus{border-color:#6366f1}
    button{width:100%;padding:.85rem;margin-top:1.25rem;background:#6366f1;color:white;border:none;border-radius:.6rem;font-size:1rem;font-weight:500;font-family:inherit;cursor:pointer;transition:background .15s}
    button:hover{background:#4f46e5}
    .error{color:#fca5a5;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);padding:.6rem .85rem;border-radius:.5rem;margin-bottom:1rem;font-size:.85rem;text-align:center}
  </style>
</head>
<body>
  <form class="box" method="POST" action="/admin-login">
    <h1>Admin Access</h1>
    <p class="subtitle">Enter password to continue</p>
    ${error ? '<div class="error">Incorrect password</div>' : ''}
    <input type="hidden" name="next" value="${safeNext}">
    <label for="password">Password</label>
    <input id="password" type="password" name="password" autofocus required autocomplete="current-password">
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

export const adminLoginController = new Elysia()
    .get("/admin-login", ({ query, set }) => {
        const next = (query.next as string) || "/";
        const error = query.error === "1";
        set.headers["Content-Type"] = "text/html";
        return loginPageHtml(next, error);
    })
    .post("/admin-login", ({ body, cookie, set }) => {
        const { password, next } = body as { password: string; next?: string };
        const expected = config.adminDashboardKey;

        if (expected && password === expected) {
            cookie.adminAuth.set({
                value: expected,
                httpOnly: true,
                path: "/",
                maxAge: 60 * 60 * 24 * 7,
                sameSite: "lax",
            });
            set.status = 302;
            set.headers["Location"] = next || "/";
            return new Response(null, { status: 302 });
        }

        const safeNext = encodeURIComponent(next || "/");
        set.status = 302;
        set.headers["Location"] = `/admin-login?next=${safeNext}&error=1`;
        return new Response(null, { status: 302 });
    }, {
        body: t.Object({
            password: t.String(),
            next: t.Optional(t.String()),
        })
    });
