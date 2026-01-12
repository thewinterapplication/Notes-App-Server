import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
    name: string;
    phone: string;
    lastTransaction?: Date;
    favourites: string[];
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        lastTransaction: {
            type: Date,
            default: null
        },
        favourites: {
            type: [String],
            default: []
        }
    },
    {
        timestamps: true
    }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
