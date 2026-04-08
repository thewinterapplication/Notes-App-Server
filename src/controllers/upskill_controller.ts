import { Elysia, t } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { UpskillModel } from "../models/Upskill";

function serializeUpskill(upskill: {
    _id: { toString(): string };
    upskillName: string;
    upskillUrl: string;
    imageUrl: string;
    createdAt: Date;
}) {
    return {
        id: upskill._id.toString(),
        upskillName: upskill.upskillName,
        upskillUrl: upskill.upskillUrl,
        imageUrl: upskill.imageUrl,
        createdAt: upskill.createdAt
    };
}

export const upskillController = new Elysia()
    .decorate("storage", new FileStorageService())
    .get("/upload/upskills", () => Bun.file("upskills.html"))
    .get("/upskills", () => Bun.file("upskills-list.html"))
    .get("/api/upskills", async () => {
        const upskills = await UpskillModel.find().sort({ createdAt: -1 });
        return { upskills: upskills.map(serializeUpskill) };
    })
    .post("/upload/upskills", async ({ body, storage, set }) => {
        const upskillName = body.upskillName.trim();
        const upskillUrl = body.upskillUrl.trim();

        if (!upskillName || !upskillUrl || !body.image) {
            set.status = 400;
            return { error: "Upskill name, URL, and image are required" };
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
            return await storage.saveUpskillPosting(image, { upskillName, upskillUrl });
        } catch (error: any) {
            set.status = 500;
            return { error: error.message || "Failed to create upskill" };
        }
    }, {
        body: t.Object({
            upskillName: t.String({ minLength: 1 }),
            upskillUrl: t.String({ minLength: 1 }),
            image: t.File()
        })
    });
