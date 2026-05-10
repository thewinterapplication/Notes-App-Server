import { Elysia, t } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { requireAdminAuth } from "../utils/admin_auth";

export const pyqUploadController = new Elysia({ prefix: "/upload-pyq" })
    .decorate('storage', new FileStorageService())
    .get("/", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("upload.html");
    })
    .post("/", async ({ body, storage }) => {
        const { file, course, subject, customFileName } = body;

        if (!file) {
            return { error: "No file uploaded" };
        }

        try {
            const result = await storage.savePyqFile(file, { course, subject, customFileName });
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
