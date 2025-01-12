// Update business approval status
router.patch('/businesses/:id/approval', auth, ensureAdmin, async (req, res) => {
  try {
    const { approved } = req.body;
    
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Approved status must be a boolean' });
    }

    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    business.approved = approved;
    await business.save();

    // Create notification for the business
    try {
      await createNotification({
        recipient: business._id,
        recipientModel: 'Business',
        type: approved ? 'BUSINESS_APPROVED' : 'BUSINESS_REJECTED',
        title: approved ? 'Account Approved' : 'Account Rejected',
        message: approved 
          ? 'Your business account has been approved. You can now post jobs and manage applications.'
          : 'Your business account has been rejected. Please contact support for more information.',
        metadata: {
          businessId: business._id,
          businessName: business.businessName,
          approved
        }
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
      // Continue even if notification fails
    }

    res.json({
      message: `Business ${approved ? 'approved' : 'rejected'} successfully`,
      business
    });
  } catch (error) {
    console.error('Business approval error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}); 