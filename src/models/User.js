const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const JobCategory = require('./JobCategory');

const userSchema = new mongoose.Schema({
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
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  avatar: {
    type: String,
    trim: true
  },
  cv: {
    type: String,
    trim: true
  },
  accountType: {
    type: String,
    required: true,
    enum: ['user'],
    default: 'user'
  },
  interests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCategory',
    validate: {
      validator: async function(value) {
        if (!value) return true;
        const category = await JobCategory.findById(value);
        return category !== null;
      },
      message: props => `Interest with ID ${props.value} does not exist`
    }
  }],
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
    virtuals: true,
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

// Add array validation for interests
userSchema.path('interests').validate(function(interests) {
  if (!interests) return true;
  return interests.length <= 3;
}, 'User can only have up to 3 interests');

// Add validation for duplicate interests
userSchema.path('interests').validate(function(interests) {
  if (!interests || interests.length === 0) return true;
  const uniqueInterests = new Set(interests.map(id => id.toString()));
  return uniqueInterests.size === interests.length;
}, 'Duplicate interests are not allowed');

userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ interests: 1 });
userSchema.index({ isEmailVerified: 1, accountType: 1 });
userSchema.index({ createdAt: -1 });

// Compound indexes for search and filtering
userSchema.index({ firstName: 1, lastName: 1 });
userSchema.index({ accountType: 1, isEmailVerified: 1 });

// Text index for search
userSchema.index(
  { firstName: 'text', lastName: 'text', username: 'text' },
  {
    weights: {
      username: 10,
      firstName: 5,
      lastName: 5
    },
    name: 'UserTextIndex'
  }
);

const User = mongoose.model('User', userSchema);

module.exports = User; 