const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  requirements: {
    type: [String],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one requirement is needed'
    }
  },
  salary: {
    type: String,
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCategory',
    required: true
  },
  approved: {
    type: Boolean,
    default: false,
    index: true // Single field index for quick approval checks
  }
}, {
  timestamps: true
});

// Primary indexes for frequent operations
jobSchema.index({ businessId: 1 }); // For business's jobs
jobSchema.index({ category: 1 }); // For category-based queries
jobSchema.index({ createdAt: -1 }); // For sorting by creation date

// Compound indexes for common query patterns
jobSchema.index({ businessId: 1, approved: 1 }); // For business job management
jobSchema.index({ approved: 1, createdAt: -1 }); // For public job listing
jobSchema.index({ category: 1, approved: 1, createdAt: -1 }); // For category-based listing with approval
jobSchema.index({ businessId: 1, category: 1 }); // For business category filtering

// Text index for search functionality with weights
jobSchema.index(
  { title: 'text', description: 'text' },
  {
    weights: {
      title: 10,
      description: 5
    },
    name: 'JobTextIndex'
  }
);

// Add TTL index if you want to automatically delete old unapproved jobs
jobSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { approved: false }
  }
);

const Job = mongoose.model('Job', jobSchema);

module.exports = Job; 