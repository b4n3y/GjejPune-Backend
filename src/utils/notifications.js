const Notification = require('../models/Notification');

const createNotification = async (data) => {
  try {
    // Handle batch notifications
    if (Array.isArray(data)) {
      // Use insertMany for better performance with batches
      return await Notification.insertMany(data, { ordered: false });
    }

    // Handle single notification
    const notification = new Notification(data);
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification(s):', error);
    return null;
  }
};

module.exports = {
  createNotification
}; 