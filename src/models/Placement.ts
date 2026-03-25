import mongoose, { Schema, Document } from "mongoose";

export interface IPlacementDocument extends Document {
    fileName: string;
    course: string;
    subject: string;
    fileUrl: string;
    likesCount: number;
    viewCount: number;
    createdAt: Date;
}

const PlacementSchema: Schema = new Schema(
    {
        fileName: { type: String, required: true },
        course: { type: String, default: "uncategorized" },
        subject: { type: String, default: "uncategorized" },
        fileUrl: { type: String, required: true },
        likesCount: { type: Number, default: 0 },
        viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const PlacementModel = mongoose.model<IPlacementDocument>("Placement", PlacementSchema);
