import { Client } from "minio";
import { config } from "../config";
import { FileModel } from "../models/File";
import { PyqModel } from "../models/Pyq";
import { PlacementModel } from "../models/Placement";

const minioClient = new Client({
    endPoint: config.minio.endPoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey
});

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

        // Convert File to Buffer for MinIO upload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to MinIO
        await minioClient.putObject(
            config.minio.bucket,
            uniqueFileName,
            buffer,
            buffer.length,
            { 'Content-Type': file.type }
        );

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
            viewCount: 0
        });

        return {
            url: fileUrl,
            fileName: uniqueFileName,
            id: fileDoc._id
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

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await minioClient.putObject(
            config.minio.bucket,
            uniqueFileName,
            buffer,
            buffer.length,
            { 'Content-Type': file.type }
        );

        const fileUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        const pyqDoc = await PyqModel.create({
            fileName: finalFileName,
            course: options?.course || "uncategorized",
            subject: options?.subject || "uncategorized",
            fileUrl: fileUrl,
            likesCount: 0,
            viewCount: 0
        });

        return {
            url: fileUrl,
            fileName: uniqueFileName,
            id: pyqDoc._id
        };
    }

    async savePlacementFile(file: File, options?: { course?: string, subject?: string, customFileName?: string }) {
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

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await minioClient.putObject(
            config.minio.bucket,
            uniqueFileName,
            buffer,
            buffer.length,
            { 'Content-Type': file.type }
        );

        const fileUrl = `${config.baseUrl}/files/${encodeURIComponent(uniqueFileName)}`;

        const placementDoc = await PlacementModel.create({
            fileName: finalFileName,
            course: options?.course || "uncategorized",
            subject: options?.subject || "uncategorized",
            fileUrl: fileUrl,
            likesCount: 0,
            viewCount: 0
        });

        return {
            url: fileUrl,
            fileName: uniqueFileName,
            id: placementDoc._id
        };
    }

    async getFileStream(fileName: string) {
        return await minioClient.getObject(config.minio.bucket, fileName);
    }

    async deleteFileByUrl(fileUrl: string) {
        const marker = "/files/";
        const markerIndex = fileUrl.lastIndexOf(marker);

        if (markerIndex === -1) {
            return false;
        }

        const storageKey = decodeURIComponent(fileUrl.slice(markerIndex + marker.length));

        if (!storageKey) {
            return false;
        }

        await minioClient.removeObject(config.minio.bucket, storageKey);
        return true;
    }
}
