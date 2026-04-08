import mongoose, { Document, Schema } from "mongoose";

export interface IUpskillDocument extends Document {
    upskillName: string;
    upskillUrl: string;
    imageUrl: string;
    createdAt: Date;
    updatedAt: Date;
}

const UpskillSchema: Schema = new Schema(
    {
        upskillName: { type: String, required: true, trim: true },
        upskillUrl: { type: String, required: true, trim: true },
        imageUrl: { type: String, required: true }
    },
    { timestamps: true }
);

export const UpskillModel = mongoose.model<IUpskillDocument>("Upskill", UpskillSchema);
