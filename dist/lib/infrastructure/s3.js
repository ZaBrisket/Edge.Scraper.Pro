"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePresignedUpload = generatePresignedUpload;
exports.generatePresignedDownload = generatePresignedDownload;
exports.uploadToS3 = uploadToS3;
exports.objectExists = objectExists;
exports.getObjectMetadata = getObjectMetadata;
exports.deleteFromS3 = deleteFromS3;
exports.generateArtifactKey = generateArtifactKey;
const aws_sdk_1 = __importDefault(require("aws-sdk"));
const crypto_1 = require("crypto");
// Configure AWS SDK
const s3 = new aws_sdk_1.default.S3({
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const BUCKET = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';
/**
 * Generate a presigned POST URL for file uploads
 */
async function generatePresignedUpload(filename, contentType, maxFileSize = 10 * 1024 * 1024) {
    const timestamp = Date.now();
    const hash = (0, crypto_1.createHash)('md5').update(filename + timestamp).digest('hex').slice(0, 8);
    const s3Key = `uploads/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${hash}-${filename}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const params = {
        Bucket: BUCKET,
        Key: s3Key,
        Expires: 3600, // 1 hour in seconds
        ContentType: contentType,
        Conditions: [
            ['content-length-range', 0, maxFileSize],
            ['eq', '$Content-Type', contentType],
        ],
    };
    const uploadUrl = s3.getSignedUrl('putObject', {
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: contentType,
        Expires: 3600,
    });
    return {
        uploadUrl,
        s3Key,
        expiresAt,
    };
}
/**
 * Generate a presigned GET URL for file downloads
 */
async function generatePresignedDownload(s3Key, expiresInSeconds = 3600) {
    const downloadUrl = s3.getSignedUrl('getObject', {
        Bucket: BUCKET,
        Key: s3Key,
        Expires: expiresInSeconds,
    });
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return {
        downloadUrl,
        expiresAt,
    };
}
/**
 * Upload a file directly to S3 (for server-side use)
 */
async function uploadToS3(key, body, contentType, metadata) {
    const result = await s3.upload({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
    }).promise();
    return {
        s3Key: result.Key,
        etag: result.ETag || '',
    };
}
/**
 * Check if an object exists in S3
 */
async function objectExists(s3Key) {
    try {
        await s3.headObject({
            Bucket: BUCKET,
            Key: s3Key,
        }).promise();
        return true;
    }
    catch (error) {
        if (error.code === 'NotFound') {
            return false;
        }
        throw error;
    }
}
/**
 * Get object metadata from S3
 */
async function getObjectMetadata(s3Key) {
    const result = await s3.headObject({
        Bucket: BUCKET,
        Key: s3Key,
    }).promise();
    return {
        contentType: result.ContentType || 'application/octet-stream',
        contentLength: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        etag: result.ETag || '',
    };
}
/**
 * Delete an object from S3
 */
async function deleteFromS3(s3Key) {
    await s3.deleteObject({
        Bucket: BUCKET,
        Key: s3Key,
    }).promise();
}
/**
 * Generate a unique S3 key for artifacts
 */
function generateArtifactKey(jobId, filename, format) {
    const timestamp = Date.now();
    const hash = (0, crypto_1.createHash)('md5').update(jobId + filename + timestamp).digest('hex').slice(0, 8);
    return `artifacts/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${hash}-${jobId}.${format}`;
}
//# sourceMappingURL=s3.js.map