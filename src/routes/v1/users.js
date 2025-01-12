const express = require('express');
const User = require('../../models/User');
const { auth } = require('../../middleware/auth');
const Notification = require('../../models/Notification');
const JobApplication = require('../../models/JobApplication');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 30;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('username firstName accountType')
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();
    const totalPages = Math.ceil(total / limit);

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers: total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/account', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await Promise.all([
      User.findByIdAndDelete(req.userId),
      Notification.deleteMany({ recipient: req.userId }),
      JobApplication.deleteMany({ userId: req.userId })
    ]);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 