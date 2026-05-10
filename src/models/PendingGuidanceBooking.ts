import mongoose, { Schema, Document } from "mongoose";

export interface IPendingGuidanceBooking extends Document {
    userPhone: string;
    typeSlug: string;
    typeName: string;
    scheduledAt: Date;
    description: string;
    amountInPaise: number;
    razorpayOrderId: string;
    status: "created" | "paid" | "expired" | "failed";
    createdAt: Date;
    updatedAt: Date;
}

const PendingGuidanceBookingSchema: Schema = new Schema(
    {
        userPhone: { type: String, required: true, index: true },
        typeSlug: { type: String, required: true },
        typeName: { type: String, required: true },
        scheduledAt: { type: Date, required: true },
        description: { type: String, required: true },
        amountInPaise: { type: Number, required: true },
        razorpayOrderId: { type: String, required: true, unique: true, index: true },
        status: {
            type: String,
            enum: ["created", "paid", "expired", "failed"],
            default: "created",
        },
    },
    { timestamps: true }
);

// TTL: auto-expire "created" docs after 2 hours (webhook / verify can take a moment)
PendingGuidanceBookingSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 7200, partialFilterExpression: { status: "created" } }
);

export const PendingGuidanceBookingModel = mongoose.model<IPendingGuidanceBooking>(
    "PendingGuidanceBooking",
    PendingGuidanceBookingSchema
);
