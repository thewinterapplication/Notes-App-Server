import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { JntuModel } from "../models/Jntu";
import { getJntuSemesters, getJntuSubjects } from "../services/mapping_service";
import { buildJntuDownloadUrl } from "../utils/download_urls";

function serializeJntuSummary(document: any) {
    const id = document._id.toString();

    return {
        id,
        fileName: document.fileName,
        course: document.course || "uncategorized",
        semester: document.semester || "uncategorized",
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

    // Get semesters for a course (JNTU Syllabus)
    .get("/api/jntu/courses/:course/semesters", async ({ params }) => {
        const semesters = await getJntuSemesters(decodeURIComponent(params.course));
        return { semesters };
    })

    // Get subjects for a course and semester
    .get("/api/jntu/courses/:course/semesters/:semester/subjects", async ({ params }) => {
        const subjects = await getJntuSubjects(
            decodeURIComponent(params.course),
            decodeURIComponent(params.semester)
        );
        return { subjects };
    })

    // Get JNTU files by course, semester and subject
    .get("/api/jntu/courses/:course/semesters/:semester/subjects/:subject/files", async ({ params }) => {
        const files = await JntuModel.find({
            course: decodeURIComponent(params.course),
            semester: decodeURIComponent(params.semester),
            subject: decodeURIComponent(params.subject)
        })
            .select("fileName course semester subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializeJntuSummary) };
    });
