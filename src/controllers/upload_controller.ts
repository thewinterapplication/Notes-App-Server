import { Elysia, t } from "elysia";
import { FileStorageService } from "../services/file_storage";

export const uploadController = new Elysia({ prefix: "/upload" })
    .decorate('storage', new FileStorageService()) // Dependency injection style
    .get("/", () => Bun.file("upload.html"))
    .post("/", async ({ body, storage }) => {
        const { file, course, subject, customFileName, author, accessType } = body;

        if (!file) {
            return { error: "No file uploaded" };
        }

        try {
            const result = await storage.saveFile(file, {
                course,
                subject,
                customFileName,
                author,
                accessType
            });
            return result;
        } catch (error: any) {
            return { error: error.message || "Upload failed" };
        }
    }, {
        body: t.Object({
            file: t.File(),
            course: t.Optional(t.String()),
            subject: t.Optional(t.String()),
            customFileName: t.Optional(t.String()),
            author: t.Optional(t.String()),
            accessType: t.Optional(t.Union([t.Literal("free"), t.Literal("premium")]))
        })
    });
