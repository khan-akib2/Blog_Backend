const express = require('express');
const router = express.Router();
const {
  getAllBlogs, getBlogPreview, approveBlog, rejectBlog, getAnalytics,
  getAllUsers, deleteUser, toggleUserStatus, toggleBlogFlag, scheduleBlog,
  getReports, dismissReports,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

// Analytics
router.get('/analytics', getAnalytics);

// Blog management
router.get('/blogs', getAllBlogs);
router.get('/blogs/:id/preview', getBlogPreview);
router.put('/blogs/:id/approve', approveBlog);
router.put('/blogs/:id/reject', rejectBlog);
router.put('/blogs/:id/flag/:flag', toggleBlogFlag);
router.put('/blogs/:id/schedule', scheduleBlog);

// Reports
router.get('/reports', getReports);
router.put('/reports/:id/dismiss', dismissReports);

// User management
router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/toggle-status', toggleUserStatus);

module.exports = router;
