const AWS = require('aws-sdk');
const crypto = require('crypto');
const path = require('path');

// Configure AWS SDK for DigitalOcean Spaces
const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACES_ENDPOINT);
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.DO_SPACES_KEY,
  secretAccessKey: process.env.DO_SPACES_SECRET,
  region: process.env.DO_SPACES_REGION,
  signatureVersion: 'v4'
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
    await s3.upload(params).promise();
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

    await s3.deleteObject(params).promise();
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error('Failed to delete file');
  }
};

module.exports = {
  uploadFile,
  deleteFile
}; 