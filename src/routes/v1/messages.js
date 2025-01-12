const express = require('express');
const mongoose = require('mongoose');
const Message = require('../../models/Message');
const JobApplication = require('../../models/JobApplication');
const { auth } = require('../../middleware/auth');
const { createNotification } = require('../../utils/notifications');
const { Types: { ObjectId } } = mongoose;

const router = express.Router();

const MAX_ITEMS_PER_PAGE = 30;

// Cache for application access checks (5 minute TTL)
const accessCache = new Map();
const ACCESS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to get job IDs for a business
async function getBusinessJobs(businessId) {
  const jobs = await mongoose.model('Job').find({ businessId }, '_id').lean();
  return jobs.map(job => job._id);
}

// Middleware to ensure the user has access to the conversation
const ensureConversationAccess = async (req, res, next) => {
  try {
    const applicationId = req.params.applicationId || req.body.applicationId;
    const userId = req.userId;
    const userType = req.userType;

    // Check cache first
    const cacheKey = `${applicationId}:${userId}:${userType}`;
    const cachedAccess = accessCache.get(cacheKey);
    
    if (cachedAccess) {
      if (cachedAccess.hasAccess) {
        req.application = cachedAccess.application;
        return next();
      }
      return res.status(403).json({ error: 'You do not have access to this conversation' });
    }

    // If not in cache, check database
    const application = await JobApplication.findById(applicationId)
      .select('userId jobId')
      .populate('jobId', 'businessId title')
      .lean();

    if (!application) {
      return res.status(404).json({ error: 'Job application not found' });
    }

    let hasAccess = false;
    if (userType === 'user') {
      hasAccess = application.userId.toString() === userId;
    } else {
      hasAccess = application.jobId.businessId.toString() === userId;
    }

    // Cache the result
    accessCache.set(cacheKey, { hasAccess, application, timestamp: Date.now() });

    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this conversation' });
    }

    req.application = application;
    next();
  } catch (error) {
    console.error('Access check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of accessCache.entries()) {
    if (now - value.timestamp > ACCESS_CACHE_TTL) {
      accessCache.delete(key);
    }
  }
}, ACCESS_CACHE_TTL);

// Get conversations list (applications with messages)
router.get('/conversations', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * MAX_ITEMS_PER_PAGE;
    const userType = req.userType;
    const userId = new ObjectId(req.userId);

    // Use aggregation pipeline for better performance
    const [conversations, totalResult] = await Promise.all([
      JobApplication.aggregate([
        // Match applications with messages for the current user
        {
          $match: userType === 'user' 
            ? { userId }
            : { jobId: { $in: await getBusinessJobs(userId) } }
        },
        // Lookup messages and only get necessary fields
        {
          $lookup: {
            from: 'messages',
            let: { appId: '$_id' },
            pipeline: [
              { 
                $match: { 
                  $expr: { $eq: ['$jobApplication', '$$appId'] }
                }
              },
              { $sort: { createdAt: -1 } },
              { $limit: 1 }
            ],
            as: 'lastMessage'
          }
        },
        // Only include applications with messages
        {
          $match: {
            'lastMessage.0': { $exists: true }
          }
        },
        // Get unread count efficiently
        {
          $lookup: {
            from: 'messages',
            let: { appId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$jobApplication', '$$appId'] },
                      { $eq: ['$recipient', userId] },
                      { $eq: ['$read', false] }
                    ]
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'unreadCount'
          }
        },

        {
          $lookup: {
            from: 'users',
            let: { userId: '$userId' },
            pipeline: [
              { 
                $match: { 
                  $expr: { $eq: ['$_id', '$$userId'] }
                }
              },
              {
                $project: {
                  firstName: 1,
                  lastName: 1
                }
              }
            ],
            as: 'user'
          }
        },

        {
          $lookup: {
            from: 'jobs',
            let: { jobId: '$jobId' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$jobId'] }
                }
              },
              {
                $lookup: {
                  from: 'businesses',
                  let: { businessId: '$businessId' },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ['$_id', '$$businessId'] }
                      }
                    },
                    {
                      $project: {
                        businessName: 1
                      }
                    }
                  ],
                  as: 'business'
                }
              },
              {
                $project: {
                  title: 1,
                  business: { $arrayElemAt: ['$business', 0] }
                }
              }
            ],
            as: 'job'
          }
        },

        {
          $project: {
            _id: 1,
            status: 1,
            updatedAt: 1,
            user: { $arrayElemAt: ['$user', 0] },
            job: { $arrayElemAt: ['$job', 0] },
            lastMessage: { $arrayElemAt: ['$lastMessage', 0] },
            unreadCount: { 
              $ifNull: [
                { $arrayElemAt: ['$unreadCount.count', 0] },
                0
              ]
            }
          }
        },
        // Sort by last message date
        { $sort: { 'lastMessage.createdAt': -1 } },
        // Pagination
        { $skip: skip },
        { $limit: MAX_ITEMS_PER_PAGE }
      ]).allowDiskUse(true),

      // Get total count efficiently
      JobApplication.aggregate([
        {
          $match: userType === 'user'
            ? { userId }
            : { 'jobId.businessId': userId }
        },
        {
          $lookup: {
            from: 'messages',
            localField: '_id',
            foreignField: 'jobApplication',
            as: 'hasMessages'
          }
        },
        {
          $match: {
            'hasMessages.0': { $exists: true }
          }
        },
        { $count: 'total' }
      ]).allowDiskUse(true)
    ]);

    // Format the response
    const conversationsFormatted = conversations.map(conv => ({
      application: {
        id: conv._id,
        status: conv.status,
        user: {
          id: conv.user._id,
          name: `${conv.user.firstName} ${conv.user.lastName}`
        },
        job: {
          id: conv.job._id,
          title: conv.job.title,
          business: {
            id: conv.job.business._id,
            name: conv.job.business.businessName
          }
        }
      },
      unreadCount: conv.unreadCount,
      lastMessage: conv.lastMessage ? {
        content: conv.lastMessage.content,
        createdAt: conv.lastMessage.createdAt,
        isOwnMessage: conv.lastMessage.sender.toString() === req.userId &&
                     conv.lastMessage.senderModel === (userType === 'user' ? 'User' : 'Business')
      } : null,
      updatedAt: conv.updatedAt
    }));

    const totalCount = totalResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / MAX_ITEMS_PER_PAGE);

    res.json({
      conversations: conversationsFormatted,
      pagination: {
        currentPage: page,
        totalPages,
        totalConversations: totalCount,
        perPage: MAX_ITEMS_PER_PAGE,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a specific application
router.get('/:applicationId', auth, ensureConversationAccess, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * MAX_ITEMS_PER_PAGE;
    const applicationId = new ObjectId(req.params.applicationId);

    // Use a single aggregation pipeline for better performance
    const result = await Message.aggregate([
      {
        $match: {
          jobApplication: applicationId
        }
      },
      {
        $facet: {
          messages: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: MAX_ITEMS_PER_PAGE }
          ],
          totalCount: [
            { $count: 'count' }
          ]
        }
      }
    ]).hint({ jobApplication: 1, createdAt: -1 });

    const messages = result[0].messages;
    const total = result[0].totalCount[0]?.count || 0;

    // Mark messages as read in a separate operation
    if (messages.length > 0) {
      Message.updateMany(
        {
          jobApplication: applicationId,
          recipient: req.userId,
          read: false
        },
        { $set: { read: true } }
      ).hint({ jobApplication: 1, recipient: 1, read: 1 }).exec();
    }

    const totalPages = Math.ceil(total / MAX_ITEMS_PER_PAGE);

    res.json({
      messages,
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages: total,
        perPage: MAX_ITEMS_PER_PAGE,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a message
router.post('/:applicationId', auth, ensureConversationAccess, async (req, res) => {
  try {
    const { content } = req.body;
    const application = req.application;
    const userType = req.userType;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message content cannot exceed 2000 characters' });
    }

    // Determine sender and recipient based on user type
    const sender = req.userId;
    const senderModel = userType === 'user' ? 'User' : 'Business';
    const recipient = userType === 'user' 
      ? application.jobId.businessId 
      : application.userId;
    const recipientModel = userType === 'user' ? 'Business' : 'User';

    // Create message first
    const message = await Message.create({
      sender,
      senderModel,
      recipient,
      recipientModel,
      jobApplication: application._id,
      content: content.trim()
    });

    // Then update application and create notification in parallel
    await Promise.all([
      JobApplication.updateOne(
        { _id: application._id },
        { $set: { updatedAt: new Date() } }
      ),
      createNotification({
        recipient,
        recipientModel,
        type: 'NEW_MESSAGE',
        title: 'New Message',
        message: `You have a new message regarding the application for "${application.jobId.title}"`,
        metadata: {
          messageId: message._id,
          applicationId: application._id,
          jobId: application.jobId._id,
          jobTitle: application.jobId.title,
          senderId: sender,
          senderModel
        }
      }).catch(error => {
        console.error('Failed to create notification:', error);
        // Continue even if notification fails
      })
    ]);

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get unread messages count
router.get('/unread/count', auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      recipient: req.userId,
      read: false
    }).hint({ recipient: 1, read: 1 });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 
