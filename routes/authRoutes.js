const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateProfile,
  updateAvatar,
  sendOTP,
  verifyOTP,
  googleAuth,
  googleAuthToken,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validateRequest,
];

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/register', sendOTP); // alias
router.post('/login', validateLogin, login);
router.post('/google', googleAuth);
router.post('/google-token', googleAuthToken);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/avatar', protect, upload.single('avatar'), updateAvatar);

module.exports = router;
