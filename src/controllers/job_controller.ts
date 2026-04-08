import { Elysia, t } from "elysia";
import { JobModel } from "../models/Job";
import { FileStorageService } from "../services/file_storage";

function serializeJob(job: {
    _id: { toString(): string };
    jobName: string;
    jobUrl: string;
    imageUrl: string;
    createdAt: Date;
}) {
    return {
        id: job._id.toString(),
        jobName: job.jobName,
        jobUrl: job.jobUrl,
        imageUrl: job.imageUrl,
        createdAt: job.createdAt
    };
}

export const jobController = new Elysia()
    .decorate("storage", new FileStorageService())
    .get("/upload/jobs", () => Bun.file("jobs.html"))
    .get("/jobs", () => Bun.file("jobs-list.html"))
    .get("/api/jobs", async () => {
        const jobs = await JobModel.find().sort({ createdAt: -1 });
        return { jobs: jobs.map(serializeJob) };
    })
    .post("/upload/jobs", async ({ body, storage, set }) => {
        const jobName = body.jobName.trim();
        const jobUrl = body.jobUrl.trim();

        if (!jobName || !jobUrl || !body.image) {
            set.status = 400;
            return { error: "Job name, URL, and image are required" };
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
            return await storage.saveJobPosting(image, { jobName, jobUrl });
        } catch (error: any) {
            set.status = 500;
            return { error: error.message || "Failed to create job" };
        }
    }, {
        body: t.Object({
            jobName: t.String({ minLength: 1 }),
            jobUrl: t.String({ minLength: 1 }),
            image: t.File()
        })
    });
