const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ['User', 'Business']
  },
  type: {
    type: String,
    required: true,
    enum: [
      'NEW_APPLICATION',           // When user applies to a job
      'APPLICATION_STATUS_UPDATED', // When business updates application status
      'JOB_APPROVED',             // When admin approves a job
      'JOB_REJECTED',             // When admin rejects a job
      'JOB_DELETED',              // When a job is deleted
      'NEW_JOB_IN_INTEREST',      // When new job is posted in user's interest
      'BUSINESS_APPROVED',        // When business account is approved
      'BUSINESS_REJECTED',        // When business account is rejected
      'NEW_MESSAGE'               // When a new message is received
    ]
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 30 * 24 * 60 * 60 // Automatically delete after 30 days
  }
});

// Index for querying notifications
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification; 