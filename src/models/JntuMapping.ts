import mongoose, { Schema, Document } from "mongoose";

export interface IJntuMappingDocument extends Document {
    course: string;
    subjects: string[];
    hidden: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const JntuMappingSchema: Schema = new Schema(
    {
        course: { type: String, required: true, unique: true },
        subjects: { type: [String], default: [] },
        hidden: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const JntuMappingModel = mongoose.model<IJntuMappingDocument>(
    "JntuMapping",
    JntuMappingSchema
);
