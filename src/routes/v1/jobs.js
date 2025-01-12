const express = require('express');
const Job = require('../../models/Job');
const User = require('../../models/User');
const Business = require('../../models/Business');
const JobApplication = require('../../models/JobApplication');
const { auth, ensureAdmin } = require('../../middleware/auth');
const { createNotification } = require('../../utils/notifications');
const JobCategory = require('../../models/JobCategory');
const { applicationLimiter } = require('../../middleware/rateLimiter');
const mongoose = require('mongoose');
const { upload } = require('../../middleware/fileUpload');
const { uploadFile } = require('../../utils/s3');

const router = express.Router();

const MAX_ITEMS_PER_PAGE = 30; // Constant for max items per page

// Middleware to ensure the user is a business
const ensureBusiness = async (req, res, next) => {
  try {
    const business = await Business.findById(req.userId);
    if (!business || business.accountType !== 'business') {
      return res.status(403).json({ error: 'Only businesses can perform this action' });
    }

    // Check if business is approved
    if (!business.approved) {
      return res.status(403).json({ 
        error: 'Account not approved',
        message: 'Your business account must be approved before performing this action. Please wait for administrator approval.'
      });
    }

    req.business = business;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Middleware to ensure business owns the job
const ensureJobOwner = async (req, res, next) => {
  try {
    const jobId = req.params.id || req.params.jobId;
    const job = await Job.findOne({
      _id: jobId,
      businessId: req.userId
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found or unauthorized' });
    }
    
    req.job = job;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Middleware to ensure user has required profile fields
const ensureCompleteProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const missingFields = [];
    if (!user.firstName) missingFields.push('First Name');
    if (!user.lastName) missingFields.push('Last Name');
    if (!user.email) missingFields.push('Email');
    if (!user.phoneNumber) missingFields.push('Phone Number');

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Incomplete profile',
        missingFields,
        message: `Please complete your profile by adding: ${missingFields.join(', ')}`
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Middleware to ensure job is approved
const ensureJobApproved = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.approved) {
      return res.status(403).json({ 
        error: 'Job not approved',
        message: 'This job posting is pending approval and cannot accept applications yet.'
      });
    }

    req.job = job;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new job (business only)
router.post('/', auth, ensureBusiness, async (req, res) => {
  try {
    const { title, description, requirements, salary, category } = req.body;

    // Validate required fields
    const requiredFields = {
      title: title?.trim(),
      description: description?.trim(),
      requirements: Array.isArray(requirements) ? requirements.filter(r => r?.trim()).length > 0 : false,
      salary: salary?.trim(),
      category: category?.trim()
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

    // Validate requirements array
    if (!Array.isArray(requirements)) {
      return res.status(400).json({
        error: 'Invalid requirements format',
        details: 'Requirements must be an array of strings'
      });
    }

    // Reject if someone tries to set approved to true
    if (req.body.approved === true) {
      return res.status(403).json({ 
        error: 'Not allowed',
        details: 'Setting approved status is not allowed. Jobs must go through the approval process.'
      });
    }

    // Validate category existence using lean query
    const jobCategory = await JobCategory.findById(category)
      .select('name')
      .lean()
      .hint({ _id: 1 });

    if (!jobCategory) {
      return res.status(400).json({ 
        error: 'Invalid category',
        details: 'The specified job category does not exist'
      });
    }

    // Create job document
    const job = new Job({
      businessId: req.userId,
      title: title.trim(),
      description: description.trim(),
      requirements: requirements.map(req => req.trim()).filter(req => req), // Remove empty requirements
      salary: salary.trim(),
      category,
      approved: false
    });

    // Save job first
    const savedJob = await job.save();

    // Find interested users in background
    // Use projection and lean for better performance
    User.find({ interests: category })
      .select('_id')
      .lean()
      .hint({ interests: 1 })
      .then(users => {
        if (users.length > 0) {
          // Batch create notifications
          const notifications = users.map(user => ({
            recipient: user._id,
            recipientModel: 'User',
            type: 'NEW_JOB_IN_INTEREST',
            title: 'New Job in Your Interest Area',
            message: `A new job "${title}" has been posted in ${jobCategory.name}`,
            metadata: {
              jobId: savedJob._id,
              jobTitle: title,
              categoryId: category,
              categoryName: jobCategory.name
            }
          }));

          // Create notifications in background without awaiting
          createNotification(notifications).catch(error => 
            console.error('Error creating notifications:', error)
          );
        }
      })
      .catch(error => console.error('Error finding interested users:', error));

    res.status(201).json(savedJob);
  } catch (error) {
    console.error('Job creation error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid data format',
        details: `Invalid format for field: ${error.path}`
      });
    }
    res.status(500).json({ 
      error: 'Server error',
      details: 'An unexpected error occurred while creating the job posting'
    });
  }
});

// Get all jobs with search (public endpoint)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * MAX_ITEMS_PER_PAGE;

    const conditions = {
      approved: true // Only show approved jobs
    };

    // Add category filter if provided
    if (req.query.category) {
      conditions.category = req.query.category;
    }

    // Add business filter if provided
    if (req.query.business) {
      conditions.businessId = req.query.business;
    }

    // Text search
    if (req.query.search) {
      conditions.$text = { $search: req.query.search };
    }

    // Determine sort order
    const sort = {};
    if (req.query.search) {
      sort.score = { $meta: 'textScore' };
    } else if (req.query.sort === 'salary') {
      sort.salary = req.query.order === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = -1;
    }

    // Run count and find in parallel
    const [jobs, total] = await Promise.all([
      Job.find(conditions)
        .select(req.query.search ? { score: { $meta: 'textScore' } } : '')
        .sort(sort)
        .skip(skip)
        .limit(MAX_ITEMS_PER_PAGE)
        .populate('businessId', 'businessName')
        .lean(),
      Job.countDocuments(conditions)
    ]);

    const totalPages = Math.ceil(total / MAX_ITEMS_PER_PAGE);

    res.json({
      jobs,
      pagination: {
        currentPage: page,
        totalPages,
        totalJobs: total,
        perPage: MAX_ITEMS_PER_PAGE,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get business's own jobs (authenticated, business only)
router.get('/my-jobs', auth, ensureBusiness, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * MAX_ITEMS_PER_PAGE;

    // Run count and find in parallel
    const [jobs, total] = await Promise.all([
      Job.find({ businessId: req.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(MAX_ITEMS_PER_PAGE)
        .lean(),
      Job.countDocuments({ businessId: req.userId })
    ]);

    const totalPages = Math.ceil(total / MAX_ITEMS_PER_PAGE);

    res.json({
      jobs,
      pagination: {
        currentPage: page,
        totalPages,
        totalJobs: total,
        perPage: MAX_ITEMS_PER_PAGE,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single job (public endpoint)
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      approved: true
    }).populate('businessId', 'businessName');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update job (business only, own jobs only)
router.put('/:id', auth, ensureBusiness, async (req, res) => {
  try {
    const { title, description, requirements, salary } = req.body;

    // Validate required fields
    const requiredFields = {
      title: title?.trim(),
      description: description?.trim(),
      requirements: Array.isArray(requirements) ? requirements.filter(r => r?.trim()).length > 0 : false,
      salary: salary?.trim()
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

    // Validate requirements array
    if (!Array.isArray(requirements)) {
      return res.status(400).json({
        error: 'Invalid requirements format',
        details: 'Requirements must be an array of strings'
      });
    }
    
    const job = await Job.findOne({
      _id: req.params.id,
      businessId: req.userId
    });

    if (!job) {
      return res.status(404).json({ 
        error: 'Job not found',
        details: 'The job posting was not found or you do not have permission to edit it'
      });
    }

    job.title = title.trim();
    job.description = description.trim();
    job.requirements = requirements.map(req => req.trim()).filter(req => req);
    job.salary = salary.trim();

    await job.save();
    res.json(job);
  } catch (error) {
    console.error('Job update error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid data format',
        details: `Invalid format for field: ${error.path}`
      });
    }
    res.status(500).json({ 
      error: 'Server error',
      details: 'An unexpected error occurred while updating the job posting'
    });
  }
});

// Delete job (business only, own jobs only)
router.delete('/:id', auth, ensureBusiness, async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      businessId: req.userId
    }).populate('businessId', 'businessName');

    if (!job) {
      return res.status(404).json({ error: 'Job not found or unauthorized' });
    }

    // Get all applications for this job
    const applications = await JobApplication.find({ jobId: job._id })
      .populate('userId', 'firstName lastName');
    
    // Create notifications for all applicants
    const notificationPromises = applications.map(application => 
      createNotification({
        recipient: application.userId._id,
        recipientModel: 'User',
        type: 'JOB_DELETED',
        title: 'Job Posting Deleted',
        message: `The job "${job.title}" at ${job.businessId.businessName} you applied for has been deleted`,
        metadata: {
          jobId: job._id,
          jobTitle: job.title,
          businessName: job.businessId.businessName,
          businessId: job.businessId._id,
          applicationId: application._id
        }
      })
    );

    // Delete job and all associated data, and send notifications
    await Promise.all([
      Job.findByIdAndDelete(job._id),
      JobApplication.deleteMany({ jobId: job._id }),
      ...notificationPromises
    ]);

    res.json({ message: 'Job and associated data deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Apply for a job
router.post('/:id/apply', auth, upload.single('cv'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.userId;
    const { coverLetter } = req.body;

    // Validate cover letter
    if (!coverLetter?.trim()) {
      return res.status(400).json({
        error: 'Missing cover letter',
        details: 'A cover letter is required for your job application'
      });
    }

    // Check if job exists and is approved
    const job = await Job.findOne({ _id: jobId, approved: true })
      .populate('businessId', 'businessName')
      .lean();

    if (!job) {
      return res.status(404).json({ 
        error: 'Job not found',
        details: 'The job posting was not found or is not yet approved'
      });
    }

    if (!job.businessId) {
      return res.status(400).json({ 
        error: 'Invalid job posting',
        details: 'This job posting is invalid as it has no associated business'
      });
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        details: 'Your user account could not be found'
      });
    }

    // Check if user has already applied
    const existingApplication = await JobApplication.findOne({ userId, jobId });
    if (existingApplication) {
      return res.status(400).json({ 
        error: 'Duplicate application',
        details: 'You have already applied for this job'
      });
    }

    // Check if user has a CV
    let cvUrl = user.cv;

    // If CV is provided in request, upload it
    if (req.file) {
      try {
        cvUrl = await uploadFile(req.file, 'cvs');
      } catch (error) {
        console.error('CV upload error:', error);
        return res.status(500).json({ 
          error: 'CV upload failed',
          details: 'Failed to upload your CV. Please try again.'
        });
      }
    }

    // Ensure CV exists either from user profile or upload
    if (!cvUrl) {
      return res.status(400).json({ 
        error: 'CV required',
        details: 'Please upload a CV with your application or add one to your profile first'
      });
    }

    // Create job application
    const application = new JobApplication({
      userId,
      jobId,
      cv: cvUrl,
      phoneNumber: user.phoneNumber,
      coverLetter: coverLetter.trim()
    });

    await application.save();

    // Create notification for the business
    try {
      await createNotification({
        recipient: job.businessId._id,
        recipientModel: 'Business',
        type: 'NEW_APPLICATION',
        title: 'New Job Application',
        message: `${user.firstName} ${user.lastName} has applied for "${job.title}"`,
        metadata: {
          jobId: job._id,
          jobTitle: job.title,
          applicationId: application._id,
          applicantName: `${user.firstName} ${user.lastName}`,
          applicantId: user._id,
          applicantEmail: user.email,
          applicantPhone: user.phoneNumber,
          cvUrl: cvUrl
        }
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
      // Continue even if notification fails
    }

    // Clean up and structure the response
    const cleanedApplication = {
      id: application._id,
      job: {
        id: job._id,
        title: job.title,
        business: {
          id: job.businessId._id,
          name: job.businessId.businessName
        }
      },
      status: application.status,
      cv: cvUrl,
      coverLetter: application.coverLetter,
      appliedAt: application.appliedAt
    };

    res.status(201).json(cleanedApplication);
  } catch (error) {
    console.error('Job application error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: 'Invalid data format',
        details: `Invalid format for field: ${error.path}`
      });
    }
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'Duplicate application',
        details: 'You have already applied for this job'
      });
    }
    res.status(500).json({ 
      error: 'Server error',
      details: 'An unexpected error occurred while submitting your application'
    });
  }
});

// Get applications for a job (business only)
router.get('/:id/applications', auth, ensureBusiness, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * MAX_ITEMS_PER_PAGE;

    // Verify job exists and belongs to business
    const job = await Job.findOne({ 
      _id: req.params.id,
      businessId: req.userId 
    }).lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Run count and find in parallel
    const [applications, total] = await Promise.all([
      JobApplication.find({ jobId: req.params.id })
        .sort({ appliedAt: -1 })
        .skip(skip)
        .limit(MAX_ITEMS_PER_PAGE)
        .populate('userId', 'firstName lastName email phoneNumber')
        .lean(),
      JobApplication.countDocuments({ jobId: req.params.id })
    ]);

    const totalPages = Math.ceil(total / MAX_ITEMS_PER_PAGE);

    // Clean up response
    const cleanedApplications = applications.map(app => ({
      id: app._id,
      applicant: {
        id: app.userId._id,
        firstName: app.userId.firstName,
        lastName: app.userId.lastName,
        email: app.userId.email,
        phoneNumber: app.userId.phoneNumber
      },
      status: app.status,
      cv: app.cv,
      coverLetter: app.coverLetter,
      appliedAt: app.appliedAt
    }));

    res.json({
      applications: cleanedApplications,
      pagination: {
        currentPage: page,
        totalPages,
        totalApplications: total,
        perPage: MAX_ITEMS_PER_PAGE,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's job applications
router.get('/my-applications', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * MAX_ITEMS_PER_PAGE;

    // Run count and find in parallel
    const [applications, total] = await Promise.all([
      JobApplication.find({ userId: req.userId })
        .sort({ appliedAt: -1 })
        .skip(skip)
        .limit(MAX_ITEMS_PER_PAGE)
        .populate({
          path: 'jobId',
          select: 'title businessId',
          populate: {
            path: 'businessId',
            select: 'businessName'
          }
        })
        .lean(),
      JobApplication.countDocuments({ userId: req.userId })
    ]);

    const totalPages = Math.ceil(total / MAX_ITEMS_PER_PAGE);

    // Clean up response
    const cleanedApplications = applications.map(app => ({
      id: app._id,
      job: {
        id: app.jobId._id,
        title: app.jobId.title,
        business: {
          id: app.jobId.businessId._id,
          name: app.jobId.businessId.businessName
        }
      },
      status: app.status,
      cv: app.cv,
      coverLetter: app.coverLetter,
      appliedAt: app.appliedAt
    }));

    res.json({
      applications: cleanedApplications,
      pagination: {
        currentPage: page,
        totalPages,
        totalApplications: total,
        perPage: MAX_ITEMS_PER_PAGE,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update application status (business only, must own the job)
router.patch('/:jobId/applications/:applicationId', auth, ensureBusiness, ensureJobOwner, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const application = await JobApplication.findOne({
      _id: req.params.applicationId,
      jobId: req.params.jobId
    }).populate({
      path: 'jobId',
      select: 'title businessId',
      populate: {
        path: 'businessId',
        select: 'businessName'
      }
    }).populate('userId', 'firstName lastName');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Verify the job belongs to the business
    if (application.jobId.businessId._id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized to update this application' });
    }

    const oldStatus = application.status;
    application.status = status;
    await application.save();

    // Only send notification if status actually changed
    if (oldStatus !== status) {
      try {
        // Create notification for the applicant
        await createNotification({
          recipient: application.userId._id,
          recipientModel: 'User',
          type: 'APPLICATION_STATUS_UPDATED',
          title: `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
          message: `Your application for "${application.jobId.title}" at ${application.jobId.businessId.businessName} has been ${status}`,
          metadata: {
            jobId: application.jobId._id,
            jobTitle: application.jobId.title,
            applicationId: application._id,
            status,
            businessName: application.jobId.businessId.businessName,
            businessId: application.jobId.businessId._id
          }
        });
      } catch (error) {
        console.error('Failed to create notification:', error);
        // Continue even if notification fails
      }
    }

    // Clean up and structure the response
    const cleanedApplication = {
      id: application._id,
      status: application.status,
      job: {
        id: application.jobId._id,
        title: application.jobId.title,
        business: {
          id: application.jobId.businessId._id,
          name: application.jobId.businessId.businessName
        }
      },
      applicant: {
        id: application.userId._id,
        firstName: application.userId.firstName,
        lastName: application.userId.lastName
      },
      updatedAt: application.updatedAt
    };

    res.json(cleanedApplication);
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve or reject job (admin only)
router.patch('/:id/approval', auth, ensureAdmin, async (req, res) => {
  try {
    const { approved } = req.body;
    
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Approved status must be a boolean' });
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update job approval status
    job.approved = approved;
    await job.save();

    // Create notification for the business
    await createNotification({
      recipient: job.businessId,
      recipientModel: 'Business',
      type: approved ? 'JOB_APPROVED' : 'JOB_REJECTED',
      title: approved ? 'Job Posting Approved' : 'Job Posting Rejected',
      message: approved 
        ? `Your job posting "${job.title}" has been approved and is now visible to the public.`
        : `Your job posting "${job.title}" has been rejected. Please contact support for more information.`,
      metadata: {
        jobId: job._id,
        jobTitle: job.title
      }
    });

    res.json({
      message: `Job ${approved ? 'approved' : 'rejected'} successfully`,
      job
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 