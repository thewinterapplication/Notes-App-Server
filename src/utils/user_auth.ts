import { randomUUID } from "node:crypto";
import { IUser, UserModel } from "../models/User";

/**
 * Generate a fresh, unique session token for a device.
 * Stored on the user as `activeSessionId`. Issuing a new one for a user
 * overwrites the previous device's token, which is what logs the old
 * device out (it gets SESSION_REVOKED on its next authenticated request).
 */
export function generateSessionToken(): string {
    return randomUUID();
}

/**
 * Extract the bearer/session token from request headers.
 * Accepts `Authorization: Bearer <token>` or `x-session-id: <token>`.
 */
export function extractSessionToken(
    headers: Record<string, string | undefined>
): string | null {
    const authHeader = headers["authorization"] ?? headers["Authorization"];

    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
        const token = authHeader.slice(7).trim();
        return token.length > 0 ? token : null;
    }

    const sessionHeader = headers["x-session-id"] ?? headers["X-Session-Id"];
    return sessionHeader && sessionHeader.trim().length > 0
        ? sessionHeader.trim()
        : null;
}

export type AuthOutcome =
    | { user: IUser; error: null }
    | { user: null; error: { success: false; code: string; message: string } };

/**
 * Validate the request's session token against the single active session
 * stored on the user. Returns the authenticated user, or sets a 401 and
 * returns an error body the handler should return as-is.
 *
 * Because a new login overwrites `activeSessionId`, a token from a replaced
 * device will no longer match any user → SESSION_REVOKED.
 */
export async function authenticateUser(
    headers: Record<string, string | undefined>,
    set: { status?: number | string }
): Promise<AuthOutcome> {
    const token = extractSessionToken(headers);

    if (!token) {
        set.status = 401;
        return {
            user: null,
            error: {
                success: false,
                code: "SESSION_REVOKED",
                message: "Authentication required. Please log in again."
            }
        };
    }

    const user = await UserModel.findOne({ activeSessionId: token });

    if (!user) {
        set.status = 401;
        return {
            user: null,
            error: {
                success: false,
                code: "SESSION_REVOKED",
                message: "You have been logged out because your number was used on another device."
            }
        };
    }

    return { user, error: null };
}
