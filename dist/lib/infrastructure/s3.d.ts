export interface PresignedUploadData {
    uploadUrl: string;
    s3Key: string;
    expiresAt: Date;
}
export interface PresignedDownloadData {
    downloadUrl: string;
    expiresAt: Date;
}
/**
 * Generate a presigned POST URL for file uploads
 */
export declare function generatePresignedUpload(filename: string, contentType: string, maxFileSize?: number): Promise<PresignedUploadData>;
/**
 * Generate a presigned GET URL for file downloads
 */
export declare function generatePresignedDownload(s3Key: string, expiresInSeconds?: number): Promise<PresignedDownloadData>;
/**
 * Upload a file directly to S3 (for server-side use)
 */
export declare function uploadToS3(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<{
    s3Key: string;
    etag: string;
}>;
/**
 * Check if an object exists in S3
 */
export declare function objectExists(s3Key: string): Promise<boolean>;
/**
 * Get object metadata from S3
 */
export declare function getObjectMetadata(s3Key: string): Promise<{
    contentType: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
}>;
/**
 * Delete an object from S3
 */
export declare function deleteFromS3(s3Key: string): Promise<void>;
/**
 * Generate a unique S3 key for artifacts
 */
export declare function generateArtifactKey(jobId: string, filename: string, format: 'xlsx' | 'pdf'): string;
//# sourceMappingURL=s3.d.ts.map