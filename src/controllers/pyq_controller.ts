import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { PyqModel } from "../models/Pyq";

export const pyqController = new Elysia()
    .decorate('fileService', new FileStorageService())

    // Get distinct subjects for a course (PYQ)
    .get("/api/pyq/courses/:course/subjects", async ({ params }) => {
        const subjects = await PyqModel.distinct("subject", { course: params.course });
        return { subjects: subjects.filter(s => s && s !== "uncategorized") };
    })

    // Get PYQ files by course and subject
    .get("/api/pyq/courses/:course/subjects/:subject/files", async ({ params }) => {
        const files = await PyqModel.find({
            course: params.course,
            subject: params.subject
        }).sort({ createdAt: -1 });
        return { files };
    })

    // Get PYQ files by subject (legacy)
    .get("/api/pyq/files/subject/:subject", async ({ params }) => {
        const files = await PyqModel.find({ course: params.subject }).sort({ createdAt: -1 });
        return { files };
    });
