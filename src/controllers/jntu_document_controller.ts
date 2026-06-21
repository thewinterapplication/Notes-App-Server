import { Elysia } from "elysia";
import { Types } from "mongoose";
import { JntuModel } from "../models/Jntu";
import { FileStorageService } from "../services/file_storage";
import { buildJntuDownloadUrl } from "../utils/download_urls";
import { requireAdminAuth } from "../utils/admin_auth";

function serializeJntuDocument(document: any) {
    const id = document._id.toString();

    return {
        id,
        fileName: document.fileName,
        course: document.course || "uncategorized",
        subject: document.subject || "uncategorized",
        author: document.author || "Unknown author",
        fileUrl: document.fileUrl,
        downloadUrl: buildJntuDownloadUrl(id),
        accessType: document.accessType || "free",
        likesCount: document.likesCount || 0,
        viewCount: document.viewCount || 0,
        pageCount: document.pageCount || 0,
        createdAt: document.createdAt
    };
}

export const jntuDocumentController = new Elysia()
    .decorate("storage", new FileStorageService())

    .get("/jntu", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("documents.html");
    })

    .get("/api/jntu/documents", async () => {
        const documents = await JntuModel.find()
            .select("fileName course subject author fileUrl accessType likesCount viewCount pageCount createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return { documents: documents.map(serializeJntuDocument) };
    })

    .delete("/api/jntu/documents/:id", async ({ params, set, storage }) => {
        if (!Types.ObjectId.isValid(params.id)) {
            set.status = 400;
            return { error: "Invalid document id" };
        }

        const document = await JntuModel.findById(params.id);

        if (!document) {
            set.status = 404;
            return { error: "Document not found" };
        }

        let storageDeleted = true;

        try {
            storageDeleted = await storage.deleteFileByUrl(document.fileUrl);
        } catch (error) {
            storageDeleted = false;
            console.error(`Failed to delete stored file for jntu document ${document._id}:`, error);
        }

        await document.deleteOne();

        return {
            success: true,
            storageDeleted
        };
    });
