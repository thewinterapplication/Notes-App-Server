import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { PlacementModel } from "../models/Placement";

export const placementController = new Elysia()
    .decorate('fileService', new FileStorageService())

    // Get distinct subjects for a course (Placements)
    .get("/api/placements/courses/:course/subjects", async ({ params }) => {
        const subjects = await PlacementModel.distinct("subject", { course: params.course });
        return { subjects: subjects.filter(s => s && s !== "uncategorized") };
    })

    // Get placement files by course and subject
    .get("/api/placements/courses/:course/subjects/:subject/files", async ({ params }) => {
        const files = await PlacementModel.find({
            course: params.course,
            subject: params.subject
        }).sort({ createdAt: -1 });
        return { files };
    })

    // Get placement files by subject (legacy)
    .get("/api/placements/files/subject/:subject", async ({ params }) => {
        const files = await PlacementModel.find({ course: params.subject }).sort({ createdAt: -1 });
        return { files };
    });
