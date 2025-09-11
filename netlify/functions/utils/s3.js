const AWS = require('aws-sdk');
const { createHash } = require('crypto');

// Configure AWS SDK
const s3 = new AWS.S3({
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
  const hash = createHash('md5').update(filename + timestamp).digest('hex').slice(0, 8);
  const s3Key = `uploads/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${hash}-${filename}`;
  
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  
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
 * Check if an object exists in S3
 */
async function objectExists(s3Key) {
  try {
    await s3.headObject({
      Bucket: BUCKET,
      Key: s3Key,
    }).promise();
    return true;
  } catch (error) {
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

module.exports = {
  generatePresignedUpload,
  generatePresignedDownload,
  objectExists,
  getObjectMetadata,
  s3,
  BUCKET,
};