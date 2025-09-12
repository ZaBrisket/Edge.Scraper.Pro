import AWS from 'aws-sdk';
import { createHash } from 'crypto';

// Configure AWS SDK
const s3 = new AWS.S3({
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';

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
export async function generatePresignedUpload(
  filename: string,
  contentType: string,
  maxFileSize: number = 10 * 1024 * 1024 // 10MB default
): Promise<PresignedUploadData> {
  const timestamp = Date.now();
  const hash = createHash('md5')
    .update(filename + timestamp)
    .digest('hex')
    .slice(0, 8);
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
export async function generatePresignedDownload(
  s3Key: string,
  expiresInSeconds: number = 3600 // 1 hour default
): Promise<PresignedDownloadData> {
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
export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ s3Key: string; etag: string }> {
  const result = await s3
    .upload({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    })
    .promise();

  return {
    s3Key: result.Key,
    etag: result.ETag || '',
  };
}

/**
 * Check if an object exists in S3
 */
export async function objectExists(s3Key: string): Promise<boolean> {
  try {
    await s3
      .headObject({
        Bucket: BUCKET,
        Key: s3Key,
      })
      .promise();
    return true;
  } catch (error: any) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get object metadata from S3
 */
export async function getObjectMetadata(s3Key: string): Promise<{
  contentType: string;
  contentLength: number;
  lastModified: Date;
  etag: string;
}> {
  const result = await s3
    .headObject({
      Bucket: BUCKET,
      Key: s3Key,
    })
    .promise();

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
export async function deleteFromS3(s3Key: string): Promise<void> {
  await s3
    .deleteObject({
      Bucket: BUCKET,
      Key: s3Key,
    })
    .promise();
}

/**
 * Generate a unique S3 key for artifacts
 */
export function generateArtifactKey(
  jobId: string,
  filename: string,
  format: 'xlsx' | 'pdf'
): string {
  const timestamp = Date.now();
  const hash = createHash('md5')
    .update(jobId + filename + timestamp)
    .digest('hex')
    .slice(0, 8);
  return `artifacts/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${hash}-${jobId}.${format}`;
}
