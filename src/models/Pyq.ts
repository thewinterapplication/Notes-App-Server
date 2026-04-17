import mongoose, { Schema, Document } from "mongoose";

export interface IPyqDocument extends Document {
    fileName: string;
    course: string;
    subject: string;
    fileUrl: string;
    likesCount: number;
    viewCount: number;
    pageCount: number;
    createdAt: Date;
}

const PyqSchema: Schema = new Schema(
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

export const PyqModel = mongoose.model<IPyqDocument>("Pyq", PyqSchema);
