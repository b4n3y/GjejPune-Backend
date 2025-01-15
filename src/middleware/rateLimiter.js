const rateLimit = require('express-rate-limit');

const windowMs = process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000; // 15 minutes default

// Function to get real IP address
const getRealIp = (req) => {
  // Priority order for IP headers:
  // 1. CF-Connecting-IP (Cloudflare)
  // 2. X-Forwarded-For (first IP in the list if present)
  // 3. req.ip (fallback)
  
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }

  if (req.headers['x-forwarded-for']) {
    // Get the first IP in the list (client's original IP)
    const forwardedIps = req.headers['x-forwarded-for'].split(',');
    return forwardedIps[0].trim();
  }

  return req.ip;
};

// Common configuration for handling proxy IPs
const commonConfig = {
  windowMs,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: getRealIp
};

// Rate limiter for authentication endpoints
const authLimiter = rateLimit({
  ...commonConfig,
  max: process.env.AUTH_RATE_LIMIT_MAX || 5,
  message: {
    error: 'Too many login/register attempts. Please try again after 15 minutes.'
  }
});

// Rate limiter for GET requests
const getRequestLimiter = rateLimit({
  ...commonConfig,
  max: process.env.GET_RATE_LIMIT_MAX || 100,
  message: {
    error: 'Too many GET requests. Please try again later.'
  },
  skip: (req) => req.method !== 'GET'
});

// Rate limiter for mutation requests (POST/PATCH/DELETE)
const mutationLimiter = rateLimit({
  ...commonConfig,
  max: process.env.MUTATION_RATE_LIMIT_MAX || 50,
  message: {
    error: 'Too many modification requests. Please try again later.'
  },
  skip: (req) => !['POST', 'PATCH', 'DELETE'].includes(req.method)
});

// Rate limiter for job applications
const applicationLimiter = rateLimit({
  ...commonConfig,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.JOB_APPLY_RATE_LIMIT_MAX || 10,
  message: { 
    error: 'Too many job applications. Please try again later.' 
  }
});

// Email verification rate limiter
const emailVerificationIpLimiter = rateLimit({
  ...commonConfig,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 verification emails per IP per hour
  message: { 
    error: 'Too many verification attempts from this IP. Please try again later.' 
  }
});

// Combined API limiter that applies different limits based on request type
const apiLimiter = (req, res, next) => {
  if (req.method === 'GET') {
    return getRequestLimiter(req, res, next);
  }
  return mutationLimiter(req, res, next);
};

module.exports = {
  authLimiter,
  getRequestLimiter,
  mutationLimiter,
  applicationLimiter,
  emailVerificationIpLimiter,
  apiLimiter
}; 