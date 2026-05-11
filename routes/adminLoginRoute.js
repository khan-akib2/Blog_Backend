const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');

// Admin login — no rate limiter applied (registered before authLimiter in server.js)
const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validateRequest,
];

router.post('/', validateLogin, login);

module.exports = router;
