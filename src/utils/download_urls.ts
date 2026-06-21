import { config } from "../config";

export function buildDocumentDownloadUrl(documentId: string) {
    return `${config.baseUrl}/api/documents/${documentId}/file`;
}

export function buildPlacementDownloadUrl(documentId: string) {
    return `${config.baseUrl}/api/placements/documents/${documentId}/file`;
}

export function buildPyqDownloadUrl(documentId: string) {
    return `${config.baseUrl}/api/pyq/documents/${documentId}/file`;
}

export function buildJntuDownloadUrl(documentId: string) {
    return `${config.baseUrl}/api/jntu/documents/${documentId}/file`;
}
