import mongoose, { Schema, Document } from "mongoose";

export interface ICareerGuidanceType extends Document {
    name: string;
    slug: string;
    description?: string;
    priceInPaise: number;
    active: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

const CareerGuidanceTypeSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true, unique: true, index: true },
        description: { type: String },
        priceInPaise: { type: Number, required: true, min: 0 },
        active: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const CareerGuidanceTypeModel = mongoose.model<ICareerGuidanceType>(
    "CareerGuidanceType",
    CareerGuidanceTypeSchema
);
