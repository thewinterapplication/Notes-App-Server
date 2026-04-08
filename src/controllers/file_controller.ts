import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { FileModel } from "../models/File";
import { JobModel } from "../models/Job";
import { UpskillModel } from "../models/Upskill";
import { UserModel } from "../models/User";
import { hasSubscriptionEntitlement } from "../utils/subscription_access";
import { config } from "../config";

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
    .get("/files/:name", async ({ params, query, headers, set, fileService }) => {
        try {
            const storageKey = decodeURIComponent(params.name);
            const encodedKey = encodeURIComponent(storageKey);
            const suffixPattern = new RegExp(encodedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');

            const [file, job, upskill] = await Promise.all([
                FileModel.findOne({ fileUrl: suffixPattern }).select("accessType").lean(),
                JobModel.findOne({ imageUrl: suffixPattern }).select("_id").lean(),
                UpskillModel.findOne({ imageUrl: suffixPattern }).select("_id").lean(),
            ]);

            // Job and upskill images are always public
            if (job || upskill) {
                const stream = await fileService.getFileStream(storageKey);
                const ext = storageKey.split('.').pop()?.toLowerCase() || '';
                const contentTypes: Record<string, string> = {
                    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
                };
                set.headers["Content-Type"] = contentTypes[ext] || "application/octet-stream";
                return stream;
            }

            const isFreeFile = file?.accessType === "free";

            const phoneHeader = headers["x-user-phone"];
            const phone =
                typeof phoneHeader === "string" && phoneHeader.trim().length > 0
                    ? phoneHeader.trim()
                    : typeof query.phone === "string" && query.phone.trim().length > 0
                        ? query.phone.trim()
                        : "";

            if (!isFreeFile && !phone) {
                set.status = 401;
                return {
                    success: false,
                    message: "Login is required to open this premium PDF."
                };
            }

            if (!isFreeFile) {
                const user = await UserModel.findOne({ phone });

                if (!user) {
                    set.status = 401;
                    return {
                        success: false,
                        message: "User not found. Please log in again."
                    };
                }

                if (!hasSubscriptionEntitlement(user.subscription)) {
                    set.status = 403;
                    return {
                        success: false,
                        message: "An active subscription is required to open this premium PDF."
                    };
                }
            }

            const stream = await fileService.getFileStream(storageKey);
            set.headers["Content-Type"] = "application/pdf";
            return stream;
        } catch (error: any) {
            set.status = 404;
            return { error: "File not found" };
        }
    });
