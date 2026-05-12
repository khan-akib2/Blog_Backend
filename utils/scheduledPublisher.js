/**
 * Scheduled Blog Publisher
 * Runs every minute to auto-publish blogs whose scheduledAt time has passed.
 * Call startScheduledPublisher() once from server.js.
 */
const Blog = require('../models/Blog');
const Notification = require('../models/Notification');

async function publishScheduledBlogs() {
  try {
    const now = new Date();
    const blogs = await Blog.find({
      status: 'scheduled',
      scheduledAt: { $lte: now },
    }).populate('author', 'name email');

    if (blogs.length === 0) return;

    for (const blog of blogs) {
      blog.status = 'approved';
      blog.scheduledAt = null;
      await blog.save({ validateBeforeSave: false });

      // Notify author
      await Notification.create({
        recipient: blog.author._id,
        type: 'blog_approved',
        title: 'Scheduled blog is now live! 🎉',
        message: `Your scheduled blog "${blog.title}" has been automatically published.`,
        link: `/blogs/${blog.slug}`,
        blog: blog._id,
      });

      console.log(`[Scheduler] Published: "${blog.title}"`);
    }
  } catch (err) {
    console.error('[Scheduler] Error publishing scheduled blogs:', err.message);
  }
}

function startScheduledPublisher() {
  // Run immediately on startup, then every 60 seconds
  publishScheduledBlogs();
  setInterval(publishScheduledBlogs, 60 * 1000);
  console.log('[Scheduler] Scheduled publisher started');
}

module.exports = { startScheduledPublisher };
