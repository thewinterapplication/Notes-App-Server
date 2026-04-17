import { Elysia } from "elysia";
import { Types } from "mongoose";
import { FileStorageService } from "../services/file_storage";
import { FileModel } from "../models/File";
import { JobModel } from "../models/Job";
import { PlacementModel } from "../models/Placement";
import { PyqModel } from "../models/Pyq";
import { UpskillModel } from "../models/Upskill";
import { UserModel } from "../models/User";
import { hasSubscriptionEntitlement } from "../utils/subscription_access";
import { buildDocumentDownloadUrl } from "../utils/download_urls";

type ParsedRange = {
    start: number;
    end: number;
    length: number;
};

type StreamContext = {
    route: string;
    documentId?: string;
};

function formatLogDetails(details: Record<string, unknown>) {
    return Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ");
}

function logFileStream(message: string, details: Record<string, unknown>) {
    const suffix = formatLogDetails(details);
    console.log(`[file-stream] ${message}${suffix ? ` ${suffix}` : ""}`);
}

function getContentType(storageKey: string, metadata?: Record<string, unknown>) {
    const metadataContentType = metadata?.["content-type"];

    if (typeof metadataContentType === "string" && metadataContentType.trim().length > 0) {
        return metadataContentType;
    }

    const ext = storageKey.split(".").pop()?.toLowerCase() || "";
    const contentTypes: Record<string, string> = {
        gif: "image/gif",
        jpeg: "image/jpeg",
        jpg: "image/jpeg",
        pdf: "application/pdf",
        png: "image/png",
        svg: "image/svg+xml",
        webp: "image/webp",
    };

    return contentTypes[ext] || "application/octet-stream";
}

function parseRangeHeader(rangeHeader: string, fileSize: number): ParsedRange | null {
    if (!rangeHeader.startsWith("bytes=") || fileSize <= 0) {
        return null;
    }

    const [rawRange, ...extraRanges] = rangeHeader.slice(6).split(",");

    if (!rawRange || extraRanges.length > 0) {
        return null;
    }

    const [rawStart, rawEnd] = rawRange.trim().split("-");

    if (!rawStart && !rawEnd) {
        return null;
    }

    let start: number;
    let end: number;

    if (!rawStart) {
        const suffixLength = Number(rawEnd);

        if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
            return null;
        }

        start = Math.max(fileSize - suffixLength, 0);
        end = fileSize - 1;
    } else {
        start = Number(rawStart);

        if (!Number.isInteger(start) || start < 0 || start >= fileSize) {
            return null;
        }

        if (!rawEnd) {
            end = fileSize - 1;
        } else {
            end = Number(rawEnd);

            if (!Number.isInteger(end) || end < start) {
                return null;
            }

            end = Math.min(end, fileSize - 1);
        }
    }

    return {
        start,
        end,
        length: end - start + 1,
    };
}

function serializeDocumentSummary(document: any) {
    const id = document._id.toString();

    return {
        id,
        fileName: document.fileName,
        course: document.course || "uncategorized",
        subject: document.subject || "uncategorized",
        author: document.author || "Unknown author",
        fileUrl: document.fileUrl,
        downloadUrl: buildDocumentDownloadUrl(id),
        accessType: document.accessType || "free",
        likesCount: document.likesCount || 0,
        viewCount: document.viewCount || 0,
        pageCount: document.pageCount || 0,
        createdAt: document.createdAt
    };
}

function resolvePhone(headers: Record<string, unknown>, query: Record<string, unknown>) {
    const phoneHeader = headers["x-user-phone"];
    const queryPhone = query.phone;

    if (typeof phoneHeader === "string" && phoneHeader.trim().length > 0) {
        return phoneHeader.trim();
    }

    if (typeof queryPhone === "string" && queryPhone.trim().length > 0) {
        return queryPhone.trim();
    }

    return "";
}

async function getAccessError(
    isFreeFile: boolean,
    headers: Record<string, unknown>,
    query: Record<string, unknown>,
    set: any
) {
    if (isFreeFile) {
        return null;
    }

    const phone = resolvePhone(headers, query);

    if (!phone) {
        set.status = 401;
        return {
            success: false,
            message: "Login is required to open this premium PDF."
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
            message: "An active subscription is required to open this premium PDF."
        };
    }

    return null;
}

async function streamStoredFile(
    storageKey: string,
    headers: Record<string, unknown>,
    set: any,
    fileService: FileStorageService,
    context: StreamContext
) {
    const rangeHeader =
        typeof headers.range === "string" && headers.range.trim().length > 0
            ? headers.range.trim()
            : null;
    const metadataStartedAt = Date.now();

    logFileStream("metadata-fetch-start", {
        route: context.route,
        documentId: context.documentId,
        storageKey,
        requestedRange: rangeHeader || "none",
    });

    let objectMetadata;
    try {
        objectMetadata = await fileService.getFileMetadata(storageKey);
    } catch (error) {
        console.error(`[file-stream] metadata-fetch-failed route=${JSON.stringify(context.route)} documentId=${JSON.stringify(context.documentId)} storageKey=${JSON.stringify(storageKey)} durationMs=${Date.now() - metadataStartedAt}`, error);
        throw error;
    }

    const contentType = getContentType(storageKey, objectMetadata.metaData);
    logFileStream("metadata-fetch-complete", {
        route: context.route,
        documentId: context.documentId,
        storageKey,
        bytes: objectMetadata.size,
        contentType,
        etag: objectMetadata.etag,
        durationMs: Date.now() - metadataStartedAt,
    });

    set.headers["Accept-Ranges"] = "bytes";
    set.headers["Content-Type"] = contentType;
    set.headers["Content-Length"] = String(objectMetadata.size);
    set.headers["X-File-Size"] = String(objectMetadata.size);
    set.headers["ETag"] = `"${objectMetadata.etag}"`;
    set.headers["Last-Modified"] = objectMetadata.lastModified.toUTCString();

    if (rangeHeader) {
        const parsedRange = parseRangeHeader(rangeHeader, objectMetadata.size);

        if (!parsedRange) {
            set.status = 416;
            set.headers["Content-Range"] = `bytes */${objectMetadata.size}`;
            logFileStream("range-invalid", {
                route: context.route,
                documentId: context.documentId,
                storageKey,
                requestedRange: rangeHeader,
                totalBytes: objectMetadata.size,
            });
            return { error: "Requested range not satisfiable" };
        }

        logFileStream("partial-fetch-start", {
            route: context.route,
            documentId: context.documentId,
            storageKey,
            start: parsedRange.start,
            end: parsedRange.end,
            bytes: parsedRange.length,
            totalBytes: objectMetadata.size,
        });

        let stream;
        const partialStartedAt = Date.now();
        try {
            stream = await fileService.getFilePartialStream(
                storageKey,
                parsedRange.start,
                parsedRange.length
            );
        } catch (error) {
            console.error(`[file-stream] partial-fetch-failed route=${JSON.stringify(context.route)} documentId=${JSON.stringify(context.documentId)} storageKey=${JSON.stringify(storageKey)} start=${parsedRange.start} bytes=${parsedRange.length} durationMs=${Date.now() - partialStartedAt}`, error);
            throw error;
        }

        set.status = 206;
        set.headers["Content-Length"] = String(parsedRange.length);
        set.headers["Content-Range"] = `bytes ${parsedRange.start}-${parsedRange.end}/${objectMetadata.size}`;
        logFileStream("partial-fetch-ready", {
            route: context.route,
            documentId: context.documentId,
            storageKey,
            status: 206,
            start: parsedRange.start,
            end: parsedRange.end,
            bytes: parsedRange.length,
            totalBytes: objectMetadata.size,
            durationMs: Date.now() - partialStartedAt,
        });
        return stream;
    }

    logFileStream("full-fetch-start", {
        route: context.route,
        documentId: context.documentId,
        storageKey,
        bytes: objectMetadata.size,
    });

    const fullStartedAt = Date.now();
    try {
        const stream = await fileService.getFileStream(storageKey);
        logFileStream("full-fetch-ready", {
            route: context.route,
            documentId: context.documentId,
            storageKey,
            status: 200,
            bytes: objectMetadata.size,
            durationMs: Date.now() - fullStartedAt,
        });
        return stream;
    } catch (error) {
        console.error(`[file-stream] full-fetch-failed route=${JSON.stringify(context.route)} documentId=${JSON.stringify(context.documentId)} storageKey=${JSON.stringify(storageKey)} durationMs=${Date.now() - fullStartedAt}`, error);
        throw error;
    }
}

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
        })
            .select("fileName course subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializeDocumentSummary) };
    })

    // Get files by subject (legacy - for backward compatibility)
    .get("/api/files/subject/:subject", async ({ params }) => {
        const files = await FileModel.find({ course: params.subject })
            .select("fileName course subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { files: files.map(serializeDocumentSummary) };
    })

    .get("/api/documents/:id/file", async ({ params, query, headers, set, fileService }) => {
        logFileStream("request-received", {
            route: "documents",
            documentId: params.id,
            requestedRange: typeof headers.range === "string" ? headers.range : "none",
        });

        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            logFileStream("request-rejected", {
                route: "documents",
                documentId: params.id,
                status: 400,
                reason: "invalid-document-id",
            });
            return { error: "Invalid document id" };
        }

        const document = await FileModel.findById(params.id)
            .select("fileUrl accessType")
            .lean();

        if (!document) {
            set.status = 404;
            logFileStream("request-rejected", {
                route: "documents",
                documentId: params.id,
                status: 404,
                reason: "document-not-found",
            });
            return { error: "Document not found" };
        }

        const accessError = await getAccessError(
            (document.accessType || "free") === "free",
            headers as Record<string, unknown>,
            query as Record<string, unknown>,
            set
        );

        if (accessError) {
            logFileStream("request-rejected", {
                route: "documents",
                documentId: params.id,
                status: set.status,
                reason: "access-denied",
            });
            return accessError;
        }

        const storageKey = fileService.getStorageKeyFromUrl(document.fileUrl);

        if (!storageKey) {
            set.status = 404;
            logFileStream("request-rejected", {
                route: "documents",
                documentId: params.id,
                status: 404,
                reason: "storage-key-missing",
            });
            return { error: "File not found" };
        }

        return await streamStoredFile(storageKey, headers as Record<string, unknown>, set, fileService, {
            route: "documents",
            documentId: params.id,
        });
    })

    .get("/api/placements/documents/:id/file", async ({ params, query, headers, set, fileService }) => {
        logFileStream("request-received", {
            route: "placements",
            documentId: params.id,
            requestedRange: typeof headers.range === "string" ? headers.range : "none",
        });

        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            logFileStream("request-rejected", {
                route: "placements",
                documentId: params.id,
                status: 400,
                reason: "invalid-document-id",
            });
            return { error: "Invalid document id" };
        }

        const document = await PlacementModel.findById(params.id)
            .select("fileUrl accessType")
            .lean();

        if (!document) {
            set.status = 404;
            logFileStream("request-rejected", {
                route: "placements",
                documentId: params.id,
                status: 404,
                reason: "document-not-found",
            });
            return { error: "Document not found" };
        }

        const accessError = await getAccessError(
            (document.accessType || "free") === "free",
            headers as Record<string, unknown>,
            query as Record<string, unknown>,
            set
        );

        if (accessError) {
            logFileStream("request-rejected", {
                route: "placements",
                documentId: params.id,
                status: set.status,
                reason: "access-denied",
            });
            return accessError;
        }

        const storageKey = fileService.getStorageKeyFromUrl(document.fileUrl);

        if (!storageKey) {
            set.status = 404;
            logFileStream("request-rejected", {
                route: "placements",
                documentId: params.id,
                status: 404,
                reason: "storage-key-missing",
            });
            return { error: "File not found" };
        }

        return await streamStoredFile(storageKey, headers as Record<string, unknown>, set, fileService, {
            route: "placements",
            documentId: params.id,
        });
    })

    .get("/api/pyq/documents/:id/file", async ({ params, headers, set, fileService }) => {
        logFileStream("request-received", {
            route: "pyq",
            documentId: params.id,
            requestedRange: typeof headers.range === "string" ? headers.range : "none",
        });

        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            logFileStream("request-rejected", {
                route: "pyq",
                documentId: params.id,
                status: 400,
                reason: "invalid-document-id",
            });
            return { error: "Invalid document id" };
        }

        const document = await PyqModel.findById(params.id)
            .select("fileUrl")
            .lean();

        if (!document) {
            set.status = 404;
            logFileStream("request-rejected", {
                route: "pyq",
                documentId: params.id,
                status: 404,
                reason: "document-not-found",
            });
            return { error: "Document not found" };
        }

        const storageKey = fileService.getStorageKeyFromUrl(document.fileUrl);

        if (!storageKey) {
            set.status = 404;
            logFileStream("request-rejected", {
                route: "pyq",
                documentId: params.id,
                status: 404,
                reason: "storage-key-missing",
            });
            return { error: "File not found" };
        }

        return await streamStoredFile(storageKey, headers as Record<string, unknown>, set, fileService, {
            route: "pyq",
            documentId: params.id,
        });
    })

    .get("/api/documents/:id/page/:pageNum", async ({ params, query, headers, set, fileService }) => {
        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            return { error: "Invalid document id" };
        }

        const pageNum = Number(params.pageNum);
        if (!Number.isInteger(pageNum) || pageNum < 1) {
            set.status = 400;
            return { error: "Invalid page number" };
        }

        const document = await FileModel.findById(params.id)
            .select("fileUrl accessType pageCount")
            .lean();

        if (!document) { set.status = 404; return { error: "Document not found" }; }
        if (pageNum > (document.pageCount || 0)) { set.status = 404; return { error: "Page not found" }; }

        const accessError = await getAccessError(
            (document.accessType || "free") === "free",
            headers as Record<string, unknown>,
            query as Record<string, unknown>,
            set
        );
        if (accessError) return accessError;

        const baseKey = fileService.getStorageKeyFromUrl(document.fileUrl);
        if (!baseKey) { set.status = 404; return { error: "File not found" }; }

        return await streamStoredFile(`${baseKey}_page_${pageNum}.pdf`, headers as Record<string, unknown>, set, fileService, {
            route: "documents-page",
            documentId: params.id,
        });
    })

    .get("/api/placements/documents/:id/page/:pageNum", async ({ params, query, headers, set, fileService }) => {
        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            return { error: "Invalid document id" };
        }

        const pageNum = Number(params.pageNum);
        if (!Number.isInteger(pageNum) || pageNum < 1) {
            set.status = 400;
            return { error: "Invalid page number" };
        }

        const document = await PlacementModel.findById(params.id)
            .select("fileUrl accessType pageCount")
            .lean();

        if (!document) { set.status = 404; return { error: "Document not found" }; }
        if (pageNum > (document.pageCount || 0)) { set.status = 404; return { error: "Page not found" }; }

        const accessError = await getAccessError(
            (document.accessType || "free") === "free",
            headers as Record<string, unknown>,
            query as Record<string, unknown>,
            set
        );
        if (accessError) return accessError;

        const baseKey = fileService.getStorageKeyFromUrl(document.fileUrl);
        if (!baseKey) { set.status = 404; return { error: "File not found" }; }

        return await streamStoredFile(`${baseKey}_page_${pageNum}.pdf`, headers as Record<string, unknown>, set, fileService, {
            route: "placements-page",
            documentId: params.id,
        });
    })

    .get("/api/pyq/documents/:id/page/:pageNum", async ({ params, headers, set, fileService }) => {
        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            return { error: "Invalid document id" };
        }

        const pageNum = Number(params.pageNum);
        if (!Number.isInteger(pageNum) || pageNum < 1) {
            set.status = 400;
            return { error: "Invalid page number" };
        }

        const document = await PyqModel.findById(params.id)
            .select("fileUrl pageCount")
            .lean();

        if (!document) { set.status = 404; return { error: "Document not found" }; }
        if (pageNum > (document.pageCount || 0)) { set.status = 404; return { error: "Page not found" }; }

        const baseKey = fileService.getStorageKeyFromUrl(document.fileUrl);
        if (!baseKey) { set.status = 404; return { error: "File not found" }; }

        return await streamStoredFile(`${baseKey}_page_${pageNum}.pdf`, headers as Record<string, unknown>, set, fileService, {
            route: "pyq-page",
            documentId: params.id,
        });
    })

    // Reprocess existing document into per-page PDFs (admin, no auth required)
    .post("/api/admin/documents/:id/process-pages", async ({ params, set, fileService }) => {
        if (!Types.ObjectId.isValid(params.id)) { set.status = 400; return { error: "Invalid id" }; }
        try {
            const pageCount = await fileService.reprocessPages("document", params.id);
            return { success: true, pageCount };
        } catch (error: any) {
            set.status = 500;
            return { error: error.message };
        }
    })

    .post("/api/admin/placements/:id/process-pages", async ({ params, set, fileService }) => {
        if (!Types.ObjectId.isValid(params.id)) { set.status = 400; return { error: "Invalid id" }; }
        try {
            const pageCount = await fileService.reprocessPages("placement", params.id);
            return { success: true, pageCount };
        } catch (error: any) {
            set.status = 500;
            return { error: error.message };
        }
    })

    .post("/api/admin/pyq/:id/process-pages", async ({ params, set, fileService }) => {
        if (!Types.ObjectId.isValid(params.id)) { set.status = 400; return { error: "Invalid id" }; }
        try {
            const pageCount = await fileService.reprocessPages("pyq", params.id);
            return { success: true, pageCount };
        } catch (error: any) {
            set.status = 500;
            return { error: error.message };
        }
    })

    // Stream file from MinIO
    .get("/files/:name", async ({ params, query, headers, set, fileService }) => {
        let storageKey = "";
        try {
            storageKey = decodeURIComponent(params.name);
            logFileStream("request-received", {
                route: "legacy-files",
                storageKey,
                requestedRange: typeof headers.range === "string" ? headers.range : "none",
            });
            const encodedKey = encodeURIComponent(storageKey);
            const suffixPattern = new RegExp(encodedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');

            const [file, placement, pyq, job, upskill] = await Promise.all([
                FileModel.findOne({ fileUrl: suffixPattern }).select("accessType").lean(),
                PlacementModel.findOne({ fileUrl: suffixPattern }).select("accessType").lean(),
                PyqModel.findOne({ fileUrl: suffixPattern }).select("_id").lean(),
                JobModel.findOne({ imageUrl: suffixPattern }).select("_id").lean(),
                UpskillModel.findOne({ imageUrl: suffixPattern }).select("_id").lean(),
            ]);

            if (!file && !placement && !pyq && !job && !upskill) {
                set.status = 404;
                logFileStream("request-rejected", {
                    route: "legacy-files",
                    storageKey,
                    status: 404,
                    reason: "metadata-not-found",
                });
                return { error: "File not found" };
            }

            const resolvedAccessType = file
                ? (file.accessType || "free")
                : placement
                    ? (placement.accessType || "free")
                    : null;
            const isFreeFile = Boolean(pyq || job || upskill || resolvedAccessType === "free");

            const accessError = await getAccessError(
                isFreeFile,
                headers as Record<string, unknown>,
                query as Record<string, unknown>,
                set
            );

            if (accessError) {
                logFileStream("request-rejected", {
                    route: "legacy-files",
                    storageKey,
                    status: set.status,
                    reason: "access-denied",
                });
                return accessError;
            }

            return await streamStoredFile(storageKey, headers as Record<string, unknown>, set, fileService, {
                route: "legacy-files",
            });
        } catch (error: any) {
            set.status = 404;
            console.error(`[file-stream] request-failed route="legacy-files" storageKey=${JSON.stringify(storageKey)} status=404`, error);
            return { error: "File not found" };
        }
    });
