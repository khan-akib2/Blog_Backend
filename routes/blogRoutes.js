const express = require('express');
const router = express.Router();
const {
  getBlogs, getBlogBySlug, getTrendingBlogs, getFeaturedBlogs, getRelatedBlogs,
  createBlog, updateBlog, deleteBlog, getMyBlogs, toggleLike, toggleBookmark,
  getBookmarks, getAuthorBlogs, getAuthorProfile, reportBlog, trackShare,
} = require('../controllers/blogController');
const { protect, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes
router.get('/', getBlogs);
router.get('/trending', getTrendingBlogs);
router.get('/featured', getFeaturedBlogs);

// Protected routes (must come before /:slug to avoid conflicts)
router.get('/my', protect, getMyBlogs);
router.get('/bookmarks', protect, getBookmarks);

// Author routes
router.get('/author/:authorId', getAuthorBlogs);
router.get('/author/:authorId/profile', getAuthorProfile);

// Single blog (optionalAuth for view tracking)
router.get('/:slug', optionalAuth, getBlogBySlug);

// Related blogs (by blog ID)
router.get('/:id/related', getRelatedBlogs);

// Blog CRUD
router.post('/', protect, upload.single('thumbnail'), createBlog);
router.put('/:id', protect, upload.single('thumbnail'), updateBlog);
router.delete('/:id', protect, deleteBlog);

// Interactions
router.post('/:id/like', protect, toggleLike);
router.post('/:id/bookmark', protect, toggleBookmark);
router.post('/:id/report', protect, reportBlog);
router.post('/:id/share', trackShare);

module.exports = router;
