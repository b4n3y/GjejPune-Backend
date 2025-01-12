const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 5,
  message: {
    error: 'Too many login/register attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Rate limiter for job applications
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 applications per hour
  message: { error: 'Too many job applications. Please try again later.' }
});

// Rate limiter for general API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { error: 'Too many requests. Please try again later.' }
});

// Rate limiter for email verification (IP-based)
const emailVerificationIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 verification emails per IP per hour
  message: { error: 'Too many verification attempts from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Store for tracking email-based rate limiting
const emailVerificationStore = new Map();

// Email-based rate limiter function
const emailVerificationLimiter = (email) => {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  
  // Clean up old entries
  for (const [key, value] of emailVerificationStore.entries()) {
    if (value.timestamp < hourAgo) {
      emailVerificationStore.delete(key);
    }
  }
  
  const emailRecord = emailVerificationStore.get(email) || { count: 0, timestamp: now };
  
  if (emailRecord.timestamp < hourAgo) {
    emailRecord.count = 1;
    emailRecord.timestamp = now;
  } else if (emailRecord.count >= 3) {
    return false;
  } else {
    emailRecord.count += 1;
  }
  
  emailVerificationStore.set(email, emailRecord);
  return true;
};

// Validate email domain
const validateEmailDomain = (email) => {
  const allowedDomains = ['gmail.com', 'icloud.com', 'outlook.com'];
  const domain = email.split('@')[1]?.toLowerCase();
  return allowedDomains.includes(domain);
};

module.exports = {
  authLimiter,
  applicationLimiter,
  apiLimiter,
  emailVerificationIpLimiter,
  emailVerificationLimiter,
  validateEmailDomain
}; 