const Notification = require('../models/Notification');

// @desc  Get notifications for logged-in user
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Notification.countDocuments({ recipient: req.user._id });
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });

    const notifications = await Notification.find({ recipient: req.user._id })
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('blog', 'title slug');

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// @desc  Mark notification(s) as read
exports.markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === 'all') {
      await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    } else {
      await Notification.findOneAndUpdate(
        { _id: id, recipient: req.user._id },
        { isRead: true }
      );
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// @desc  Delete a notification
exports.deleteNotification = async (req, res, next) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// @desc  Get unread count only (lightweight poll)
exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    res.json({ success: true, count });
  } catch (error) {
    next(error);
  }
};
