const express = require('express');
const Business = require('../../models/Business');
const { auth } = require('../../middleware/auth');

const router = express.Router();

// Helper function to parse filter conditions
const parseFilterConditions = (filter) => {
  if (!filter) return {};

  const conditions = {};
  const operators = {
    '=': '$eq',
    '!=': '$ne',
    '>': '$gt',
    '>=': '$gte',
    '<': '$lt',
    '<=': '$lte',
    'like': '$regex',
    'in': '$in',
    'nin': '$nin'
  };

  Object.entries(filter).forEach(([key, value]) => {
    if (typeof value === 'string' && value.includes('~')) {
      // Handle like operator with case insensitive
      conditions[key] = { $regex: value.replace(/~/g, ''), $options: 'i' };
    } else if (typeof value === 'string' && value.startsWith('in:')) {
      // Handle in operator
      conditions[key] = { $in: value.substring(3).split(',') };
    } else if (typeof value === 'string' && value.startsWith('nin:')) {
      // Handle not in operator
      conditions[key] = { $nin: value.substring(4).split(',') };
    } else if (typeof value === 'string' && value.startsWith('>=')) {
      conditions[key] = { $gte: value.substring(2) };
    } else if (typeof value === 'string' && value.startsWith('<=')) {
      conditions[key] = { $lte: value.substring(2) };
    } else if (typeof value === 'string' && value.startsWith('>')) {
      conditions[key] = { $gt: value.substring(1) };
    } else if (typeof value === 'string' && value.startsWith('<')) {
      conditions[key] = { $lt: value.substring(1) };
    } else if (typeof value === 'string' && value.startsWith('!=')) {
      conditions[key] = { $ne: value.substring(2) };
    } else {
      conditions[key] = value;
    }
  });

  return conditions;
};

// Public endpoint - Get all businesses with filtering
router.get('/public', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;
    const sort = req.query.sort ? JSON.parse(req.query.sort) : { businessName: 1 };
    
    // Parse filter from query
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const conditions = parseFilterConditions(filter);

    // Add text search if provided
    if (req.query.search) {
      conditions.$or = [
        { businessName: { $regex: req.query.search, $options: 'i' } },
        { businessType: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const businesses = await Business.find(conditions)
      .select('businessName businessType')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Business.countDocuments(conditions);
    const totalPages = Math.ceil(total / limit);

    res.json({
      businesses,
      pagination: {
        currentPage: page,
        totalPages,
        totalBusinesses: total,
        perPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filter: conditions
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Private endpoint - Get full business details (requires auth)
router.get('/:id', auth, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id).select('-password');

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Only allow access if the authenticated user is the same business
    if (req.userId !== business._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(business);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 