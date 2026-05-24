import mongoose, { Schema, Document } from "mongoose";

export interface IResumeTemplate extends Document {
    name: string;
    description: string;
    fileUrl: string;
    thumbnailUrl: string;
    fileType: "pdf" | "docx";
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
}

const ResumeTemplateSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        description: { type: String, default: "" },
        fileUrl: { type: String, required: true },
        thumbnailUrl: { type: String, default: "" },
        fileType: { type: String, enum: ["pdf", "docx"], required: true },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const ResumeTemplateModel = mongoose.model<IResumeTemplate>("ResumeTemplate", ResumeTemplateSchema);
