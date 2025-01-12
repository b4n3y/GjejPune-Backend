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

    // Validate password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
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
      return res.status(400).json({ error: 'Email, username, or phone number already registered' });
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
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check email verification
    if (!user.isEmailVerified) {
      return res.status(403).json({
        error: 'Email not verified',
        message: 'Please verify your email address before logging in. Check your inbox for the verification link.'
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

    // Batch basic field updates
    if (firstName) updates.firstName = firstName.trim();
    if (lastName) updates.lastName = lastName.trim();
    if (phoneNumber && phoneNumber !== req.user?.phoneNumber) {
      updates.phoneNumber = phoneNumber.trim();
      needsPhoneCheck = true;
    }

    // Handle interests update
    if (interests) {
      const interestIds = JSON.parse(interests);
      if (!Array.isArray(interestIds)) {
        return res.status(400).json({ error: 'Interests must be an array' });
      }
      if (interestIds.length > 3) {
        return res.status(400).json({ error: 'Maximum 3 interests allowed' });
      }
      if (interestIds.length === new Set(interestIds).size) {
        updates.interests = interestIds;
      } else {
        return res.status(400).json({ error: 'Duplicate interests are not allowed' });
      }
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
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }

    // Handle file uploads in parallel if needed
    const uploadPromises = [];
    let currentUser;

    if (req.files?.avatar || req.files?.cv) {
      currentUser = await User.findById(req.userId).select('avatar cv').lean();
      
      if (req.files.avatar) {
        uploadPromises.push(
          (async () => {
            if (currentUser.avatar) {
              await deleteFile(currentUser.avatar).catch(console.error);
            }
            updates.avatar = await uploadFile(req.files.avatar[0], 'avatars');
          })()
        );
      }

      if (req.files.cv) {
        uploadPromises.push(
          (async () => {
            if (currentUser.cv) {
              await deleteFile(currentUser.cv).catch(console.error);
            }
            updates.cv = await uploadFile(req.files.cv[0], 'cvs');
          })()
        );
      }
    }

    // Wait for all file uploads to complete
    if (uploadPromises.length > 0) {
      await Promise.all(uploadPromises);
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
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 