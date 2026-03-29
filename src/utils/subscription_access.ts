import { IUserSubscription, normalizeUserSubscription } from "../models/User";

const ENTITLED_SUBSCRIPTION_STATUSES = new Set([
    "authenticated",
    "active",
    "pending",
    "halted",
    "paused"
]);

const toDateOrNull = (value?: Date | string | null) => {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const hasSubscriptionEntitlement = (
    subscription?: Partial<IUserSubscription> | null
) => {
    const normalized = normalizeUserSubscription(subscription);

    if (ENTITLED_SUBSCRIPTION_STATUSES.has(normalized.status)) {
        return true;
    }

    if (normalized.status !== "cancelled") {
        return false;
    }

    const currentEnd = toDateOrNull(normalized.currentEnd);
    return currentEnd !== null && currentEnd.getTime() > Date.now();
};
