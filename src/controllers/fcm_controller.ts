import { Elysia, t } from "elysia";
import { authenticateUser } from "../utils/user_auth";

export const fcmController = new Elysia({ prefix: "/api" })

    // Register/refresh this device's FCM token on the logged-in user.
    // Overwrites any previous token — one token per user, mirroring the
    // single-active-session model (activeSessionId/activeDeviceId).
    .post("/fcm/register-token", async ({ headers, set, body }) => {
        const auth = await authenticateUser(headers, set);
        if (auth.error) return auth.error;

        auth.user.fcmToken = body.token;
        await auth.user.save();

        return { success: true, message: "FCM token registered" };
    }, {
        body: t.Object({
            token: t.String({ minLength: 1 })
        })
    });
