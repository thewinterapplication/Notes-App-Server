import { config } from "../config";

export function requireAdminAuth({ cookie, set, request }: { cookie: any; set: any; request: Request }): Response | null {
    const expected = config.adminDashboardKey;
    if (!expected) return null;

    if (cookie.adminAuth?.value === expected) return null;

    const url = new URL(request.url);
    const next = encodeURIComponent(url.pathname + url.search);
    set.status = 302;
    set.headers["Location"] = `/admin-login?next=${next}`;
    return new Response(null, { status: 302 });
}
