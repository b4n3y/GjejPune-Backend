const mongoose = require('mongoose');

const jobCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    required: true
  }
});

jobCategorySchema.index({ name: 1 });
jobCategorySchema.index({ slug: 1 });

// Text index for search
jobCategorySchema.index(
  { name: 'text', description: 'text' },
  {
    weights: {
      name: 10,
      description: 5
    },
    name: 'CategoryTextIndex'
  }
);

const JobCategory = mongoose.model('JobCategory', jobCategorySchema);

module.exports = JobCategory; 