const express = require('express');
const router = express.Router({ mergeParams: true });
const { getComments, addComment, deleteComment, likeComment } = require('../controllers/commentController');
const { protect, optionalAuth } = require('../middleware/auth');

// GET uses optionalAuth so admin notes are filtered based on who's asking
router.get('/', optionalAuth, getComments);
router.post('/', protect, addComment);
router.delete('/:id', protect, deleteComment);
router.post('/:id/like', protect, likeComment);

module.exports = router;
