import mongoose, { Schema, Document } from "mongoose";

export interface IJntuDocument extends Document {
    fileName: string;
    course: string;
    semester: string;
    subject: string;
    author: string;
    fileUrl: string;
    accessType: "free" | "premium";
    likesCount: number;
    viewCount: number;
    pageCount: number;
    createdAt: Date;
}

const JntuSchema: Schema = new Schema(
    {
        fileName: { type: String, required: true },
        course: { type: String, default: "uncategorized" },
        semester: { type: String, default: "uncategorized" },
        subject: { type: String, default: "uncategorized" },
        author: { type: String, default: "Unknown author" },
        fileUrl: { type: String, required: true },
        accessType: { type: String, enum: ["free", "premium"], default: "free" },
        likesCount: { type: Number, default: 0 },
        viewCount: { type: Number, default: 0 },
        pageCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const JntuModel = mongoose.model<IJntuDocument>("Jntu", JntuSchema);
