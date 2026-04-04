import mongoose, { Schema, Document } from "mongoose";

export interface IMappingDocument extends Document {
    course: string;
    subjects: string[];
    hidden: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const MappingSchema: Schema = new Schema(
    {
        course: { type: String, required: true, unique: true },
        subjects: { type: [String], default: [] },
        hidden: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const MappingModel = mongoose.model<IMappingDocument>("Mapping", MappingSchema);
