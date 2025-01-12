const multer = require('multer');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Allow images for avatar/logo
  if (file.fieldname === 'avatar' || file.fieldname === 'logo') {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed for avatar/logo'), false);
    }
    // 5MB limit for images
    if (file.size > 5 * 1024 * 1024) {
      return cb(new Error('Image file size must be less than 5MB'), false);
    }
  }
  
  // Allow PDFs for CV
  if (file.fieldname === 'cv') {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed for CV'), false);
    }
    // 10MB limit for PDFs
    if (file.size > 10 * 1024 * 1024) {
      return cb(new Error('CV file size must be less than 10MB'), false);
    }
  }
  
  cb(null, true);
};

// Create multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

module.exports = {
  upload
}; 