import { Elysia, t } from "elysia";
import { FileStorageService } from "../services/file_storage";

export const uploadController = new Elysia({ prefix: "/upload" })
    .decorate('storage', new FileStorageService()) // Dependency injection style
    .get("/", () => Bun.file("upload.html"))
    .post("/", async ({ body, storage }) => {
        console.log("[Upload] POST /upload received");
        const { file, subject, customFileName } = body;

        if (!file) {
            console.log("[Upload] No file in request");
            return { error: "No file uploaded" };
        }

        console.log("[Upload] File received:", file.name, "Size:", file.size);

        try {
            const result = await storage.saveFile(file, { subject, customFileName });
            console.log("[Upload] Success:", result);
            return result;
        } catch (error: any) {
            console.error("[Upload] Error:", error.message);
            return { error: error.message || "Upload failed" };
        }
    }, {
        body: t.Object({
            file: t.File(),
            subject: t.Optional(t.String()),
            customFileName: t.Optional(t.String())
        })
    });
