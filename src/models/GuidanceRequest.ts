import mongoose, { Schema, Document } from "mongoose";

export interface IGuidanceRequest extends Document {
    userPhone: string;
    userName: string;
    scheduledAt: Date;
    description: string;
    meetLink: string;
    calendarEventId: string;
    status: "scheduled" | "completed" | "cancelled";
    typeSlug?: string;
    typeName?: string;
    amountInPaise?: number;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paidAt?: Date;
    createdAt: Date;
}

const GuidanceRequestSchema: Schema = new Schema(
    {
        userPhone: { type: String, required: true, index: true },
        userName: { type: String, default: "Unknown" },
        scheduledAt: { type: Date, required: true, index: true },
        description: { type: String, required: true, maxlength: 1000 },
        meetLink: { type: String, required: true },
        calendarEventId: { type: String, required: true },
        status: { type: String, enum: ["scheduled", "completed", "cancelled"], default: "scheduled" },
        typeSlug: { type: String },
        typeName: { type: String },
        amountInPaise: { type: Number },
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        paidAt: { type: Date },
    },
    { timestamps: true }
);

export const GuidanceRequestModel = mongoose.model<IGuidanceRequest>("GuidanceRequest", GuidanceRequestSchema);
