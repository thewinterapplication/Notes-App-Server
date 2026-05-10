import { Elysia, t } from "elysia";
import { Types } from "mongoose";
import { FileStorageService } from "../services/file_storage";
import { UpskillModel } from "../models/Upskill";
import { requireAdminAuth } from "../utils/admin_auth";

function serializeUpskill(upskill: {
    _id: { toString(): string };
    upskillName: string;
    upskillUrl: string;
    description: string;
    imageUrl: string;
    createdAt: Date;
}) {
    return {
        id: upskill._id.toString(),
        upskillName: upskill.upskillName,
        upskillUrl: upskill.upskillUrl,
        description: upskill.description,
        imageUrl: upskill.imageUrl,
        createdAt: upskill.createdAt
    };
}

export const upskillController = new Elysia()
    .decorate("storage", new FileStorageService())
    .get("/upload/upskills", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("upskills.html");
    })
    .get("/upskills", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("upskills-list.html");
    })
    .get("/api/upskills", async () => {
        const upskills = await UpskillModel.find().sort({ createdAt: -1 });
        return { upskills: upskills.map(serializeUpskill) };
    })
    .delete("/api/upskills/:id", async ({ params, set, storage }) => {
        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            return { error: "Invalid upskill id" };
        }

        const upskill = await UpskillModel.findById(params.id);

        if (!upskill) {
            set.status = 404;
            return { error: "Upskill not found" };
        }

        let storageDeleted = true;

        try {
            storageDeleted = await storage.deleteFileByUrl(upskill.imageUrl);
        } catch (error) {
            storageDeleted = false;
            console.error(`Failed to delete stored image for upskill ${upskill._id}:`, error);
        }

        await upskill.deleteOne();

        return {
            success: true,
            storageDeleted
        };
    })
    .post("/upload/upskills", async ({ body, storage, set }) => {
        const upskillName = body.upskillName.trim();
        const upskillUrl = body.upskillUrl.trim();
        const description = body.description.trim();

        if (!upskillName || !upskillUrl || !description || !body.image) {
            set.status = 400;
            return { error: "Upskill name, URL, description, and image are required" };
        }

        const image = body.image;
        const looksLikeImage =
            image.type.startsWith("image/") ||
            /\.(png|jpe?g|webp|gif|svg)$/i.test(image.name);

        if (!looksLikeImage) {
            set.status = 400;
            return { error: "Please upload a valid image file" };
        }

        try {
            new URL(upskillUrl);
        } catch {
            set.status = 400;
            return { error: "Please enter a valid upskill URL" };
        }

        try {
            return await storage.saveUpskillPosting(image, { upskillName, upskillUrl, description });
        } catch (error: any) {
            set.status = 500;
            return { error: error.message || "Failed to create upskill" };
        }
    }, {
        body: t.Object({
            upskillName: t.String({ minLength: 1 }),
            upskillUrl: t.String({ minLength: 1 }),
            description: t.String({ minLength: 1 }),
            image: t.File()
        })
    });
