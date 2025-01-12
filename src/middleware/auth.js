const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Business = require('../models/Business');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists and is email verified
    const model = decoded.type === 'user' ? User : Business;
    const account = await model.findById(decoded.userId);
    
    if (!account) {
      return res.status(401).json({ error: 'Account not found' });
    }

    if (!account.isEmailVerified) {
      return res.status(403).json({ 
        error: 'Email not verified',
        message: 'Please verify your email address before accessing this resource. Check your inbox for the verification link.'
      });
    }

    // For businesses, also check approval status
    if (decoded.type === 'business' && !account.approved) {
      return res.status(403).json({ 
        error: 'Account not approved',
        message: 'Your business account is pending approval. Please wait for administrator approval.'
      });
    }

    req.userId = decoded.userId;
    req.userType = decoded.type;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const ensureAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const adminToken = req.header('admin-token');

    if (!token || !adminToken) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify admin token using constant-time comparison
    const isValidAdminToken = require('crypto').timingSafeEqual(
      Buffer.from(adminToken),
      Buffer.from(process.env.ADMIN_SECRET)
    );

    if (!isValidAdminToken) {
      return res.status(403).json({ error: 'Invalid admin credentials' });
    }

    req.userId = decoded.userId;
    req.userType = decoded.type;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = {
  auth,
  ensureAdmin
}; 