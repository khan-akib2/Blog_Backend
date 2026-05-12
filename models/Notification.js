const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['blog_approved', 'blog_rejected', 'new_comment', 'blog_featured', 'report_reviewed'],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, default: '' }, // e.g. /blogs/my-blog-slug
    isRead: { type: Boolean, default: false },
    // Optional references
    blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', default: null },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
