const Blog = require('../models/Blog');
const User = require('../models/User');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const sendEmail = require('../utils/sendEmail');

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createNotification({ recipient, type, title, message, link = '', blog = null, comment = null }) {
  try {
    await Notification.create({ recipient, type, title, message, link, blog, comment });
  } catch (err) {
    console.error('Notification create error:', err.message);
  }
}

// ─── Get all blogs (admin) ────────────────────────────────────────────────────
exports.getAllBlogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.$text = { $search: search };

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('author', 'name email avatar')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-content -viewedBy');

    res.json({ success: true, blogs, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

// ─── Get single blog for admin preview ───────────────────────────────────────
exports.getBlogPreview = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name email avatar bio');
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    const notes = await Comment.find({ blog: req.params.id, isAdminNote: true })
      .populate('author', 'name avatar')
      .sort('-createdAt');

    res.json({ success: true, blog, notes });
  } catch (error) {
    next(error);
  }
};

// ─── Approve blog ─────────────────────────────────────────────────────────────
exports.approveBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', rejectionReason: '' },
      { new: true }
    ).populate('author', 'name email');
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // In-app notification
    await createNotification({
      recipient: blog.author._id,
      type: 'blog_approved',
      title: 'Blog Approved! 🎉',
      message: `Your blog "${blog.title}" has been approved and is now live.`,
      link: `/blogs/${blog.slug}`,
      blog: blog._id,
    });

    // Email notification
    try {
      await sendEmail({
        to: blog.author.email,
        subject: `Your blog "${blog.title}" is now live! 🎉`,
        html: approvalEmailHtml(blog.author.name, blog.title, blog.slug),
      });
    } catch (emailErr) {
      console.error('Approval email failed:', emailErr.message);
    }

    // Trigger Next.js revalidation (best-effort)
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    try {
      await fetch(`${clientUrl}/api/revalidate?secret=${process.env.REVALIDATE_SECRET || 'bloghub'}&path=/`);
      await fetch(`${clientUrl}/api/revalidate?secret=${process.env.REVALIDATE_SECRET || 'bloghub'}&path=/blogs`);
    } catch (_) {}

    res.json({ success: true, blog });
  } catch (error) {
    next(error);
  }
};

// ─── Reject blog ──────────────────────────────────────────────────────────────
exports.rejectBlog = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', rejectionReason: reason || 'Does not meet our guidelines' },
      { new: true }
    ).populate('author', 'name email');
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // In-app notification
    await createNotification({
      recipient: blog.author._id,
      type: 'blog_rejected',
      title: 'Blog Needs Revision',
      message: `Your blog "${blog.title}" was not approved. Reason: ${reason || 'Does not meet our guidelines'}`,
      link: `/dashboard`,
      blog: blog._id,
    });

    // Email notification
    try {
      await sendEmail({
        to: blog.author.email,
        subject: `Update on your blog "${blog.title}"`,
        html: rejectionEmailHtml(blog.author.name, blog.title, reason || 'Does not meet our guidelines'),
      });
    } catch (emailErr) {
      console.error('Rejection email failed:', emailErr.message);
    }

    res.json({ success: true, blog });
  } catch (error) {
    next(error);
  }
};

// ─── Toggle featured / trending / editor's pick ───────────────────────────────
exports.toggleBlogFlag = async (req, res, next) => {
  try {
    const { flag } = req.params; // 'isFeatured' | 'isTrending' | 'isEditorsPick'
    const allowed = ['isFeatured', 'isTrending', 'isEditorsPick'];
    if (!allowed.includes(flag)) {
      return res.status(400).json({ success: false, message: 'Invalid flag' });
    }

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    if (blog.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved blogs can be featured' });
    }

    blog[flag] = !blog[flag];
    await blog.save({ validateBeforeSave: false });

    // Notify author if featured
    if (flag === 'isFeatured' && blog.isFeatured) {
      await createNotification({
        recipient: blog.author,
        type: 'blog_featured',
        title: 'Your blog is featured! ⭐',
        message: `"${blog.title}" has been featured on the homepage.`,
        link: `/blogs/${blog.slug}`,
        blog: blog._id,
      });
    }

    res.json({ success: true, [flag]: blog[flag] });
  } catch (error) {
    next(error);
  }
};

// ─── Schedule blog publish ────────────────────────────────────────────────────
exports.scheduleBlog = async (req, res, next) => {
  try {
    const { scheduledAt } = req.body;
    if (!scheduledAt) return res.status(400).json({ success: false, message: 'scheduledAt is required' });

    const date = new Date(scheduledAt);
    if (isNaN(date.getTime()) || date <= new Date()) {
      return res.status(400).json({ success: false, message: 'scheduledAt must be a future date' });
    }

    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: 'scheduled', scheduledAt: date },
      { new: true }
    ).populate('author', 'name email');
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    res.json({ success: true, blog });
  } catch (error) {
    next(error);
  }
};

// ─── Get reports ──────────────────────────────────────────────────────────────
exports.getReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const query = { reportCount: { $gt: 0 } };

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .populate('author', 'name email avatar')
      .populate('reports.user', 'name email')
      .sort('-reportCount -createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('title slug status reportCount reports author createdAt thumbnail category');

    res.json({ success: true, blogs, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

// ─── Dismiss reports ──────────────────────────────────────────────────────────
exports.dismissReports = async (req, res, next) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { $set: { reports: [], reportCount: 0 } },
      { new: true }
    );
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, message: 'Reports dismissed' });
  } catch (error) {
    next(error);
  }
};

// ─── Get dashboard analytics ──────────────────────────────────────────────────
exports.getAnalytics = async (req, res, next) => {
  try {
    const [
      totalBlogs, pendingBlogs, approvedBlogs, rejectedBlogs,
      totalUsers, totalComments, totalReports, featuredBlogs,
    ] = await Promise.all([
      Blog.countDocuments(),
      Blog.countDocuments({ status: 'pending' }),
      Blog.countDocuments({ status: 'approved' }),
      Blog.countDocuments({ status: 'rejected' }),
      User.countDocuments({ role: 'user' }),
      Comment.countDocuments(),
      Blog.countDocuments({ reportCount: { $gt: 0 } }),
      Blog.countDocuments({ isFeatured: true, status: 'approved' }),
    ]);

    // Total likes across all blogs
    const likesAgg = await Blog.aggregate([
      { $group: { _id: null, totalLikes: { $sum: { $size: '$likes' } } } },
    ]);
    const totalLikes = likesAgg[0]?.totalLikes || 0;

    // Total views
    const viewsAgg = await Blog.aggregate([
      { $group: { _id: null, totalViews: { $sum: '$views' } } },
    ]);
    const totalViews = viewsAgg[0]?.totalViews || 0;

    // Top blogs by views
    const topBlogs = await Blog.find({ status: 'approved' })
      .sort('-views')
      .limit(5)
      .select('title views likes slug shares')
      .populate('author', 'name');

    // Recent pending blogs
    const recentBlogs = await Blog.find({ status: 'pending' })
      .sort('-createdAt')
      .limit(5)
      .select('title author createdAt category')
      .populate('author', 'name');

    // Blogs per category (approved only)
    const categoryStats = await Blog.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    // Recent user registrations (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    const newBlogsThisWeek = await Blog.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    res.json({
      success: true,
      analytics: {
        totalBlogs, pendingBlogs, approvedBlogs, rejectedBlogs,
        totalUsers, totalComments, totalReports, featuredBlogs,
        totalLikes, totalViews, newUsersThisWeek, newBlogsThisWeek,
      },
      topBlogs,
      recentBlogs,
      categoryStats,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get all users (admin) ────────────────────────────────────────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-password');
    res.json({ success: true, users, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

// ─── Delete user (admin) ──────────────────────────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin' });
    await Blog.deleteMany({ author: req.params.id });
    await Comment.deleteMany({ author: req.params.id });
    await Notification.deleteMany({ recipient: req.params.id });
    await user.deleteOne();
    res.json({ success: true, message: 'User and their blogs deleted' });
  } catch (error) {
    next(error);
  }
};

// ─── Toggle user active status ────────────────────────────────────────────────
exports.toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, isActive: user.isActive });
  } catch (error) {
    next(error);
  }
};

// ─── Email templates ──────────────────────────────────────────────────────────

function approvalEmailHtml(name, title, slug) {
  const blogUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/blogs/${slug}`;
  return `
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700">BlogHub</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Where Ideas Come Alive</p>
      </div>
      <div style="padding:40px 32px">
        <h2 style="color:#111827;margin:0 0 8px;font-size:20px;font-weight:700">Your blog is live! 🎉</h2>
        <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.7">
          Hi <strong style="color:#111827">${name}</strong>, great news! Your blog post <strong style="color:#111827">"${title}"</strong> has been reviewed and approved by our editorial team. It's now live and visible to all readers.
        </p>
        <a href="${blogUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">
          View Your Blog →
        </a>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #f3f4f6">
        <p style="color:#d1d5db;font-size:11px;margin:0">— The BlogHub Editorial Team</p>
      </div>
    </div>
  `;
}

function rejectionEmailHtml(name, title, reason) {
  const dashboardUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard`;
  return `
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700">BlogHub</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Where Ideas Come Alive</p>
      </div>
      <div style="padding:40px 32px">
        <h2 style="color:#111827;margin:0 0 8px;font-size:20px;font-weight:700">Blog Needs Revision</h2>
        <p style="color:#6b7280;margin:0 0 16px;font-size:14px;line-height:1.7">
          Hi <strong style="color:#111827">${name}</strong>, your blog post <strong style="color:#111827">"${title}"</strong> requires some changes before it can be published.
        </p>
        <div style="background:#fef2f2;border-radius:12px;padding:16px;margin-bottom:24px;border-left:4px solid #ef4444">
          <p style="margin:0;font-size:13px;color:#dc2626;font-weight:600">Reason:</p>
          <p style="margin:6px 0 0;font-size:13px;color:#374151">${reason}</p>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0 0 20px">You can edit your blog and resubmit it for review from your dashboard.</p>
        <a href="${dashboardUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">
          Go to Dashboard →
        </a>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #f3f4f6">
        <p style="color:#d1d5db;font-size:11px;margin:0">— The BlogHub Editorial Team</p>
      </div>
    </div>
  `;
}
