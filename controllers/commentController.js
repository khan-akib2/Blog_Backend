const Comment = require('../models/Comment');
const Blog = require('../models/Blog');
const Notification = require('../models/Notification');

// @desc  Get comments for a blog
// Admin notes (isAdminNote: true) are only returned to the blog author or admin
exports.getComments = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.blogId).select('author');

    // Build visibility filter for admin notes
    const requesterId = req.user?._id?.toString();
    const isAdmin = req.user?.role === 'admin';
    const isAuthor = blog && blog.author.toString() === requesterId;

    let query = { blog: req.params.blogId, parentComment: null };

    // If requester is neither admin nor the blog author, exclude admin notes
    if (!isAdmin && !isAuthor) {
      query.isAdminNote = { $ne: true };
    }

    const comments = await Comment.find(query)
      .populate('author', 'name avatar role')
      .sort('-createdAt');

    res.json({ success: true, comments });
  } catch (error) {
    next(error);
  }
};

// @desc  Add comment
// If the commenter is admin, mark it as an admin note (only visible to author + admin)
exports.addComment = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.blogId).select('author status slug');
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    // Allow admin to comment on any blog (including pending), regular users only on approved
    if (req.user.role !== 'admin' && blog.status !== 'approved') {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    const isAdminNote = req.user.role === 'admin';

    const comment = await Comment.create({
      blog: req.params.blogId,
      author: req.user._id,
      content: req.body.content,
      parentComment: req.body.parentComment || null,
      isAdminNote,
    });
    await comment.populate('author', 'name avatar role');

    // Notify blog author about new comment (skip if commenter is the author, or if it's an admin note)
    if (!isAdminNote && blog.author.toString() !== req.user._id.toString()) {
      try {
        await Notification.create({
          recipient: blog.author,
          type: 'new_comment',
          title: 'New comment on your blog',
          message: `${req.user.name} commented: "${req.body.content.substring(0, 80)}${req.body.content.length > 80 ? '...' : ''}"`,
          link: `/blogs/${blog.slug}`,
          blog: blog._id,
          comment: comment._id,
        });
      } catch (notifErr) {
        console.error('Comment notification error:', notifErr.message);
      }
    }

    res.status(201).json({ success: true, comment });
  } catch (error) {
    next(error);
  }
};

// @desc  Delete comment
exports.deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (comment.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await comment.deleteOne();
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc  Like comment
exports.likeComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
    const idx = comment.likes.indexOf(req.user._id);
    if (idx === -1) comment.likes.push(req.user._id);
    else comment.likes.splice(idx, 1);
    await comment.save({ validateBeforeSave: false });
    res.json({ success: true, likes: comment.likes.length });
  } catch (error) {
    next(error);
  }
};
