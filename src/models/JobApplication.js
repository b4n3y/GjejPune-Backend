const mongoose = require('mongoose');

const jobApplicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  cv: {
    type: String,
    required: [true, 'CV is required for job applications']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required for job applications']
  },
  coverLetter: {
    type: String,
    trim: true
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure unique applications per user per job
jobApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

// Indexes for message-related queries
jobApplicationSchema.index({ userId: 1, updatedAt: -1 }); // For user's conversations
jobApplicationSchema.index({ jobId: 1, updatedAt: -1 }); // For business's conversations
jobApplicationSchema.index({ userId: 1, createdAt: -1 }); // For sorting user's applications
jobApplicationSchema.index({ jobId: 1, createdAt: -1 }); // For sorting business's applications

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

module.exports = JobApplication; 