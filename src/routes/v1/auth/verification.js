const express = require('express');
const path = require('path');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../../../models/User');
const Business = require('../../../models/Business');
const EmailAttempt = require('../../../models/EmailAttempt');
const { sendEmail } = require('../../../services/emailService');
const { verificationEmailTemplate, passwordResetTemplate } = require('../../../utils/emailTemplates');
const { validateEmailDomain } = require('../../../middleware/rateLimiter');

// Check email attempt limits
const checkEmailAttempts = async (email, type) => {
  try {
    const attempt = await EmailAttempt.findOne({ email, type });
    
    if (attempt) {
      if (attempt.attempts >= 3) {
        throw new Error('Too many attempts. Please try again in 1 hour.');
      }
      
      attempt.attempts += 1;
      attempt.lastAttempt = new Date();
      await attempt.save();
    } else {
      await EmailAttempt.create({ email, type });
    }
    
    return true;
  } catch (error) {
    throw error;
  }
};

// Generate verification token
const generateVerificationToken = (email) => {
  return jwt.sign(
    { email },
    process.env.EMAIL_VERIFICATION_SECRET,
    { expiresIn: '15m' }
  );
};

// Send verification email
const sendVerificationEmail = async (user, isBusinessAccount = false) => {
  try {
    const token = generateVerificationToken(user.email);
    const model = isBusinessAccount ? Business : User;
    
    // Validate email domain
    if (!validateEmailDomain(user.email)) {
      throw new Error('Invalid email domain. Only gmail.com, icloud.com, and outlook.com are allowed.');
    }

    // Check rate limit
    await checkEmailAttempts(user.email, 'verification');
    
    // Update user/business with verification token
    await model.findByIdAndUpdate(user._id, {
      emailVerificationToken: token,
      emailVerificationExpires: Date.now() + 15 * 60 * 1000 // 15 minutes
    });

    const name = isBusinessAccount ? user.businessName : `${user.firstName} ${user.lastName}`;
    const template = verificationEmailTemplate(name, token, process.env.BACKEND_URL);
    
    const sent = await sendEmail(user.email, template);
    if (!sent) {
      throw new Error('Failed to send verification email');
    }
    
    return true;
  } catch (error) {
    console.error('Verification email error:', error);
    throw error;
  }
};

// Verify email endpoint
router.get('/verify-email/:token', async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.EMAIL_VERIFICATION_SECRET);
    const user = await User.findOne({
      email: decoded.email,
      emailVerificationToken: req.params.token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    const business = await Business.findOne({
      email: decoded.email,
      emailVerificationToken: req.params.token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    const model = user ? User : Business;
    const account = user || business;

    if (!account) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await model.findByIdAndUpdate(account._id, {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null
    });

    // Send the success page instead of JSON response
    const absolutePath = path.resolve(__dirname, '../../../public/email-verified.html');
    res.sendFile(absolutePath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).send('Error loading verification success page');
      }
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired verification token' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email domain
    if (!validateEmailDomain(email)) {
      return res.status(400).json({ 
        error: 'Invalid email domain. Only gmail.com, icloud.com, and outlook.com are allowed.' 
      });
    }

    const user = await User.findOne({ email });
    const business = await Business.findOne({ email });
    
    if (!user && !business) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = user || business;
    if (account.isEmailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    try {
      const sent = await sendVerificationEmail(account, !!business);
      if (!sent) {
        return res.status(500).json({ error: 'Failed to send verification email' });
      }
    } catch (error) {
      return res.status(429).json({ error: error.message });
    }

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email domain
    if (!validateEmailDomain(email)) {
      return res.status(400).json({ 
        error: 'Invalid email domain. Only gmail.com, icloud.com, and outlook.com are allowed.' 
      });
    }

    // Check rate limit
    await checkEmailAttempts(email, 'password_reset');

    const user = await User.findOne({ email });
    const business = await Business.findOne({ email });
    
    if (!user && !business) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = user || business;
    const token = jwt.sign(
      { id: account._id },
      process.env.PASSWORD_RESET_SECRET,
      { expiresIn: '15m' }
    );

    const model = user ? User : Business;
    await model.findByIdAndUpdate(account._id, {
      passwordResetToken: token,
      passwordResetExpires: Date.now() + 15 * 60 * 1000
    });

    const name = user ? `${user.firstName} ${user.lastName}` : business.businessName;
    const template = passwordResetTemplate(name, token, process.env.BACKEND_URL);
    const sent = await sendEmail(email, template);

    if (!sent) {
      return res.status(500).json({ error: 'Failed to send password reset email' });
    }

    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    if (error.message.includes('Too many attempts')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const decoded = jwt.verify(req.params.token, process.env.PASSWORD_RESET_SECRET);

    const user = await User.findOne({
      _id: decoded.id,
      passwordResetToken: req.params.token,
      passwordResetExpires: { $gt: Date.now() }
    });

    const business = await Business.findOne({
      _id: decoded.id,
      passwordResetToken: req.params.token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user && !business) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const account = user || business;
    const model = user ? User : Business;

    // Validate new password
    const { validatePassword } = require('../../../utils/validation');
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    account.password = password;
    account.passwordResetToken = null;
    account.passwordResetExpires = null;
    await account.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

// Serve reset password page
router.get('/reset-password/:token', (req, res) => {
  const absolutePath = path.resolve(__dirname, '../../../public/reset-password.html');
  res.sendFile(absolutePath, (err) => {
    if (err) {
      console.error('Error sending file:', err);
      res.status(500).send('Error loading password reset page');
    }
  });
});

// Check authentication status
router.get('/auth-check', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.json({ isAuthenticated: false });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const model = decoded.type === 'user' ? User : Business;
    const account = await model.findById(decoded.userId);

    if (!account || !account.isEmailVerified) {
      return res.json({ isAuthenticated: false });
    }

    // For business accounts, also check approval status
    if (decoded.type === 'business' && !account.approved) {
      return res.json({ isAuthenticated: false });
    }

    res.json({ 
      isAuthenticated: true,
      accountType: decoded.type,
      id: account._id
    });
  } catch (error) {
    res.json({ isAuthenticated: false });
  }
});

module.exports = {
  router,
  sendVerificationEmail
}; 