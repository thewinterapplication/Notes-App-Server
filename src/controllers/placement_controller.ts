import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { PlacementModel } from "../models/Placement";
import { getPlacementMappingForCourse } from "../services/mapping_service";
import { buildPlacementDownloadUrl } from "../utils/download_urls";

function serializePlacementSummary(document: any) {
    const id = document._id.toString();

    return {
        id,
        fileName: document.fileName,
        course: document.course || "uncategorized",
        subject: document.subject || "uncategorized",
        author: document.author || "Unknown author",
        fileUrl: document.fileUrl,
        downloadUrl: buildPlacementDownloadUrl(id),
        accessType: document.accessType || "free",
        likesCount: document.likesCount || 0,
        viewCount: document.viewCount || 0,
        pageCount: document.pageCount || 0,
        createdAt: document.createdAt
    };
}

export const placementController = new Elysia()
    .decorate('fileService', new FileStorageService())

    // Get distinct subjects for a course (Placements)
    .get("/api/placements/courses/:course/subjects", async ({ params }) => {
        const mapping = await getPlacementMappingForCourse(params.course);
        return { subjects: mapping.subjects };
    })

    // Get placement files by course and subject
    .get("/api/placements/courses/:course/subjects/:subject/files", async ({ params }) => {
        const files = await PlacementModel.find({
            course: params.course,
            subject: params.subject
        })
            .select("fileName course subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializePlacementSummary) };
    })

    // Get placement files by subject (legacy)
    .get("/api/placements/files/subject/:subject", async ({ params }) => {
        const files = await PlacementModel.find({ course: params.subject })
            .select("fileName course subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializePlacementSummary) };
    });
