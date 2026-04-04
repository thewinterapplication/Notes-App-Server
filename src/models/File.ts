import mongoose, { Schema, Document } from "mongoose";

export interface IFileDocument extends Document {
    fileName: string;
    course: string;
    subject: string;
    fileUrl: string;
    accessType: "free" | "premium";
    likesCount: number;
    viewCount: number;
    createdAt: Date;
}

const FileSchema: Schema = new Schema(
    {
        fileName: { type: String, required: true },
        course: { type: String, default: "uncategorized" },
        subject: { type: String, default: "uncategorized" },
        fileUrl: { type: String, required: true },
        accessType: { type: String, enum: ["free", "premium"], default: "free" },
        likesCount: { type: Number, default: 0 },
        viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const FileModel = mongoose.model<IFileDocument>("File", FileSchema);
