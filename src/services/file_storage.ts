import { config } from "../config";
import { FileModel } from "../models/File";

export class FileStorageService {
    async saveFile(file: File, options?: { subject?: string, customFileName?: string }) {
        // Use custom name if provided, otherwise preserve original name but sanitizing it
        // If custom name doesn't have extension, append the one from original file
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
        const filePath = config.storage.getFullPath(uniqueFileName);

        // Ensure the file is written to the configured external storage path
        await Bun.write(filePath, file);

        const fileUrl = `${config.baseUrl}/files/${uniqueFileName}`;

        // Save metadata to MongoDB
        const fileDoc = await FileModel.create({
            fileName: finalFileName, // User friendly name
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
}
