const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Business = require('../../../models/Business');
const { auth } = require('../../../middleware/auth');
const { authLimiter } = require('../../../middleware/rateLimiter');
const JobCategory = require('../../../models/JobCategory');
const { validatePassword } = require('../../../utils/validation');
const { sendVerificationEmail } = require('./verification');
const { upload } = require('../../../middleware/fileUpload');
const { uploadFile, deleteFile } = require('../../../utils/s3');

const router = express.Router();

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, username, firstName, lastName, phoneNumber, interests } = req.body;

    // Validate required fields
    const requiredFields = { 
      email: email?.trim(), 
      password: password?.trim(), 
      username: username?.trim(), 
      firstName: firstName?.trim(), 
      lastName: lastName?.trim(), 
      phoneNumber: phoneNumber?.trim() 
    };
    
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: `The following fields are required: ${missingFields.join(', ')}`
      });
    }

    // Validate password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Password validation failed',
        details: validation.errors 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        { username },
        { phoneNumber }
      ]
    });

    if (existingUser) {
      let duplicateField = '';
      if (existingUser.email === email) duplicateField = 'email';
      else if (existingUser.username === username) duplicateField = 'username';
      else if (existingUser.phoneNumber === phoneNumber) duplicateField = 'phone number';
      
      return res.status(400).json({ 
        error: 'Account already exists',
        details: `An account with this ${duplicateField} already exists`
      });
    }

    // Create new user
    const user = new User({
      email,
      password,
      username,
      firstName,
      lastName,
      phoneNumber,
      interests
    });

    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(user);
    } catch (error) {
      console.error('Failed to send verification email:', error);
      // Continue with registration even if email fails
    }

    res.status(201).json({ 
      message: 'Registration successful. Please check your email for verification.',
      userId: user._id 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing credentials',
        details: 'Both email and password are required'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        details: 'No account found with this email address'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        details: 'Incorrect password'
      });
    }

    // Check email verification
    if (!user.isEmailVerified) {
      return res.status(403).json({
        error: 'Email not verified',
        details: 'Please verify your email address before logging in. Check your inbox for the verification link.'
      });
    }

    const token = jwt.sign(
      { userId: user._id, type: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified
      },
      expiresIn: '7 days'
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('firstName lastName email username phoneNumber avatar cv interests')
      .populate('interests', 'name')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clean up and restructure the response
    const cleanedProfile = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      phoneNumber: user.phoneNumber,
      avatar: user.avatar,
      cv: user.cv,
      interests: user.interests.map(interest => ({
        id: interest._id,
        name: interest.name
      }))
    };

    res.json(cleanedProfile);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.patch('/profile', auth, upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]), async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, interests } = req.body;
    const updates = {};
    let needsPhoneCheck = false;

    // Validate and sanitize inputs
    if (firstName !== undefined) {
      if (!firstName.trim()) {
        return res.status(400).json({
          error: 'Invalid input',
          details: 'First name cannot be empty'
        });
      }
      updates.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      if (!lastName.trim()) {
        return res.status(400).json({
          error: 'Invalid input',
          details: 'Last name cannot be empty'
        });
      }
      updates.lastName = lastName.trim();
    }

    if (phoneNumber !== undefined) {
      if (!phoneNumber.trim()) {
        return res.status(400).json({
          error: 'Invalid input',
          details: 'Phone number cannot be empty'
        });
      }
      if (phoneNumber !== req.user?.phoneNumber) {
        updates.phoneNumber = phoneNumber.trim();
        needsPhoneCheck = true;
      }
    }

    // Handle interests update
    if (interests !== undefined) {
      let interestIds;
      try {
        interestIds = JSON.parse(interests);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid format',
          details: 'Interests must be a valid JSON array'
        });
      }

      if (!Array.isArray(interestIds)) {
        return res.status(400).json({
          error: 'Invalid format',
          details: 'Interests must be an array'
        });
      }

      if (interestIds.length > 3) {
        return res.status(400).json({
          error: 'Validation error',
          details: 'Maximum 3 interests allowed'
        });
      }

      if (interestIds.length !== new Set(interestIds).size) {
        return res.status(400).json({
          error: 'Validation error',
          details: 'Duplicate interests are not allowed'
        });
      }

      // Validate that all interests exist
      const existingInterests = await JobCategory.find({
        _id: { $in: interestIds }
      }).select('_id').lean();

      if (existingInterests.length !== interestIds.length) {
        return res.status(400).json({
          error: 'Invalid interests',
          details: 'One or more selected interests do not exist'
        });
      }

      updates.interests = interestIds;
    }

    // Check phone number uniqueness if changed
    if (needsPhoneCheck) {
      const [existingUser, existingBusiness] = await Promise.all([
        User.findOne({ 
          phoneNumber: updates.phoneNumber,
          _id: { $ne: req.userId }
        }).select('_id').lean(),
        Business.findOne({
          'contactPerson.phoneNumber': updates.phoneNumber
        }).select('_id').lean()
      ]);

      if (existingUser || existingBusiness) {
        return res.status(400).json({
          error: 'Duplicate phone',
          details: 'This phone number is already registered by another account'
        });
      }
    }

    // Handle file uploads in parallel if needed
    const uploadPromises = [];
    let currentUser;

    if (req.files?.avatar || req.files?.cv) {
      currentUser = await User.findById(req.userId).select('avatar cv').lean();
      
      if (req.files.avatar) {
        if (!req.files.avatar[0].mimetype.startsWith('image/')) {
          return res.status(400).json({
            error: 'Invalid file',
            details: 'Avatar must be an image file'
          });
        }
        uploadPromises.push(
          (async () => {
            try {
              if (currentUser.avatar) {
                await deleteFile(currentUser.avatar).catch(console.error);
              }
              updates.avatar = await uploadFile(req.files.avatar[0], 'avatars');
            } catch (error) {
              throw new Error('Failed to upload avatar');
            }
          })()
        );
      }

      if (req.files.cv) {
        if (!req.files.cv[0].mimetype.includes('pdf')) {
          return res.status(400).json({
            error: 'Invalid file',
            details: 'CV must be a PDF file'
          });
        }
        uploadPromises.push(
          (async () => {
            try {
              if (currentUser.cv) {
                await deleteFile(currentUser.cv).catch(console.error);
              }
              updates.cv = await uploadFile(req.files.cv[0], 'cvs');
            } catch (error) {
              throw new Error('Failed to upload CV');
            }
          })()
        );
      }
    }

    // Wait for all file uploads to complete
    if (uploadPromises.length > 0) {
      try {
        await Promise.all(uploadPromises);
      } catch (error) {
        return res.status(500).json({
          error: 'Upload failed',
          details: error.message
        });
      }
    }

    // Update user profile with all changes at once
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { 
        new: true,
        runValidators: true,
        select: 'firstName lastName email username phoneNumber avatar cv interests'
      }
    ).populate('interests', 'name');

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        details: 'User not found'
      });
    }

    // Clean up and send response
    const response = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      phoneNumber: user.phoneNumber,
      avatar: user.avatar,
      cv: user.cv,
      interests: user.interests.map(interest => ({
        id: interest._id,
        name: interest.name
      }))
    };

    res.json(response);
  } catch (error) {
    console.error('Profile update error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid format',
        details: `Invalid format for field: ${error.path}`
      });
    }
    res.status(500).json({
      error: 'Server error',
      details: 'An unexpected error occurred while updating your profile'
    });
  }
});

module.exports = router; 