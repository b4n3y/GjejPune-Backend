const express = require('express');
const Notification = require('../../models/Notification');
const { auth } = require('../../middleware/auth');

const router = express.Router();

// Get user's notifications
router.get('/', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * MAX_ITEMS_PER_PAGE;

    // Run count and find in parallel
    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: req.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(MAX_ITEMS_PER_PAGE)
        .select('-__v')
        .lean(),
      Notification.countDocuments({ recipient: req.userId })
    ]);

    const totalPages = Math.ceil(total / MAX_ITEMS_PER_PAGE);

    res.json({
      notifications,
      pagination: {
        currentPage: page,
        totalPages,
        totalNotifications: total,
        perPage: MAX_ITEMS_PER_PAGE,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark notifications as read
router.patch('/mark-read', auth, async (req, res) => {
  try {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds)) {
      return res.status(400).json({ error: 'notificationIds must be an array' });
    }

    await Notification.updateMany(
      { 
        _id: { $in: notificationIds },
        recipient: req.userId 
      },
      { $set: { read: true } }
    );

    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get unread notification count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      recipient: req.userId,
      read: false
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark all notifications as read
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipient: req.userId,
        read: false
      },
      {
        $set: { read: true }
      }
    );

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({
      recipient: req.userId,
      read: false
    });

    res.json({
      message: 'All notifications marked as read',
      unreadCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.userId
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found or unauthorized' });
    }

    const unreadCount = await Notification.countDocuments({
      recipient: req.userId,
      read: false
    });

    res.json({
      message: 'Notification deleted successfully',
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 