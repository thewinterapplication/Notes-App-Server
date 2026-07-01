import { config } from "../config";
import { UserModel } from "../models/User";
import { getFirebaseMessaging } from "./firebase_admin";

export type BroadcastNotificationType =
    | "notes"
    | "jntu"
    | "placement"
    | "job"
    | "upskill"
    | "resume";

interface BroadcastNotificationArgs {
    title: string;
    body: string;
    data: { type: BroadcastNotificationType } & Record<string, string>;
    /** Optional image shown as a big-picture-style notification. Defaults
     *  to the predefined per-type image (see NOTIFICATION_IMAGES) when
     *  omitted. */
    imageUrl?: string;
}

// Fixed, predefined image per content type — served as plain static files
// (see the /assets/notifications/*.png routes in src/index.ts).
const NOTIFICATION_IMAGES: Record<BroadcastNotificationType, string> = {
    notes: `${config.baseUrl}/assets/notifications/notes.png`,
    jntu: `${config.baseUrl}/assets/notifications/jntu.png`,
    placement: `${config.baseUrl}/assets/notifications/placement.png`,
    job: `${config.baseUrl}/assets/notifications/job.png`,
    upskill: `${config.baseUrl}/assets/notifications/upskill.png`,
    resume: `${config.baseUrl}/assets/notifications/resume.png`
};

// FCM's sendEachForMulticast accepts at most 500 tokens per call.
const FCM_BATCH_SIZE = 500;

const STALE_TOKEN_ERROR_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token"
]);

const chunk = <T>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

/**
 * Sends a push notification to every user with a registered FCM token.
 * Intended to be called fire-and-forget (not awaited) right after content
 * creation, so a notification failure or slowness never blocks the upload
 * response. Stale tokens (uninstalled app, etc.) are cleared from the user
 * on delivery failure.
 */
export const broadcastNotification = async ({
    title,
    body,
    data,
    imageUrl = NOTIFICATION_IMAGES[data.type]
}: BroadcastNotificationArgs): Promise<void> => {
    const messaging = getFirebaseMessaging();

    if (!messaging) {
        return;
    }

    const users = await UserModel.find(
        { fcmToken: { $ne: null } },
        { fcmToken: 1 }
    );

    const tokenToUserId = new Map(
        users
            .filter((user) => Boolean(user.fcmToken))
            .map((user) => [user.fcmToken as string, user._id])
    );
    const tokens = Array.from(tokenToUserId.keys());

    if (tokens.length === 0) {
        return;
    }

    // imageUrl is sent two ways: as a native Android notification field (so
    // the OS renders a big-picture notification on its own when the app is
    // backgrounded/killed) and in `data` (so the foreground handler in the
    // app can render the same style manually, since FCM doesn't auto-display
    // anything while the app is in the foreground).
    const dataWithImage = imageUrl ? { ...data, imageUrl } : data;

    for (const batch of chunk(tokens, FCM_BATCH_SIZE)) {
        const response = await messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
            data: dataWithImage,
            android: imageUrl ? { notification: { imageUrl } } : undefined
        });

        const staleTokenUserIds: unknown[] = [];
        response.responses.forEach((result, index) => {
            if (result.success) {
                return;
            }

            const errorCode = result.error?.code;
            if (errorCode && STALE_TOKEN_ERROR_CODES.has(errorCode)) {
                const staleToken = batch[index];
                const userId = tokenToUserId.get(staleToken);
                if (userId) {
                    staleTokenUserIds.push(userId);
                }
            }
        });

        if (staleTokenUserIds.length > 0) {
            await UserModel.updateMany(
                { _id: { $in: staleTokenUserIds } },
                { $set: { fcmToken: null } }
            );
        }
    }
};

/** Fire-and-forget wrapper — logs failures instead of throwing. */
export const broadcastNotificationInBackground = (
    args: BroadcastNotificationArgs
): void => {
    void broadcastNotification(args).catch((error) => {
        console.error("[notifications] Failed to broadcast:", error);
    });
};
