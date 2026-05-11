const express = require('express');
const router = express.Router();
const { subscribe, unsubscribe, getAllSubscribers } = require('../controllers/subscriberController');
const { protect, adminOnly } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Strict rate limit for subscribe — prevent abuse
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many subscription attempts, please try again later',
  skip: () => process.env.NODE_ENV === 'development',
});

router.post('/subscribe', subscribeLimiter, subscribe);
router.get('/unsubscribe', unsubscribe);
router.get('/subscribers', protect, adminOnly, getAllSubscribers);

module.exports = router;
