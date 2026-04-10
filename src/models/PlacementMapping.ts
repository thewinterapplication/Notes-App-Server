import mongoose, { Schema, Document } from "mongoose";

export interface IPlacementMappingDocument extends Document {
    course: string;
    subjects: string[];
    hidden: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PlacementMappingSchema: Schema = new Schema(
    {
        course: { type: String, required: true, unique: true },
        subjects: { type: [String], default: [] },
        hidden: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const PlacementMappingModel = mongoose.model<IPlacementMappingDocument>(
    "PlacementMapping",
    PlacementMappingSchema
);
