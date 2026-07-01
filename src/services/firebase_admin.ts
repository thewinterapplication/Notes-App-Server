import admin from "firebase-admin";
import { config } from "../config";

// Lazily initialized so the rest of the backend keeps working even before
// FIREBASE_SERVICE_ACCOUNT_JSON is configured (broadcast notifications are
// an additive feature, not a hard dependency like MongoDB).
let messaging: admin.messaging.Messaging | null = null;
let initAttempted = false;

const parseServiceAccount = (raw: string): admin.ServiceAccount | null => {
    if (!raw) {
        return null;
    }

    const tryParse = (value: string) => {
        try {
            return JSON.parse(value) as admin.ServiceAccount;
        } catch {
            return null;
        }
    };

    return tryParse(raw) ?? tryParse(Buffer.from(raw, "base64").toString("utf-8"));
};

export const getFirebaseMessaging = (): admin.messaging.Messaging | null => {
    if (messaging) {
        return messaging;
    }

    if (initAttempted) {
        return null;
    }

    initAttempted = true;
    const serviceAccount = parseServiceAccount(config.firebase.serviceAccountJson);

    if (!serviceAccount) {
        console.warn(
            "[firebase] FIREBASE_SERVICE_ACCOUNT_JSON is not set or invalid; push notifications are disabled."
        );
        return null;
    }

    const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    messaging = app.messaging();
    console.log("[firebase] Firebase Admin initialized; push notifications enabled.");
    return messaging;
};
