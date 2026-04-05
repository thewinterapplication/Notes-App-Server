import { Elysia } from "elysia";
import { Types } from "mongoose";
import { FileModel } from "../models/File";
import { FileStorageService } from "../services/file_storage";

function serializeDocument(document: any) {
    return {
        id: document._id.toString(),
        fileName: document.fileName,
        course: document.course || "uncategorized",
        subject: document.subject || "uncategorized",
        author: document.author || "Unknown author",
        fileUrl: document.fileUrl,
        accessType: document.accessType || "free",
        likesCount: document.likesCount || 0,
        viewCount: document.viewCount || 0,
        createdAt: document.createdAt
    };
}

export const documentController = new Elysia()
    .decorate("storage", new FileStorageService())

    .get("/documents", () => Bun.file("documents.html"))

    .get("/api/documents", async () => {
        const documents = await FileModel.find()
            .select("fileName course subject author fileUrl accessType likesCount viewCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { documents: documents.map(serializeDocument) };
    })

    .delete("/api/documents/:id", async ({ params, set, storage }) => {
        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            return { error: "Invalid document id" };
        }

        const document = await FileModel.findById(params.id);

        if (!document) {
            set.status = 404;
            return { error: "Document not found" };
        }

        let storageDeleted = true;

        try {
            storageDeleted = await storage.deleteFileByUrl(document.fileUrl);
        } catch (error) {
            storageDeleted = false;
            console.error(`Failed to delete stored file for document ${document._id}:`, error);
        }

        await document.deleteOne();

        return {
            success: true,
            storageDeleted
        };
    });
