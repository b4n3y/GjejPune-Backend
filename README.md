# Job Portal API

A job board backend build with Express Js and a Mongo DB database with Mongose, Email Verification, Role based auth rate limiting, and advanced security features.

## Features

### Authentication & Security
- JWT-based authentication
- Email verification system
- Password reset functionality
- Rate limiting for sensitive endpoints
- Domain-restricted email registration (gmail.com, icloud.com, outlook.com only)
- MongoDB-based rate limiting for email operations

### User Management
- User registration with email verification
- Business registration with approval system
- Profile management
- Interest-based job notifications (max 3 interests)
- Email verification required for all operations

### Job Management
- Job posting and management
- Job applications with status tracking
- Job categories with validation
- Application tracking
- Approval system for jobs

### Notifications
- Email notifications for verification
- Password reset emails
- Job application notifications
- New job notifications based on interests

## API Endpoints Documentation

### Authentication

#### Register User
```http
POST /v1/auth/user/register
```
Request:
```json
{
  "email": "user@gmail.com",
  "password": "StrongPass1!",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "interests": ["65d4a5e7c1f1c8c1a5f7b3d2"]
}
```
Response (201):
```json
{
  "message": "Registration successful. Please check your email for verification.",
  "userId": "65d4a5e7c1f1c8c1a5f7b3d1"
}
```
Error Responses:
```json
{
  "error": "Email, username, or phone number already registered"
}
```
```json
{
  "error": "Interest(s) with ID(s) 65d4a5e7c1f1c8c1a5f7b3d2 do not exist"
}
```

#### Register Business
```http
POST /v1/auth/business/register
```
Request:
```json
{
  "email": "business@gmail.com",
  "password": "StrongPass1!",
  "businessName": "Tech Corp",
  "businessType": "Technology",
  "contactPerson": {
    "name": "Jane Smith",
    "phoneNumber": "+1234567891",
    "position": "HR Manager"
  },
  "address": {
    "street": "123 Tech St",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94105",
    "country": "USA"
  }
}
```
Response (201):
```json
{
  "token": "eyJhbG...",
  "type": "business",
  "profile": {
    "id": "65d4a5e7c1f1c8c1a5f7b3d3",
    "businessName": "Tech Corp",
    "email": "business@gmail.com",
    "isEmailVerified": false,
    "approved": false
  },
  "expiresIn": "7 days"
}
```

#### User Login
```http
POST /v1/auth/user/login
```
Request:
```json
{
  "email": "user@gmail.com",
  "password": "StrongPass1!"
}
```
Response (200):
```json
{
  "token": "eyJhbG...",
  "user": {
    "id": "65d4a5e7c1f1c8c1a5f7b3d1",
    "email": "user@gmail.com",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "isEmailVerified": true
  },
  "expiresIn": "7 days"
}
```
Error Responses:
```json
{
  "error": "Invalid credentials"
}
```
```json
{
  "error": "Email not verified",
  "message": "Please verify your email address before logging in. Check your inbox for the verification link."
}
```

#### Business Login
```http
POST /v1/auth/business/login
```
Request:
```json
{
  "email": "business@gmail.com",
  "password": "StrongPass1!"
}
```
Response (200):
```json
{
  "token": "eyJhbG...",
  "type": "business",
  "profile": {
    "id": "65d4a5e7c1f1c8c1a5f7b3d3",
    "businessName": "Tech Corp",
    "email": "business@gmail.com",
    "isEmailVerified": true,
    "approved": true
  },
  "expiresIn": "7 days"
}
```
Error Responses:
```json
{
  "error": "Invalid credentials"
}
```
```json
{
  "error": "Email not verified",
  "message": "Please verify your email address before logging in. Check your inbox for the verification link."
}
```
```json
{
  "error": "Account pending approval",
  "message": "Your business account is pending approval. Please wait for administrator approval."
}
```

### Email Verification

#### Verify Email
```http
GET /v1/auth/verify-email/:token
```
Response (200):
```json
{
  "message": "Email verified successfully"
}
```

#### Resend Verification Email
```http
POST /v1/auth/resend-verification
```
Request:
```json
{
  "email": "user@gmail.com"
}
```
Response (200):
```json
{
  "message": "Verification email sent successfully"
}
```
Error Response (429):
```json
{
  "error": "Too many attempts. Please try again in 1 hour."
}
```

#### Request Password Reset
```http
POST /v1/auth/forgot-password
```
Request:
```json
{
  "email": "user@gmail.com"
}
```
Response (200):
```json
{
  "message": "Password reset email sent successfully"
}
```

#### Reset Password
```http
POST /v1/auth/reset-password/:token
```
Request:
```json
{
  "password": "NewStrongPass1!"
}
```
Response (200):
```json
{
  "message": "Password reset successfully"
}
```

### Profile Management

#### Get User Profile
```http
GET /v1/auth/user/profile
```
Response (200):
```json
{
  "id": "65d4a5e7c1f1c8c1a5f7b3d1",
  "email": "user@gmail.com",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "interests": [
    {
      "id": "65d4a5e7c1f1c8c1a5f7b3d2",
      "name": "Programming"
    }
  ],
  "isEmailVerified": true
}
```

#### Update User Profile
```http
PATCH /v1/auth/user/profile
```
Request:
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phoneNumber": "+1234567890",
  "interests": ["65d4a5e7c1f1c8c1a5f7b3d2"]
}
```
Response (200):
```json
{
  "id": "65d4a5e7c1f1c8c1a5f7b3d1",
  "email": "user@gmail.com",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Smith",
  "phoneNumber": "+1234567890",
  "interests": [
    {
      "id": "65d4a5e7c1f1c8c1a5f7b3d2",
      "name": "Programming"
    }
  ]
}
```

### Jobs

#### Create Job (Business Only)
```http
POST /v1/jobs
```
Request:
```json
{
  "title": "Senior Developer",
  "description": "We are looking for a senior developer...",
  "requirements": ["5+ years experience", "Node.js", "MongoDB"],
  "salary": "$120,000 - $150,000",
  "category": "65d4a5e7c1f1c8c1a5f7b3d2"
}
```
Response (201):
```json
{
  "id": "65d4a5e7c1f1c8c1a5f7b3d4",
  "title": "Senior Developer",
  "description": "We are looking for a senior developer...",
  "requirements": ["5+ years experience", "Node.js", "MongoDB"],
  "salary": "$120,000 - $150,000",
  "category": "65d4a5e7c1f1c8c1a5f7b3d2",
  "businessId": "65d4a5e7c1f1c8c1a5f7b3d3",
  "approved": false,
  "createdAt": "2024-02-20T10:00:00.000Z"
}
```

#### Get Jobs (Public)
```http
GET /v1/jobs?page=1&search=developer
```
Response (200):
```json
{
  "jobs": [{
    "id": "65d4a5e7c1f1c8c1a5f7b3d4",
    "title": "Senior Developer",
    "description": "We are looking for a senior developer...",
    "requirements": ["5+ years experience", "Node.js", "MongoDB"],
    "salary": "$120,000 - $150,000",
    "businessId": {
      "id": "65d4a5e7c1f1c8c1a5f7b3d3",
      "businessName": "Tech Corp"
    }
  }],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalJobs": 100,
    "perPage": 30,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### Apply for Job
```http
POST /v1/jobs/:id/apply
```
Response (201):
```json
{
  "message": "Application submitted successfully",
  "application": {
    "id": "65d4a5e7c1f1c8c1a5f7b3d5",
    "jobId": "65d4a5e7c1f1c8c1a5f7b3d4",
    "userId": "65d4a5e7c1f1c8c1a5f7b3d1",
    "status": "pending",
    "applicantDetails": {
      "fullName": "John Smith",
      "email": "user@gmail.com",
      "phoneNumber": "+1234567890"
    }
  }
}
```

### Job Categories

#### Get Categories
```http
GET /v1/jobs/categories
```
Response (200):
```json
{
  "categories": [
    {
      "id": "65d4a5e7c1f1c8c1a5f7b3d2",
      "name": "Programming",
      "slug": "programming",
      "description": "Software development and programming roles"
    }
  ]
}
```

### Notifications

#### Get Notifications
```http
GET /v1/notifications?page=1
```
Response (200):
```json
{
  "notifications": [{
    "id": "65d4a5e7c1f1c8c1a5f7b3d6",
    "type": "JOB_APPLICATION_RECEIVED",
    "title": "New Job Application",
    "message": "New application received for \"Senior Developer\"",
    "read": false,
    "createdAt": "2024-02-20T10:00:00.000Z",
    "metadata": {
      "jobId": "65d4a5e7c1f1c8c1a5f7b3d4",
      "jobTitle": "Senior Developer",
      "applicationId": "65d4a5e7c1f1c8c1a5f7b3d5"
    }
  }],
  "unreadCount": 1,
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalNotifications": 1,
    "perPage": 30,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

### Job Applications

#### Get My Applications (User)
```http
GET /v1/jobs/my-applications
```
Response (200):
```json
{
  "applications": [
    {
      "id": "65d4a5e7c1f1c8c1a5f7b3d5",
      "jobId": {
        "id": "65d4a5e7c1f1c8c1a5f7b3d4",
        "title": "Senior Developer",
        "description": "We are looking for a senior developer...",
        "salary": "$120,000 - $150,000"
      },
      "businessId": {
        "id": "65d4a5e7c1f1c8c1a5f7b3d3",
        "businessName": "Tech Corp"
      },
      "status": "pending",
      "createdAt": "2024-02-20T10:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalApplications": 100,
    "perPage": 30,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### Get Job Applications (Business)
```http
GET /v1/jobs/:id/applications
```
Response (200):
```json
{
  "applications": [
    {
      "id": "65d4a5e7c1f1c8c1a5f7b3d5",
      "jobId": "65d4a5e7c1f1c8c1a5f7b3d4",
      "status": "pending",
      "applicantDetails": {
        "fullName": "John Smith",
        "email": "user@gmail.com",
        "phoneNumber": "+1234567890"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalApplications": 75,
    "perPage": 30,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
Error Responses:
```json
{
  "error": "Job not found or unauthorized"
}
```
```json
{
  "error": "Only businesses can perform this action"
}
```

#### Update Application Status (Business)
```http
PATCH /v1/jobs/:jobId/applications/:applicationId
```
Request:
```json
{
  "status": "accepted" // or "rejected", "reviewed", "pending"
}
```
Response (200):
```json
{
  "id": "65d4a5e7c1f1c8c1a5f7b3d5",
  "jobId": "65d4a5e7c1f1c8c1a5f7b3d4",
  "status": "accepted",
  "applicantDetails": {
    "fullName": "John Smith",
    "email": "user@gmail.com",
    "phoneNumber": "+1234567890"
  },
  "updatedAt": "2024-02-20T10:30:00.000Z"
}
```
Error Responses:
```json
{
  "error": "Invalid status"
}
```
```json
{
  "error": "Application not found or unauthorized"
}
```

### Messages

#### Get Conversations List
```http
GET /v1/messages/conversations?page=1
```
Response (200):
```json
{
  "conversations": [
    {
      "application": {
        "id": "65d4a5e7c1f1c8c1a5f7b3d5",
        "status": "pending",
        "user": {
          "id": "65d4a5e7c1f1c8c1a5f7b3d1",
          "name": "John Doe"
        },
        "job": {
          "id": "65d4a5e7c1f1c8c1a5f7b3d4",
          "title": "Senior Developer",
          "business": {
            "id": "65d4a5e7c1f1c8c1a5f7b3d3",
            "name": "Tech Corp"
          }
        }
      },
      "unreadCount": 2,
      "lastMessage": {
        "content": "Thank you for your interest in the position",
        "createdAt": "2024-02-20T10:30:00.000Z"
      },
      "updatedAt": "2024-02-20T10:30:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalConversations": 100,
    "perPage": 30,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### Get Messages for a Conversation
```http
GET /v1/messages/:applicationId?page=1
```
Response (200):
```json
{
  "messages": [
    {
      "id": "65d4a5e7c1f1c8c1a5f7b3d6",
      "sender": "65d4a5e7c1f1c8c1a5f7b3d1",
      "senderModel": "User",
      "recipient": "65d4a5e7c1f1c8c1a5f7b3d3",
      "recipientModel": "Business",
      "jobApplication": "65d4a5e7c1f1c8c1a5f7b3d5",
      "content": "I'm very interested in learning more about the position",
      "read": true,
      "createdAt": "2024-02-20T10:00:00.000Z"
    },
    {
      "id": "65d4a5e7c1f1c8c1a5f7b3d7",
      "sender": "65d4a5e7c1f1c8c1a5f7b3d3",
      "senderModel": "Business",
      "recipient": "65d4a5e7c1f1c8c1a5f7b3d1",
      "recipientModel": "User",
      "jobApplication": "65d4a5e7c1f1c8c1a5f7b3d5",
      "content": "Thank you for your interest in the position",
      "read": false,
      "createdAt": "2024-02-20T10:30:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalMessages": 75,
    "perPage": 30,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
Error Responses:
```json
{
  "error": "Job application not found"
}
```
```json
{
  "error": "You do not have access to this conversation"
}
```

#### Send Message
```http
POST /v1/messages/:applicationId
```
Request:
```json
{
  "content": "I'm very interested in learning more about the position"
}
```
Response (201):
```json
{
  "id": "65d4a5e7c1f1c8c1a5f7b3d6",
  "sender": "65d4a5e7c1f1c8c1a5f7b3d1",
  "senderModel": "User",
  "recipient": "65d4a5e7c1f1c8c1a5f7b3d3",
  "recipientModel": "Business",
  "jobApplication": "65d4a5e7c1f1c8c1a5f7b3d5",
  "content": "I'm very interested in learning more about the position",
  "read": false,
  "createdAt": "2024-02-20T10:00:00.000Z"
}
```
Error Responses:
```json
{
  "error": "Message content is required"
}
```
```json
{
  "error": "Message content cannot exceed 2000 characters"
}
```
```json
{
  "error": "Job application not found"
}
```
```json
{
  "error": "You do not have access to this conversation"
}
```

#### Get Unread Messages Count
```http
GET /v1/messages/unread/count
```
Response (200):
```json
{
  "count": 5
}
```

### Message Features and Limitations

1. **Access Control**:
   - Users can only message businesses they've applied to
   - Businesses can only message users who've applied to their jobs
   - All messages are linked to specific job applications

2. **Message Limitations**:
   - Maximum message length: 2000 characters
   - Messages are text-only
   - Messages cannot be edited or deleted

3. **Pagination**:
   - 30 items per page for both conversations and messages
   - Sorted by most recent first
   - Includes total counts and page information

4. **Real-time Features**:
   - Messages are marked as read automatically when viewed
   - Unread message count is available
   - Last message preview in conversations list

5. **Notifications**:
   - Users receive notifications for new messages
   - Notifications include relevant metadata (job title, sender info)
   - Notifications are automatically created when messages are sent

### Testing the Messages API

1. **Prerequisites**:
   - User account with at least one job application
   - Business account with at least one received application
   - Valid JWT token in Authorization header

2. **Test Flow for User**:
   ```bash
   # 1. Get conversations list
   curl -X GET 'http://localhost:3000/v1/messages/conversations' \
   -H 'Authorization: Bearer YOUR_TOKEN'

   # 2. Get messages for a specific application
   curl -X GET 'http://localhost:3000/v1/messages/APPLICATION_ID' \
   -H 'Authorization: Bearer YOUR_TOKEN'

   # 3. Send a message
   curl -X POST 'http://localhost:3000/v1/messages/APPLICATION_ID' \
   -H 'Authorization: Bearer YOUR_TOKEN' \
   -H 'Content-Type: application/json' \
   -d '{"content": "Hello, I am interested in this position"}'

   # 4. Check unread messages count
   curl -X GET 'http://localhost:3000/v1/messages/unread/count' \
   -H 'Authorization: Bearer YOUR_TOKEN'
   ```

3. **Test Flow for Business**:
   ```bash
   # 1. Get conversations list
   curl -X GET 'http://localhost:3000/v1/messages/conversations' \
   -H 'Authorization: Bearer YOUR_TOKEN'

   # 2. Get messages for a specific application
   curl -X GET 'http://localhost:3000/v1/messages/APPLICATION_ID' \
   -H 'Authorization: Bearer YOUR_TOKEN'

   # 3. Reply to an application
   curl -X POST 'http://localhost:3000/v1/messages/APPLICATION_ID' \
   -H 'Authorization: Bearer YOUR_TOKEN' \
   -H 'Content-Type: application/json' \
   -d '{"content": "Thank you for your interest. When would you be available for an interview?"}'

   # 4. Check unread messages count
   curl -X GET 'http://localhost:3000/v1/messages/unread/count' \
   -H 'Authorization: Bearer YOUR_TOKEN'
   ```

## Rate Limiting

### Email Operations
- Verification emails: 3 attempts per email per hour
- Password reset emails: 3 attempts per email per hour
- Tracked in MongoDB with auto-expiration after 1 hour

### Authentication
- Login/Register: 5 requests per 15 minutes
- General API: 100 requests per 15 minutes
- Job applications: 10 per hour

## Installation & Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (copy .env.example to .env):
```env
# Core Configuration
MONGODB_URI=your-mongodb-uri
JWT_SECRET=your-jwt-secret
PORT=3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=400   # Maximum requests per window

# Email Configuration
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=your-email
SMTP_PASS=your-password
SMTP_FROM=Your Name <your-email>

# Security Secrets
EMAIL_VERIFICATION_SECRET=your-verification-secret
PASSWORD_RESET_SECRET=your-reset-secret

# Backend URL
BACKEND_URL=https://your-api-domain.com
```

4. Start the server:
```bash
npm run dev  # Development
npm start    # Production
```

## Security Features

- All passwords are hashed using bcrypt
- JWT tokens for authentication
- Rate limiting on sensitive endpoints
- Email domain restrictions
- MongoDB-based rate limiting for email operations
- Protected sensitive fields
- Input sanitization
- XSS protection
- CORS configuration
- Email verification required for all operations 
