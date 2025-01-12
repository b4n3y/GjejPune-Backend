const express = require('express');
const jwt = require('jsonwebtoken');
const Business = require('../../../models/Business');
const User = require('../../../models/User');
const { auth } = require('../../../middleware/auth');
const { authLimiter } = require('../../../middleware/rateLimiter');
const { validatePassword } = require('../../../utils/validation');
const { sendVerificationEmail } = require('./verification');
const { upload } = require('../../../middleware/fileUpload');
const { uploadFile, deleteFile } = require('../../../utils/s3');

const router = express.Router();

router.post('/register', authLimiter, async (req, res) => {
  try {
    const {
      email,
      password,
      businessName,
      businessType,
      contactPerson,
      address
    } = req.body;

    // Validate password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    // Check if business already exists
    const existingBusiness = await Business.findOne({
      $or: [
        { email },
        { businessName },
        { 'contactPerson.phoneNumber': contactPerson.phoneNumber }
      ]
    });

    if (existingBusiness) {
      return res.status(400).json({ error: 'Email, business name, or phone number already registered' });
    }

    // Check if phone number exists in User collection
    const existingUser = await User.findOne({ phoneNumber: contactPerson.phoneNumber });
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered by a user' });
    }

    // Create new business
    const business = new Business({
      email,
      password,
      businessName,
      businessType,
      contactPerson,
      address
    });

    await business.save();

    // Send verification email
    try {
      await sendVerificationEmail(business, true);
    } catch (error) {
      console.error('Failed to send verification email:', error);
      // Delete the business if email sending fails
      await Business.findByIdAndDelete(business._id);
      return res.status(500).json({ 
        error: 'Failed to send verification email',
        message: error.message
      });
    }

    res.status(201).json({ 
      message: 'Registration successful. Please check your email for verification.',
      businessId: business._id 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email is registered as user
    const user = await User.findOne({ email });
    if (user) {
      return res.status(401).json({ error: 'Please use user login' });
    }

    const business = await Business.findOne({ email });
    if (!business) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await business.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check email verification
    if (!business.isEmailVerified) {
      return res.status(403).json({
        error: 'Email not verified',
        message: 'Please verify your email address before logging in. Check your inbox for the verification link.'
      });
    }

    // Check if business is approved
    if (!business.approved) {
      return res.status(403).json({ 
        error: 'Account pending approval',
        message: 'Your business account is pending approval. Please wait for administrator approval.'
      });
    }

    const token = jwt.sign(
      { userId: business._id, type: 'business' }, 
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      type: 'business',
      profile: {
        id: business._id,
        businessName: business.businessName,
        businessType: business.businessType,
        contactPerson: {
          name: business.contactPerson.name,
          phoneNumber: business.contactPerson.phoneNumber,
          position: business.contactPerson.position
        },
        address: {
          street: business.address.street,
          city: business.address.city,
          state: business.address.state,
          zipCode: business.address.zipCode,
          country: business.address.country
        },
        approved: business.approved,
        createdAt: business.createdAt
      },
      expiresIn: '7 days'
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get authenticated business's own profile
router.get('/profile', auth, async (req, res) => {
  try {
    const business = await Business.findById(req.userId)
      .select('businessName businessType logo contactPerson address approved createdAt')
      .lean();
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Clean up and restructure the response
    const cleanedProfile = {
      id: business._id,
      businessName: business.businessName,
      businessType: business.businessType,
      logo: business.logo,
      contactPerson: {
        name: business.contactPerson.name,
        position: business.contactPerson.position,
        phoneNumber: business.contactPerson.phoneNumber
      },
      address: {
        street: business.address.street,
        city: business.address.city,
        state: business.address.state,
        zipCode: business.address.zipCode,
        country: business.address.country
      },
      approved: business.approved,
      createdAt: business.createdAt
    };

    res.json(cleanedProfile);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update business profile
router.patch('/profile', auth, upload.single('logo'), async (req, res) => {
  try {
    const {
      businessName,
      businessType,
      contactPerson,
      address
    } = req.body;

    const updates = {};
    let needsPhoneCheck = false;
    let parsedContactPerson;
    let parsedAddress;

    // Batch basic field updates
    if (businessName) updates.businessName = businessName.trim();
    if (businessType) updates.businessType = businessType.trim();
    
    // Parse and validate contact person
    if (contactPerson) {
      parsedContactPerson = typeof contactPerson === 'string' ? 
        JSON.parse(contactPerson) : contactPerson;

      if (parsedContactPerson.phoneNumber) {
        needsPhoneCheck = true;
      }

      updates.contactPerson = {
        name: parsedContactPerson.name?.trim(),
        phoneNumber: parsedContactPerson.phoneNumber?.trim(),
        position: parsedContactPerson.position?.trim()
      };
    }

    // Parse and validate address
    if (address) {
      parsedAddress = typeof address === 'string' ? 
        JSON.parse(address) : address;

      updates.address = {
        street: parsedAddress.street?.trim(),
        city: parsedAddress.city?.trim(),
        state: parsedAddress.state?.trim(),
        zipCode: parsedAddress.zipCode?.trim(),
        country: parsedAddress.country?.trim()
      };
    }

    // Check phone number uniqueness if changed
    if (needsPhoneCheck) {
      const [existingBusiness, existingUser] = await Promise.all([
        Business.findOne({
          'contactPerson.phoneNumber': updates.contactPerson.phoneNumber,
          _id: { $ne: req.userId }
        }).select('_id').lean(),
        User.findOne({
          phoneNumber: updates.contactPerson.phoneNumber
        }).select('_id').lean()
      ]);

      if (existingBusiness || existingUser) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }

    // Handle logo upload if needed
    if (req.file) {
      const currentBusiness = await Business.findById(req.userId)
        .select('logo')
        .lean();

      if (currentBusiness?.logo) {
        await deleteFile(currentBusiness.logo).catch(console.error);
      }
      updates.logo = await uploadFile(req.file, 'logos');
    }

    // Update business profile with all changes at once
    const business = await Business.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { 
        new: true,
        runValidators: true,
        select: 'businessName businessType logo contactPerson address approved createdAt'
      }
    ).lean();

    // Clean up and send response
    const response = {
      id: business._id,
      businessName: business.businessName,
      businessType: business.businessType,
      logo: business.logo,
      contactPerson: {
        name: business.contactPerson.name,
        position: business.contactPerson.position,
        phoneNumber: business.contactPerson.phoneNumber
      },
      address: {
        street: business.address.street,
        city: business.address.city,
        state: business.address.state,
        zipCode: business.address.zipCode,
        country: business.address.country
      },
      approved: business.approved,
      createdAt: business.createdAt
    };

    res.json(response);
  } catch (error) {
    console.error('Business profile update error:', error);
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