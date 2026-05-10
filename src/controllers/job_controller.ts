import { Elysia, t } from "elysia";
import { Types } from "mongoose";
import { JobModel } from "../models/Job";
import { FileStorageService } from "../services/file_storage";
import { requireAdminAuth } from "../utils/admin_auth";

function serializeJob(job: {
    _id: { toString(): string };
    jobName: string;
    jobUrl: string;
    description: string;
    imageUrl: string;
    createdAt: Date;
}) {
    return {
        id: job._id.toString(),
        jobName: job.jobName,
        jobUrl: job.jobUrl,
        description: job.description,
        imageUrl: job.imageUrl,
        createdAt: job.createdAt
    };
}

export const jobController = new Elysia()
    .decorate("storage", new FileStorageService())
    .get("/upload/jobs", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("jobs.html");
    })
    .get("/jobs", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("jobs-list.html");
    })
    .get("/api/jobs", async () => {
        const jobs = await JobModel.find().sort({ createdAt: -1 });
        return { jobs: jobs.map(serializeJob) };
    })
    .delete("/api/jobs/:id", async ({ params, set, storage }) => {
        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            return { error: "Invalid job id" };
        }

        const job = await JobModel.findById(params.id);

        if (!job) {
            set.status = 404;
            return { error: "Job not found" };
        }

        let storageDeleted = true;

        try {
            storageDeleted = await storage.deleteFileByUrl(job.imageUrl);
        } catch (error) {
            storageDeleted = false;
            console.error(`Failed to delete stored image for job ${job._id}:`, error);
        }

        await job.deleteOne();

        return {
            success: true,
            storageDeleted
        };
    })
    .post("/upload/jobs", async ({ body, storage, set }) => {
        const jobName = body.jobName.trim();
        const jobUrl = body.jobUrl.trim();
        const description = body.description.trim();

        if (!jobName || !jobUrl || !description || !body.image) {
            set.status = 400;
            return { error: "Job name, URL, description, and image are required" };
        }

        const image = body.image;
        const looksLikeImage =
            image.type.startsWith("image/") ||
            /\.(png|jpe?g|webp|gif|svg)$/i.test(image.name);

        if (!looksLikeImage) {
            set.status = 400;
            return { error: "Please upload a valid image file" };
        }

        try {
            new URL(jobUrl);
        } catch {
            set.status = 400;
            return { error: "Please enter a valid job URL" };
        }

        try {
            return await storage.saveJobPosting(image, { jobName, jobUrl, description });
        } catch (error: any) {
            set.status = 500;
            return { error: error.message || "Failed to create job" };
        }
    }, {
        body: t.Object({
            jobName: t.String({ minLength: 1 }),
            jobUrl: t.String({ minLength: 1 }),
            description: t.String({ minLength: 1 }),
            image: t.File()
        })
    });
