import mongoose, { Schema, Document } from "mongoose";

export type UserSubscriptionStatus =
    | "none"
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "paused"
    | "cancelled"
    | "completed"
    | "expired";

export interface IUserSubscription {
    planCode?: string | null;
    planId?: string | null;
    subscriptionId?: string | null;
    status: UserSubscriptionStatus;
    shortUrl?: string | null;
    customerId?: string | null;
    lastPaymentId?: string | null;
    lastPaymentMethod?: string | null;
    currentStart?: Date | null;
    currentEnd?: Date | null;
    chargeAt?: Date | null;
    startAt?: Date | null;
    endAt?: Date | null;
    endedAt?: Date | null;
    expireBy?: Date | null;
    paidCount: number;
    remainingCount?: number | null;
    totalCount?: number | null;
    customerNotify: boolean;
    notes: Record<string, string>;
    lastWebhookEvent?: string | null;
    lastWebhookEventId?: string | null;
    lastWebhookReceivedAt?: Date | null;
    lastSignatureVerifiedAt?: Date | null;
    cancelAtCycleEnd: boolean;
    updatedAt?: Date | null;
}

export interface IUser extends Document {
    name: string;
    phone: string;
    lastTransaction?: Date;
    favourites: string[];
    subscription: IUserSubscription;
    createdAt: Date;
    updatedAt: Date;
}

export const createDefaultUserSubscription = (): IUserSubscription => ({
    planCode: null,
    planId: null,
    subscriptionId: null,
    status: "none",
    shortUrl: null,
    customerId: null,
    lastPaymentId: null,
    lastPaymentMethod: null,
    currentStart: null,
    currentEnd: null,
    chargeAt: null,
    startAt: null,
    endAt: null,
    endedAt: null,
    expireBy: null,
    paidCount: 0,
    remainingCount: null,
    totalCount: null,
    customerNotify: true,
    notes: {},
    lastWebhookEvent: null,
    lastWebhookEventId: null,
    lastWebhookReceivedAt: null,
    lastSignatureVerifiedAt: null,
    cancelAtCycleEnd: false,
    updatedAt: null
});

export const normalizeUserSubscription = (
    subscription?: Partial<IUserSubscription> | null
): IUserSubscription => {
    const defaults = createDefaultUserSubscription();

    return {
        ...defaults,
        ...subscription,
        notes: subscription?.notes ?? defaults.notes,
        paidCount: subscription?.paidCount ?? defaults.paidCount,
        customerNotify: subscription?.customerNotify ?? defaults.customerNotify,
        cancelAtCycleEnd: subscription?.cancelAtCycleEnd ?? defaults.cancelAtCycleEnd
    };
};

const UserSubscriptionSchema = new Schema<IUserSubscription>(
    {
        planCode: {
            type: String,
            default: null
        },
        planId: {
            type: String,
            default: null
        },
        subscriptionId: {
            type: String,
            default: null
        },
        status: {
            type: String,
            enum: ["none", "created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired"],
            default: "none"
        },
        shortUrl: {
            type: String,
            default: null
        },
        customerId: {
            type: String,
            default: null
        },
        lastPaymentId: {
            type: String,
            default: null
        },
        lastPaymentMethod: {
            type: String,
            default: null
        },
        currentStart: {
            type: Date,
            default: null
        },
        currentEnd: {
            type: Date,
            default: null
        },
        chargeAt: {
            type: Date,
            default: null
        },
        startAt: {
            type: Date,
            default: null
        },
        endAt: {
            type: Date,
            default: null
        },
        endedAt: {
            type: Date,
            default: null
        },
        expireBy: {
            type: Date,
            default: null
        },
        paidCount: {
            type: Number,
            default: 0
        },
        remainingCount: {
            type: Number,
            default: null
        },
        totalCount: {
            type: Number,
            default: null
        },
        customerNotify: {
            type: Boolean,
            default: true
        },
        notes: {
            type: Schema.Types.Mixed,
            default: {}
        },
        lastWebhookEvent: {
            type: String,
            default: null
        },
        lastWebhookEventId: {
            type: String,
            default: null
        },
        lastWebhookReceivedAt: {
            type: Date,
            default: null
        },
        lastSignatureVerifiedAt: {
            type: Date,
            default: null
        },
        cancelAtCycleEnd: {
            type: Boolean,
            default: false
        },
        updatedAt: {
            type: Date,
            default: null
        }
    },
    {
        _id: false
    }
);

const UserSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        lastTransaction: {
            type: Date,
            default: null
        },
        favourites: {
            type: [String],
            default: []
        },
        subscription: {
            type: UserSubscriptionSchema,
            default: createDefaultUserSubscription
        }
    },
    {
        timestamps: true
    }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
