import { Elysia } from "elysia";
import { FileStorageService } from "../services/file_storage";
import { FileModel } from "../models/File";
import { UserModel } from "../models/User";
import { hasSubscriptionEntitlement } from "../utils/subscription_access";

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
            const phoneHeader = headers["x-user-phone"];
            const phone =
                typeof phoneHeader === "string" && phoneHeader.trim().length > 0
                    ? phoneHeader.trim()
                    : typeof query.phone === "string" && query.phone.trim().length > 0
                        ? query.phone.trim()
                        : "";

            if (!phone) {
                set.status = 401;
                return {
                    success: false,
                    message: "Login and an active subscription are required to open this PDF."
                };
            }

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
                    message: "An active subscription is required to open this PDF."
                };
            }

            const fileName = params.name;
            const stream = await fileService.getFileStream(fileName);
            set.headers["Content-Type"] = "application/pdf";
            return stream;
        } catch (error: any) {
            set.status = 404;
            return { error: "File not found" };
        }
    });
