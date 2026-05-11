const mongoose = require('mongoose');
const slugify = require('slugify');

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, unique: true },
    content: { type: String, required: true },
    excerpt: { type: String, maxlength: 300 },
    thumbnail: { type: String, default: '' },
    thumbnailPublicId: { type: String, default: '' },
    thumbnailType: { type: String, enum: ['image', 'video'], default: 'image' },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
      type: String,
      required: true,
      enum: ['Technology', 'Science', 'Health', 'Business', 'Travel', 'Food', 'Lifestyle', 'Education', 'Entertainment', 'Sports', 'Other'],
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    status: { type: String, enum: ['draft', 'pending', 'approved', 'rejected'], default: 'draft' },
    rejectionReason: { type: String, default: '' },
    views: { type: Number, default: 0 },
    // Tracks unique viewers to prevent repeated view inflation
    viewedBy: [{ type: String }], // stores userId or IP fingerprint
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readingTime: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    faqs: [
      {
        question: { type: String, trim: true },
        answer: { type: String, trim: true },
      },
    ],
    conclusion: { type: String, default: '' },
  },
  { timestamps: true }
);

blogSchema.pre('save', function () {
  if (this.isModified('title')) {
    this.slug = slugify(this.title, { lower: true, strict: true }) + '-' + Date.now();
  }
  if (this.isModified('content')) {
    const wordCount = this.content.replace(/<[^>]*>/g, '').split(/\s+/).length;
    this.readingTime = Math.ceil(wordCount / 200);
  }
  if (this.isModified('content') && !this.excerpt) {
    this.excerpt = this.content.replace(/<[^>]*>/g, '').substring(0, 250) + '...';
  }
});

blogSchema.index({ title: 'text', content: 'text', tags: 'text' });
blogSchema.index({ status: 1, createdAt: -1 });
blogSchema.index({ author: 1, status: 1 });

module.exports = mongoose.model('Blog', blogSchema);
