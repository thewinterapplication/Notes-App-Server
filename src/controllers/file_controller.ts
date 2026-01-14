import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { FileModel } from "../models/File";

export const fileController = new Elysia()
    .decorate('fileService', new FileStorageService())

    // Get files by subject
    .get("/api/files/subject/:subject", async ({ params }) => {
        const files = await FileModel.find({ subject: params.subject }).sort({ createdAt: -1 });
        return { files };
    })

    // Stream file from MinIO
    .get("/files/:name", async ({ params, set, fileService }) => {
        try {
            const fileName = params.name;
            const stream = await fileService.getFileStream(fileName);
            set.headers["Content-Type"] = "application/pdf";
            return stream;
        } catch (error: any) {
            set.status = 404;
            return { error: "File not found" };
        }
    });
