const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    blog: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 1000 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    isAdminNote: { type: Boolean, default: false }, // admin-only feedback visible only to blog author
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);
