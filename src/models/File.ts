import mongoose, { Schema, Document } from "mongoose";

export interface IFileDocument extends Document {
    fileName: string;
    subject: string;
    fileUrl: string;
    likesCount: number;
    viewCount: number;
    createdAt: Date;
}

const FileSchema: Schema = new Schema(
    {
        fileName: { type: String, required: true },
        subject: { type: String, default: "uncategorized" },
        fileUrl: { type: String, required: true },
        likesCount: { type: Number, default: 0 },
        viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const FileModel = mongoose.model<IFileDocument>("File", FileSchema);
