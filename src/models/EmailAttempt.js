const mongoose = require('mongoose');

const emailAttemptSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['verification', 'password_reset']
  },
  attempts: {
    type: Number,
    default: 1
  },
  lastAttempt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

emailAttemptSchema.index({ email: 1, type: 1 }, { unique: true });
emailAttemptSchema.index({ lastAttempt: 1 }, { expireAfterSeconds: 3600 }); // Auto-delete after 1 hour

const EmailAttempt = mongoose.model('EmailAttempt', emailAttemptSchema);

module.exports = EmailAttempt; 