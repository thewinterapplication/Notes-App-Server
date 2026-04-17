import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { PyqModel } from "../models/Pyq";
import { buildPyqDownloadUrl } from "../utils/download_urls";

function serializePyqSummary(document: any) {
    const id = document._id.toString();

    return {
        id,
        fileName: document.fileName,
        course: document.course || "uncategorized",
        subject: document.subject || "uncategorized",
        fileUrl: document.fileUrl,
        downloadUrl: buildPyqDownloadUrl(id),
        likesCount: document.likesCount || 0,
        viewCount: document.viewCount || 0,
        pageCount: document.pageCount || 0,
        createdAt: document.createdAt
    };
}

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
        })
            .select("fileName course subject fileUrl likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializePyqSummary) };
    })

    // Get PYQ files by subject (legacy)
    .get("/api/pyq/files/subject/:subject", async ({ params }) => {
        const files = await PyqModel.find({ course: params.subject })
            .select("fileName course subject fileUrl likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializePyqSummary) };
    });
