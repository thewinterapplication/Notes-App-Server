import mongoose, { Document, Schema } from "mongoose";

export interface IJobDocument extends Document {
    jobName: string;
    jobUrl: string;
    description: string;
    imageUrl: string;
    createdAt: Date;
    updatedAt: Date;
}

const JobSchema: Schema = new Schema(
    {
        jobName: { type: String, required: true, trim: true },
        jobUrl: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        imageUrl: { type: String, required: true }
    },
    { timestamps: true }
);

export const JobModel = mongoose.model<IJobDocument>("Job", JobSchema);
