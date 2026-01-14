import { Client } from "minio";
import { config } from "../config";
import { FileModel } from "../models/File";

const minioClient = new Client({
    endPoint: config.minio.endPoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey
});

export class FileStorageService {
    async saveFile(file: File, options?: { subject?: string, customFileName?: string }) {
        // Use custom name if provided, otherwise preserve original name but sanitizing it
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
            subject: options?.subject || "uncategorized",
            fileUrl: fileUrl,
            likesCount: 0,
            viewCount: 0
        });

        return {
            url: fileUrl,
            fileName: uniqueFileName,
            id: fileDoc._id
        };
    }

    async getFileStream(fileName: string) {
        return await minioClient.getObject(config.minio.bucket, fileName);
    }
}
