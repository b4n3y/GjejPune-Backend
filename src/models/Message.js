const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'senderModel'
  },
  senderModel: {
    type: String,
    required: true,
    enum: ['User', 'Business']
  },
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
  jobApplication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobApplication',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Primary indexes for frequent queries
messageSchema.index({ jobApplication: 1, createdAt: -1 }); // For fetching conversation messages
messageSchema.index({ recipient: 1, read: 1 }); // For unread counts
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 }); // For user-to-user message history

// Compound indexes for common query patterns
messageSchema.index({ 
  jobApplication: 1, 
  recipient: 1, 
  read: 1 
}); // For marking messages as read

messageSchema.index({ 
  jobApplication: 1,
  createdAt: -1,
  read: 1
}); // For fetching unread messages in a conversation

// Index for distinct operations
messageSchema.index({ jobApplication: 1, _id: 1 });

// Add TTL index if you want to automatically delete old messages
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 }); // 180 days

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 