require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

connectDB();

const app = express();

// Security
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));

// Rate limiting (disabled in development for easier testing)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: 'Too many requests', skip: () => process.env.NODE_ENV === 'development' });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts, please try again later', skip: () => process.env.NODE_ENV === 'development' });
app.use('/api/', limiter);
app.use('/api/auth', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin/login', require('./routes/adminLoginRoute')); // no rate limit for admin
app.use('/api/blogs', require('./routes/blogRoutes'));
app.use('/api/blogs/:blogId/comments', require('./routes/commentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/newsletter', require('./routes/subscriberRoutes'));

// ── Health / status ───────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'OK', message: 'BlogHub API is running' }));
app.get('/api', (req, res) => res.json({ status: 'OK', message: 'BlogHub API is running' }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`));
