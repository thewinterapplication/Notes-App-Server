import mongoose, { Schema, Document } from "mongoose";

export interface IBroadcastSession extends Document {
    title: string;
    description: string;
    scheduledAt: Date;
    durationMinutes: number;
    meetLink: string;
    calendarEventId: string;
    isActive: boolean;
    createdAt: Date;
}

const BroadcastSessionSchema: Schema = new Schema(
    {
        title: { type: String, required: true },
        description: { type: String, default: "" },
        scheduledAt: { type: Date, required: true, index: true },
        durationMinutes: { type: Number, default: 60 },
        meetLink: { type: String, required: true },
        calendarEventId: { type: String, required: true },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const BroadcastSessionModel = mongoose.model<IBroadcastSession>("BroadcastSession", BroadcastSessionSchema);
