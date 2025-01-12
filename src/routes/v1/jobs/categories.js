const express = require('express');
const JobCategory = require('../../../models/JobCategory');

const router = express.Router();

const initialCategories = [
  {
    name: 'Programming',
    slug: 'programming',
    description: 'Software development and programming roles'
  },
  {
    name: 'Management',
    slug: 'management',
    description: 'Leadership and management positions'
  },
  {
    name: 'Design',
    slug: 'design',
    description: 'Graphic, UI/UX, and product design roles'
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    description: 'Digital marketing, SEO, and content creation'
  },
  {
    name: 'Engineering',
    slug: 'engineering',
    description: 'Engineering roles across various disciplines'
  },
  {
    name: 'Sales',
    slug: 'sales',
    description: 'Sales and business development roles'
  },
  {
    name: 'Customer Service',
    slug: 'customer-service',
    description: 'Customer support and service roles'
  },
  {
    name: 'Finance',
    slug: 'finance',
    description: 'Financial and accounting positions'
  }
];

const seedCategories = async () => {
  try {
    const count = await JobCategory.countDocuments();
    if (count === 0) {
      await JobCategory.insertMany(initialCategories);
      console.log('Job categories seeded successfully');
    }
  } catch (error) {
    console.error('Error seeding job categories:', error);
  }
};

seedCategories();

router.get('/', async (req, res) => {
  try {
    const categories = await JobCategory.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const category = await JobCategory.findOne({ slug: req.params.slug });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 