require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { sanitizeMiddleware, securityHeaders } = require('./middleware/security');
const { 
  apiLimiter, 
  authLimiter, 
  applicationLimiter 
} = require('./middleware/rateLimiter');
const userRoutes = require('./routes/v1/auth/user');
const businessRoutes = require('./routes/v1/auth/business');
const usersListRoute = require('./routes/v1/users');
const businessesListRoute = require('./routes/v1/businesses');
const jobsRoute = require('./routes/v1/jobs');
const jobCategoriesRoute = require('./routes/v1/jobs/categories');
const notificationsRoute = require('./routes/v1/notifications');
const messagesRoute = require('./routes/v1/messages');
const { router: verificationRoutes } = require('./routes/v1/auth/verification');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (needed for DigitalOcean App Platform)
app.set('trust proxy', 1);

// Security middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'admin-token'],
  credentials: true // Enable credentials for production CORS
}));
app.use(express.json({ limit: '10kb' })); // Limit payload size

// Serve static files from public directory
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath, {
  index: false,
  extensions: ['html', 'htm']
}));

app.use(sanitizeMiddleware);
app.use(securityHeaders);

// Apply rate limiting
app.use(apiLimiter); // This will handle both GET and mutation rate limits
app.use('/v1/auth', authLimiter); // Specific limit for auth routes
app.use('/v1/jobs/:jobId/apply', applicationLimiter); // Specific limit for job applications

// Database connection with security options
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: process.env.NODE_ENV === 'production' ? 50 : 10,
  minPoolSize: process.env.NODE_ENV === 'production' ? 10 : 1,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/v1/auth/user', userRoutes);
app.use('/v1/auth/business', businessRoutes);
app.use('/v1/users', usersListRoute);
app.use('/v1/businesses', businessesListRoute);
app.use('/v1/jobs', jobsRoute);
app.use('/v1/jobs/categories', jobCategoriesRoute);
app.use('/v1/notifications', notificationsRoute);
app.use('/v1/messages', messagesRoute);
app.use('/v1/auth', verificationRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the API',
    version: 'v1',
    endpoints: {
      user: {
        register: '/v1/auth/user/register',
        login: '/v1/auth/user/login',
        profile: '/v1/auth/user/profile',
        updateProfile: '/v1/auth/user/profile (PATCH)'
      },
      business: {
        register: '/v1/auth/business/register',
        login: '/v1/auth/business/login',
        profile: '/v1/auth/business/profile',
        updateProfile: '/v1/auth/business/profile (PATCH)'
      },
      notifications: {
        list: '/v1/notifications?page=1',
        markRead: '/v1/notifications/mark-read',
        markAllRead: '/v1/notifications/mark-all-read'
      },
      messages: {
        conversations: '/v1/messages/conversations?page=1',
        messages: '/v1/messages/:applicationId?page=1',
        send: '/v1/messages/:applicationId',
        unreadCount: '/v1/messages/unread/count'
      },
      lists: {
        users: '/v1/users?page=1',
        publicBusinesses: '/v1/businesses/public?page=1',
        businessProfile: '/v1/businesses/:id'
      },
      jobs: {
        list: '/v1/jobs?page=1',
        create: '/v1/jobs',
        myJobs: '/v1/jobs/my-jobs',
        single: '/v1/jobs/:id',
        update: '/v1/jobs/:id',
        delete: '/v1/jobs/:id'
      },
      categories: {
        list: '/v1/jobs/categories',
        single: '/v1/jobs/categories/:slug'
      }
    },
    rateLimiting: {
      auth: '5 requests per 15 minutes for login and register endpoints',
      api: '100 requests per 15 minutes for general endpoints',
      applications: '10 job applications per hour'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
}); 