const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const businessSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  businessType: {
    type: String,
    required: true,
    trim: true
  },
  logo: {
    type: String,
    trim: true
  },
  contactPerson: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    position: {
      type: String,
      required: true,
      trim: true
    }
  },
  address: {
    street: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    zipCode: {
      type: String,
      required: true,
      trim: true
    },
    country: {
      type: String,
      required: true,
      trim: true
    }
  },
  accountType: {
    type: String,
    required: true,
    enum: ['business'],
    default: 'business'
  },
  approved: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      return ret;
    }
  }
});

businessSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

businessSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

businessSchema.index({ businessName: 1 });
businessSchema.index({ 'contactPerson.phoneNumber': 1 });
businessSchema.index({ approved: 1 });
businessSchema.index({ createdAt: -1 });

// Compound indexes for filtering and search
businessSchema.index({ approved: 1, businessType: 1 });
businessSchema.index({ approved: 1, createdAt: -1 });
businessSchema.index({ businessType: 1, approved: 1 });

// Text index for search
businessSchema.index(
  { businessName: 'text', businessType: 'text' },
  {
    weights: {
      businessName: 10,
      businessType: 5
    },
    name: 'BusinessTextIndex'
  }
);

const Business = mongoose.model('Business', businessSchema);

module.exports = Business; 