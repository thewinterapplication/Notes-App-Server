import { config } from "../config";

export function requireAdminAuth({ cookie, set, request }: { cookie: any; set: any; request: Request }): Response | null {
    const expected = config.adminDashboardKey;
    if (!expected) return null;

    if (cookie.adminAuth?.value === expected) {
        // Authenticated. Keep the session valid across normal navigation; the
        // "lock on refresh" behaviour is enforced client-side (a reload triggers
        // /admin-logout). no-store keeps the page from being served stale.
        set.headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        return null;
    }

    const url = new URL(request.url);
    const next = encodeURIComponent(url.pathname + url.search);
    set.status = 302;
    set.headers["Location"] = `/admin-login?next=${next}`;
    return new Response(null, { status: 302 });
}
