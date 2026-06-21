import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { JntuModel } from "../models/Jntu";
import { getJntuMappingForCourse } from "../services/mapping_service";
import { buildJntuDownloadUrl } from "../utils/download_urls";

function serializeJntuSummary(document: any) {
    const id = document._id.toString();

    return {
        id,
        fileName: document.fileName,
        course: document.course || "uncategorized",
        subject: document.subject || "uncategorized",
        author: document.author || "Unknown author",
        fileUrl: document.fileUrl,
        downloadUrl: buildJntuDownloadUrl(id),
        accessType: document.accessType || "free",
        likesCount: document.likesCount || 0,
        viewCount: document.viewCount || 0,
        pageCount: document.pageCount || 0,
        createdAt: document.createdAt
    };
}

export const jntuController = new Elysia()
    .decorate('fileService', new FileStorageService())

    // Get distinct subjects for a course (JNTU Syllabus)
    .get("/api/jntu/courses/:course/subjects", async ({ params }) => {
        const mapping = await getJntuMappingForCourse(params.course);
        return { subjects: mapping.subjects };
    })

    // Get JNTU files by course and subject
    .get("/api/jntu/courses/:course/subjects/:subject/files", async ({ params }) => {
        const files = await JntuModel.find({
            course: params.course,
            subject: params.subject
        })
            .select("fileName course subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializeJntuSummary) };
    })

    // Get JNTU files by subject (legacy)
    .get("/api/jntu/files/subject/:subject", async ({ params }) => {
        const files = await JntuModel.find({ course: params.subject })
            .select("fileName course subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializeJntuSummary) };
    });
