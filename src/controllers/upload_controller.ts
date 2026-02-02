import { Elysia, t } from "elysia";
import { FileStorageService } from "../services/file_storage";

export const uploadController = new Elysia({ prefix: "/upload" })
    .decorate('storage', new FileStorageService()) // Dependency injection style
    .get("/", () => Bun.file("upload.html"))
    .post("/", async ({ body, storage }) => {
        const { file, course, subject, customFileName } = body;

        if (!file) {
            return { error: "No file uploaded" };
        }

        try {
            const result = await storage.saveFile(file, { course, subject, customFileName });
            return result;
        } catch (error: any) {
            return { error: error.message || "Upload failed" };
        }
    }, {
        body: t.Object({
            file: t.File(),
            course: t.Optional(t.String()),
            subject: t.Optional(t.String()),
            customFileName: t.Optional(t.String())
        })
    });
