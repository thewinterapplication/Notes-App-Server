import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { FileModel } from "../models/File";

export const fileController = new Elysia()
    .decorate('fileService', new FileStorageService())

    // Get distinct subjects for a course
    .get("/api/courses/:course/subjects", async ({ params }) => {
        const subjects = await FileModel.distinct("subject", { course: params.course });
        return { subjects: subjects.filter(s => s && s !== "uncategorized") };
    })

    // Get files by course and subject
    .get("/api/courses/:course/subjects/:subject/files", async ({ params }) => {
        const files = await FileModel.find({
            course: params.course,
            subject: params.subject
        }).sort({ createdAt: -1 });
        return { files };
    })

    // Get files by subject (legacy - for backward compatibility)
    .get("/api/files/subject/:subject", async ({ params }) => {
        const files = await FileModel.find({ course: params.subject }).sort({ createdAt: -1 });
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
