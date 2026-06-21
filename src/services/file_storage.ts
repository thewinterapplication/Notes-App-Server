import { Client } from "minio";
import { config } from "../config";
import { FileModel } from "../models/File";
import { JobModel } from "../models/Job";
import { PyqModel } from "../models/Pyq";
import { PlacementModel } from "../models/Placement";
import { JntuModel } from "../models/Jntu";
import { UpskillModel } from "../models/Upskill";
import { buildDocumentDownloadUrl, buildPlacementDownloadUrl, buildPyqDownloadUrl, buildJntuDownloadUrl } from "../utils/download_urls";
import { linearizePdf, splitIntoPages } from "../utils/pdf_linearizer";

const minioClient = new Client({
    endPoint: config.minio.endPoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey
});

type UploadKind = "document" | "pyq" | "placement" | "jntu" | "job" | "upskill" | "resume";

function formatLogDetails(details: Record<string, unknown>) {
    return Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ");
}

function logUpload(message: string, details: Record<string, unknown>) {
    const suffix = formatLogDetails(details);
    console.log(`[file-upload] ${message}${suffix ? ` ${suffix}` : ""}`);
}

async function prepareUploadBuffer(file: File, kind: UploadKind, storageKey: string) {
    const readStartedAt = Date.now();
    logUpload("read-bytes-start", {
        kind,
        storageKey,
        originalName: file.name,
        declaredBytes: file.size,
        contentType: file.type || "unknown",
    });

    let buffer: Buffer;
    try {
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        logUpload("read-bytes-complete", {
            kind,
            storageKey,
            bytes: buffer.length,
            durationMs: Date.now() - readStartedAt,
        });
    } catch (error) {
        console.error(`[file-upload] read-bytes-failed kind=${kind} storageKey=${JSON.stringify(storageKey)} durationMs=${Date.now() - readStartedAt}`, error);
        throw error;
    }

    if (file.type === "application/pdf") {
        const inputBytes = buffer.length;
        const linearizeStartedAt = Date.now();
        logUpload("pdf-linearize-start", {
            kind,
            storageKey,
            inputBytes,
        });

        try {
            buffer = await linearizePdf(buffer);
            logUpload("pdf-linearize-complete", {
                kind,
                storageKey,
                inputBytes,
                outputBytes: buffer.length,
                durationMs: Date.now() - linearizeStartedAt,
            });
        } catch (error) {
            console.error(`[file-upload] pdf-linearize-failed kind=${kind} storageKey=${JSON.stringify(storageKey)} inputBytes=${inputBytes} durationMs=${Date.now() - linearizeStartedAt}`, error);
            throw error;
        }
    }

    return buffer;
}

async function uploadBufferToMinio(kind: UploadKind, storageKey: string, buffer: Buffer, contentType: string) {
    const startedAt = Date.now();
    logUpload("minio-put-start", {
        kind,
        bucket: config.minio.bucket,
        storageKey,
        bytes: buffer.length,
        contentType: contentType || "unknown",
    });

    try {
        await minioClient.putObject(
            config.minio.bucket,
            storageKey,
            buffer,
            buffer.length,
            { 'Content-Type': contentType }
        );
        logUpload("minio-put-complete", {
            kind,
            bucket: config.minio.bucket,
            storageKey,
            bytes: buffer.length,
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        console.error(`[file-upload] minio-put-failed kind=${kind} bucket=${JSON.stringify(config.minio.bucket)} storageKey=${JSON.stringify(storageKey)} bytes=${buffer.length} durationMs=${Date.now() - startedAt}`, error);
        throw error;
    }
}

async function splitAndUploadPages(buffer: Buffer, uniqueFileName: string, kind: UploadKind): Promise<number> {
    const startedAt = Date.now();
    try {
        const pages = await splitIntoPages(buffer);
        for (let i = 0; i < pages.length; i++) {
            await uploadBufferToMinio(kind, `${uniqueFileName}_page_${i + 1}.pdf`, pages[i], "application/pdf");
        }
        logUpload("pdf-split-complete", { kind, storageKey: uniqueFileName, pages: pages.length, durationMs: Date.now() - startedAt });
        return pages.length;
    } catch (error) {
        console.error(`[file-upload] pdf-split-failed kind=${kind} storageKey=${JSON.stringify(uniqueFileName)} durationMs=${Date.now() - startedAt}`, error);
        return 0;
    }
}

export class FileStorageService {
    async saveFile(file: File, options?: { course?: string, subject?: string, customFileName?: string, author?: string, accessType?: string }) {
        // Use custom name if provided, otherwise preserve original name but sanitizing it
        let finalFileName = file.name;
        const normalizedAuthor =
            options?.author?.trim().length
                ? options.author.trim()
                : "Unknown author";

        if (options?.customFileName) {
            const extension = file.name.split('.').pop();
            if (options.customFileName.endsWith(`.${extension}`)) {
                finalFileName = options.customFileName;
            } else {
                finalFileName = `${options.customFileName}.${extension}`;
            }
        }

        const uniqueFileName = `${Date.now()}_${finalFileName}`;

        const buffer = await prepareUploadBuffer(file, "document", uniqueFileName);
        await uploadBufferToMinio("document", uniqueFileName, buffer, file.type);
        const pageCount = file.type === "application/pdf"
            ? await splitAndUploadPages(buffer, uniqueFileName, "document")
            : 0;

        // Use backend URL to stream files (not direct MinIO URL)
        const fileUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        // Save metadata to MongoDB
        const fileDoc = await FileModel.create({
            fileName: finalFileName,
            course: options?.course || "uncategorized",
            subject: options?.subject || "uncategorized",
            author: normalizedAuthor,
            fileUrl: fileUrl,
            accessType: options?.accessType || "free",
            likesCount: 0,
            viewCount: 0,
            pageCount
        });
        const id = fileDoc._id.toString();
        const downloadUrl = buildDocumentDownloadUrl(id);
        logUpload("metadata-saved", {
            kind: "document",
            id,
            storageKey: uniqueFileName,
            bytes: buffer.length,
            downloadUrl,
        });

        return {
            url: fileUrl,
            downloadUrl,
            fileName: uniqueFileName,
            id
        };
    }

    async savePyqFile(file: File, options?: { course?: string, subject?: string, customFileName?: string }) {
        let finalFileName = file.name;

        if (options?.customFileName) {
            const extension = file.name.split('.').pop();
            if (options.customFileName.endsWith(`.${extension}`)) {
                finalFileName = options.customFileName;
            } else {
                finalFileName = `${options.customFileName}.${extension}`;
            }
        }

        const uniqueFileName = `${Date.now()}_${finalFileName}`;

        const buffer = await prepareUploadBuffer(file, "pyq", uniqueFileName);
        await uploadBufferToMinio("pyq", uniqueFileName, buffer, file.type);
        const pageCount = file.type === "application/pdf"
            ? await splitAndUploadPages(buffer, uniqueFileName, "pyq")
            : 0;

        const fileUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        const pyqDoc = await PyqModel.create({
            fileName: finalFileName,
            course: options?.course || "uncategorized",
            subject: options?.subject || "uncategorized",
            fileUrl: fileUrl,
            likesCount: 0,
            viewCount: 0,
            pageCount
        });
        const id = pyqDoc._id.toString();
        const downloadUrl = buildPyqDownloadUrl(id);
        logUpload("metadata-saved", {
            kind: "pyq",
            id,
            storageKey: uniqueFileName,
            bytes: buffer.length,
            downloadUrl,
        });

        return {
            url: fileUrl,
            downloadUrl,
            fileName: uniqueFileName,
            id
        };
    }

    async savePlacementFile(file: File, options?: { course?: string, subject?: string, customFileName?: string, author?: string, accessType?: string }) {
        let finalFileName = file.name;
        const normalizedAuthor =
            options?.author?.trim().length
                ? options.author.trim()
                : "Unknown author";

        if (options?.customFileName) {
            const extension = file.name.split('.').pop();
            if (options.customFileName.endsWith(`.${extension}`)) {
                finalFileName = options.customFileName;
            } else {
                finalFileName = `${options.customFileName}.${extension}`;
            }
        }

        const uniqueFileName = `${Date.now()}_${finalFileName}`;

        const buffer = await prepareUploadBuffer(file, "placement", uniqueFileName);
        await uploadBufferToMinio("placement", uniqueFileName, buffer, file.type);
        const pageCount = file.type === "application/pdf"
            ? await splitAndUploadPages(buffer, uniqueFileName, "placement")
            : 0;

        const fileUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        const placementDoc = await PlacementModel.create({
            fileName: finalFileName,
            course: options?.course || "uncategorized",
            subject: options?.subject || "uncategorized",
            author: normalizedAuthor,
            fileUrl: fileUrl,
            accessType: options?.accessType || "free",
            likesCount: 0,
            viewCount: 0,
            pageCount
        });
        const id = placementDoc._id.toString();
        const downloadUrl = buildPlacementDownloadUrl(id);
        logUpload("metadata-saved", {
            kind: "placement",
            id,
            storageKey: uniqueFileName,
            bytes: buffer.length,
            downloadUrl,
        });

        return {
            url: fileUrl,
            downloadUrl,
            fileName: uniqueFileName,
            id
        };
    }

    async saveJntuFile(file: File, options?: { course?: string, subject?: string, customFileName?: string, author?: string, accessType?: string }) {
        let finalFileName = file.name;
        const normalizedAuthor =
            options?.author?.trim().length
                ? options.author.trim()
                : "Unknown author";

        if (options?.customFileName) {
            const extension = file.name.split('.').pop();
            if (options.customFileName.endsWith(`.${extension}`)) {
                finalFileName = options.customFileName;
            } else {
                finalFileName = `${options.customFileName}.${extension}`;
            }
        }

        const uniqueFileName = `${Date.now()}_${finalFileName}`;

        const buffer = await prepareUploadBuffer(file, "jntu", uniqueFileName);
        await uploadBufferToMinio("jntu", uniqueFileName, buffer, file.type);
        const pageCount = file.type === "application/pdf"
            ? await splitAndUploadPages(buffer, uniqueFileName, "jntu")
            : 0;

        const fileUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        const jntuDoc = await JntuModel.create({
            fileName: finalFileName,
            course: options?.course || "uncategorized",
            subject: options?.subject || "uncategorized",
            author: normalizedAuthor,
            fileUrl: fileUrl,
            accessType: options?.accessType || "free",
            likesCount: 0,
            viewCount: 0,
            pageCount
        });
        const id = jntuDoc._id.toString();
        const downloadUrl = buildJntuDownloadUrl(id);
        logUpload("metadata-saved", {
            kind: "jntu",
            id,
            storageKey: uniqueFileName,
            bytes: buffer.length,
            downloadUrl,
        });

        return {
            url: fileUrl,
            downloadUrl,
            fileName: uniqueFileName,
            id
        };
    }

    async saveJobPosting(file: File, options: { jobName: string, jobUrl: string, description: string }) {
        const sanitizedFileName = file.name.replace(/\s+/g, "_");
        const uniqueFileName = `${Date.now()}_${sanitizedFileName}`;

        const buffer = await prepareUploadBuffer(file, "job", uniqueFileName);
        await uploadBufferToMinio("job", uniqueFileName, buffer, file.type);

        const imageUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        const jobDoc = await JobModel.create({
            jobName: options.jobName.trim(),
            jobUrl: options.jobUrl.trim(),
            description: options.description.trim(),
            imageUrl
        });
        logUpload("metadata-saved", {
            kind: "job",
            id: jobDoc._id.toString(),
            storageKey: uniqueFileName,
            bytes: buffer.length,
        });

        return {
            id: jobDoc._id,
            jobName: jobDoc.jobName,
            jobUrl: jobDoc.jobUrl,
            description: jobDoc.description,
            imageUrl
        };
    }

    async saveUpskillPosting(file: File, options: { upskillName: string, upskillUrl: string, description: string }) {
        const sanitizedFileName = file.name.replace(/\s+/g, "_");
        const uniqueFileName = `${Date.now()}_${sanitizedFileName}`;

        const buffer = await prepareUploadBuffer(file, "upskill", uniqueFileName);
        await uploadBufferToMinio("upskill", uniqueFileName, buffer, file.type);

        const imageUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        const upskillDoc = await UpskillModel.create({
            upskillName: options.upskillName.trim(),
            upskillUrl: options.upskillUrl.trim(),
            description: options.description.trim(),
            imageUrl
        });
        logUpload("metadata-saved", {
            kind: "upskill",
            id: upskillDoc._id.toString(),
            storageKey: uniqueFileName,
            bytes: buffer.length,
        });

        return {
            id: upskillDoc._id,
            upskillName: upskillDoc.upskillName,
            upskillUrl: upskillDoc.upskillUrl,
            description: upskillDoc.description,
            imageUrl
        };
    }

    // Stores a resume template file (or its thumbnail) to MinIO and returns the
    // streaming URL. Unlike other helpers it does not create a metadata doc —
    // the resume template controller owns the ResumeTemplate record.
    async saveResumeTemplateFile(file: File): Promise<{ url: string; fileName: string }> {
        const sanitizedFileName = file.name.replace(/\s+/g, "_");
        const uniqueFileName = `${Date.now()}_${sanitizedFileName}`;

        const buffer = await prepareUploadBuffer(file, "resume", uniqueFileName);
        await uploadBufferToMinio("resume", uniqueFileName, buffer, file.type);

        const url = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;
        logUpload("metadata-saved", {
            kind: "resume",
            storageKey: uniqueFileName,
            bytes: buffer.length,
            url,
        });

        return { url, fileName: uniqueFileName };
    }

    async getFileStream(fileName: string) {
        return await minioClient.getObject(config.minio.bucket, fileName);
    }

    async reprocessPages(type: "document" | "placement" | "pyq" | "jntu", id: string): Promise<number> {
        const kind: UploadKind = type as UploadKind;

        let fileUrl: string;
        if (type === "document") {
            const doc = await FileModel.findById(id).select("fileUrl").lean();
            if (!doc) throw new Error("Document not found");
            fileUrl = doc.fileUrl;
        } else if (type === "placement") {
            const doc = await PlacementModel.findById(id).select("fileUrl").lean();
            if (!doc) throw new Error("Document not found");
            fileUrl = doc.fileUrl;
        } else if (type === "jntu") {
            const doc = await JntuModel.findById(id).select("fileUrl").lean();
            if (!doc) throw new Error("Document not found");
            fileUrl = doc.fileUrl;
        } else {
            const doc = await PyqModel.findById(id).select("fileUrl").lean();
            if (!doc) throw new Error("Document not found");
            fileUrl = doc.fileUrl;
        }

        const storageKey = this.getStorageKeyFromUrl(fileUrl);
        if (!storageKey) throw new Error("Storage key missing");

        const stream = await this.getFileStream(storageKey);
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("end", () => resolve());
            stream.on("error", reject);
        });
        const buffer = Buffer.concat(chunks);

        console.log(`[reprocess-pages] downloaded id=${id} bytes=${buffer.length}`);
        const pages = await splitIntoPages(buffer);

        for (let i = 0; i < pages.length; i++) {
            await uploadBufferToMinio(kind, `${storageKey}_page_${i + 1}.pdf`, pages[i], "application/pdf");
        }

        if (type === "document") {
            await FileModel.findByIdAndUpdate(id, { pageCount: pages.length });
        } else if (type === "placement") {
            await PlacementModel.findByIdAndUpdate(id, { pageCount: pages.length });
        } else if (type === "jntu") {
            await JntuModel.findByIdAndUpdate(id, { pageCount: pages.length });
        } else {
            await PyqModel.findByIdAndUpdate(id, { pageCount: pages.length });
        }

        console.log(`[reprocess-pages] complete id=${id} pages=${pages.length}`);
        return pages.length;
    }

    async getFileMetadata(fileName: string) {
        return await minioClient.statObject(config.minio.bucket, fileName);
    }

    async getFilePartialStream(fileName: string, offset: number, length: number) {
        return await minioClient.getPartialObject(config.minio.bucket, fileName, offset, length);
    }

    getStorageKeyFromUrl(fileUrl: string) {
        const marker = "/files/";
        const markerIndex = fileUrl.lastIndexOf(marker);

        if (markerIndex === -1) {
            return null;
        }

        const storageKey = decodeURIComponent(fileUrl.slice(markerIndex + marker.length));
        return storageKey || null;
    }

    async deleteFileByUrl(fileUrl: string) {
        const storageKey = this.getStorageKeyFromUrl(fileUrl);

        if (!storageKey) {
            return false;
        }

        await minioClient.removeObject(config.minio.bucket, storageKey);
        return true;
    }
}
