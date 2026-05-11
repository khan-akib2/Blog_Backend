const Blog = require('../models/Blog');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadToCloudinary');

// @desc  Get all approved blogs (public)
exports.getBlogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, category, search, sort = '-createdAt', tag } = req.query;
    const query = { status: 'approved' };

    if (category) query.category = category;
    if (tag) query.tags = tag;
    if (search) query.$text = { $search: search };

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('author', 'name avatar')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-content');

    res.json({
      success: true,
      blogs,
      pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// @desc  Get single blog by slug
exports.getBlogBySlug = async (req, res, next) => {
  try {
    // Allow author to preview their own non-approved blogs via ?preview=true
    let blog;
    if (req.query.preview === 'true' && req.headers.authorization) {
      const jwt = require('jsonwebtoken');
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        blog = await Blog.findOne({ slug: req.params.slug, author: decoded.id }).populate('author', 'name avatar bio');
      } catch (_) {}
    }
    if (!blog) {
      blog = await Blog.findOne({ slug: req.params.slug, status: 'approved' }).populate('author', 'name avatar bio');
    }
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // Unique view tracking — use userId if authenticated, else IP address
    // Only count a view once per user/IP per 24 hours (stored as "id:timestamp" or "ip:timestamp")
    const jwt = require('jsonwebtoken');
    let viewerId = req.ip || 'unknown';
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        viewerId = `user:${decoded.id}`;
      } catch (_) {}
    }

    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
    // viewedBy entries are stored as "viewerId|timestamp"
    const existingEntry = blog.viewedBy.find((v) => v.startsWith(viewerId + '|'));
    const lastViewedAt = existingEntry ? parseInt(existingEntry.split('|')[1], 10) : 0;

    if (now - lastViewedAt > cooldownMs) {
      // Remove old entry for this viewer and add fresh one
      blog.viewedBy = blog.viewedBy.filter((v) => !v.startsWith(viewerId + '|'));
      blog.viewedBy.push(`${viewerId}|${now}`);
      blog.views += 1;
      await blog.save({ validateBeforeSave: false });
    }

    res.json({ success: true, blog });
  } catch (error) {
    next(error);
  }
};

// @desc  Get trending blogs
exports.getTrendingBlogs = async (req, res, next) => {
  try {
    const blogs = await Blog.find({ status: 'approved' })
      .populate('author', 'name avatar')
      .sort('-views -likes')
      .limit(6)
      .select('-content');
    res.json({ success: true, blogs });
  } catch (error) {
    next(error);
  }
};

// @desc  Create blog
exports.createBlog = async (req, res, next) => {
  try {
    const { title, content, category, tags, status, conclusion } = req.body;
    let thumbnail = '';
    let thumbnailPublicId = '';

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'blog-thumbnails', req.file.mimetype);
      thumbnail = result.secure_url;
      thumbnailPublicId = result.public_id;
    }

    // Parse FAQs — sent as JSON string from FormData
    let faqs = [];
    if (req.body.faqs) {
      try { faqs = JSON.parse(req.body.faqs); } catch (_) {}
    }

    const blogStatus = status === 'pending' ? 'pending' : 'draft';
    const excerpt = content.replace(/<[^>]*>/g, '').substring(0, 250) + '...';

    const blog = await Blog.create({
      title,
      content,
      excerpt,
      thumbnail,
      thumbnailPublicId,
      thumbnailType: req.file?.mimetype?.startsWith('video/') ? 'video' : 'image',
      author: req.user._id,
      category,
      tags: tags ? tags.split(',').map((t) => t.trim()) : [],
      status: blogStatus,
      faqs,
      conclusion: conclusion || '',
    });

    res.status(201).json({ success: true, blog });
  } catch (error) {
    next(error);
  }
};

// @desc  Update blog
exports.updateBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    if (blog.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (blog.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Cannot edit an approved blog' });
    }

    const { title, content, category, tags, status, conclusion } = req.body;

    if (req.file) {
      if (blog.thumbnailPublicId) await deleteFromCloudinary(blog.thumbnailPublicId, blog.thumbnailType || 'image');
      const result = await uploadToCloudinary(req.file.buffer, 'blog-thumbnails', req.file.mimetype);
      blog.thumbnail = result.secure_url;
      blog.thumbnailPublicId = result.public_id;
      blog.thumbnailType = req.file.mimetype?.startsWith('video/') ? 'video' : 'image';
    }

    // Parse FAQs — sent as JSON string from FormData
    if (req.body.faqs) {
      try { blog.faqs = JSON.parse(req.body.faqs); } catch (_) {}
    }

    if (title) blog.title = title;
    if (content) { blog.content = content; blog.excerpt = content.replace(/<[^>]*>/g, '').substring(0, 250) + '...'; }
    if (category) blog.category = category;
    if (tags) blog.tags = tags.split(',').map((t) => t.trim());
    if (conclusion !== undefined) blog.conclusion = conclusion;
    if (status === 'pending') blog.status = 'pending';
    else if (status === 'draft') blog.status = 'draft';

    await blog.save();
    res.json({ success: true, blog });
  } catch (error) {
    next(error);
  }
};

// @desc  Delete blog
exports.deleteBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (blog.thumbnailPublicId) await deleteFromCloudinary(blog.thumbnailPublicId, blog.thumbnailType || 'image');
    await blog.deleteOne();
    res.json({ success: true, message: 'Blog deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc  Get user's own blogs
exports.getMyBlogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { author: req.user._id };
    if (status) query.status = status;

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-content');

    res.json({ success: true, blogs, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

// @desc  Like / unlike blog
exports.toggleLike = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    const idx = blog.likes.indexOf(req.user._id);
    if (idx === -1) blog.likes.push(req.user._id);
    else blog.likes.splice(idx, 1);

    await blog.save({ validateBeforeSave: false });
    res.json({ success: true, likes: blog.likes.length, liked: idx === -1 });
  } catch (error) {
    next(error);
  }
};

// @desc  Toggle bookmark
exports.toggleBookmark = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    const idx = user.bookmarks.indexOf(req.params.id);
    if (idx === -1) user.bookmarks.push(req.params.id);
    else user.bookmarks.splice(idx, 1);
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, bookmarked: idx === -1 });
  } catch (error) {
    next(error);
  }
};

// @desc  Get bookmarked blogs
exports.getBookmarks = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id).populate({
      path: 'bookmarks',
      select: '-content',
      populate: { path: 'author', select: 'name avatar' },
    });
    res.json({ success: true, blogs: user.bookmarks });
  } catch (error) {
    next(error);
  }
};

// @desc  Get author profile blogs
exports.getAuthorBlogs = async (req, res, next) => {
  try {
    const blogs = await Blog.find({ author: req.params.authorId, status: 'approved' })
      .sort('-createdAt')
      .limit(10)
      .select('-content');
    res.json({ success: true, blogs });
  } catch (error) {
    next(error);
  }
};
