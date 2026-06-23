import mongoose, { Schema, Document } from "mongoose";

export interface IJntuSemester {
    name: string;
    subjects: string[];
}

export interface IJntuMappingDocument extends Document {
    course: string;
    semesters: IJntuSemester[];
    hidden: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const JntuSemesterSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        subjects: { type: [String], default: [] },
    },
    { _id: false }
);

const JntuMappingSchema: Schema = new Schema(
    {
        course: { type: String, required: true, unique: true },
        semesters: { type: [JntuSemesterSchema], default: [] },
        hidden: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const JntuMappingModel = mongoose.model<IJntuMappingDocument>(
    "JntuMapping",
    JntuMappingSchema
);
