import mongoose, { Schema, Document } from "mongoose";

export interface IPlacementDocument extends Document {
    fileName: string;
    course: string;
    subject: string;
    author: string;
    fileUrl: string;
    accessType: "free" | "premium";
    likesCount: number;
    viewCount: number;
    createdAt: Date;
}

const PlacementSchema: Schema = new Schema(
    {
        fileName: { type: String, required: true },
        course: { type: String, default: "uncategorized" },
        subject: { type: String, default: "uncategorized" },
        author: { type: String, default: "Unknown author" },
        fileUrl: { type: String, required: true },
        accessType: { type: String, enum: ["free", "premium"], default: "free" },
        likesCount: { type: Number, default: 0 },
        viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const PlacementModel = mongoose.model<IPlacementDocument>("Placement", PlacementSchema);
