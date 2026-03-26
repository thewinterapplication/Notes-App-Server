import mongoose, { Document, Schema } from "mongoose";

export interface IRazorpayWebhookEvent extends Document {
    eventId: string;
    event: string;
    subscriptionId?: string | null;
    processedAt: Date;
}

const RazorpayWebhookEventSchema = new Schema<IRazorpayWebhookEvent>(
    {
        eventId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        event: {
            type: String,
            required: true,
            trim: true
        },
        subscriptionId: {
            type: String,
            default: null
        },
        processedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: false
    }
);

export const RazorpayWebhookEventModel = mongoose.model<IRazorpayWebhookEvent>(
    "RazorpayWebhookEvent",
    RazorpayWebhookEventSchema
);
