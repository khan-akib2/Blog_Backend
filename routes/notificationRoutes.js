const express = require('express');
const router = express.Router();
const { getNotifications, markRead, deleteNotification, getUnreadCount } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/:id/read', markRead); // id can be 'all' or a specific notification id
router.delete('/:id', deleteNotification);

module.exports = router;
