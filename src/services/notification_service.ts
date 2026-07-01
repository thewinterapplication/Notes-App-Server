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
}

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
    data
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

    for (const batch of chunk(tokens, FCM_BATCH_SIZE)) {
        const response = await messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
            data
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
