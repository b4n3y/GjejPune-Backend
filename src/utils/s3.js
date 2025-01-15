const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');

// Configure AWS SDK v3 for DigitalOcean Spaces
const s3Client = new S3Client({
  endpoint: `https://${process.env.DO_SPACES_ENDPOINT}`,
  region: process.env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET
  }
});

// Generate unique filename
const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const hash = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName);
  return `${timestamp}-${hash}${ext}`;
};

// Upload file to S3
const uploadFile = async (file, folder) => {
  if (!file) return null;

  const fileName = generateUniqueFileName(file.originalname);
  const filePath = `${folder}/${fileName}`;

  const params = {
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: filePath,
    Body: file.buffer,
    ACL: 'public-read',
    ContentType: file.mimetype
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    return `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/${filePath}`;
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error('Failed to upload file');
  }
};

// Delete file from S3
const deleteFile = async (fileUrl) => {
  if (!fileUrl) return;

  try {
    const key = fileUrl.split(`${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/`)[1];
    const params = {
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: key
    };

    await s3Client.send(new DeleteObjectCommand(params));
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error('Failed to delete file');
  }
};

module.exports = {
  uploadFile,
  deleteFile
}; 