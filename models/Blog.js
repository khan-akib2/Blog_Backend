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
      enum: [
        'Technology', 'Science', 'Health', 'Business', 'Travel',
        'Food', 'Lifestyle', 'Education', 'Entertainment', 'Sports',
        'Web Development', 'AI & Machine Learning', 'Cybersecurity',
        'Mobile Apps', 'Career Guidance', 'Study Tips', 'Other',
      ],
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    status: { type: String, enum: ['draft', 'pending', 'approved', 'rejected', 'scheduled'], default: 'draft' },
    rejectionReason: { type: String, default: '' },
    views: { type: Number, default: 0 },
    // Tracks unique viewers to prevent repeated view inflation
    viewedBy: [{ type: String }], // stores userId or IP fingerprint
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readingTime: { type: Number, default: 0 },
    // Featured / editorial flags — admin-controlled
    isFeatured: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isEditorsPick: { type: Boolean, default: false },
    thumbnailPosition: { type: String, default: '50% 50%' }, // CSS object-position for focal point
    faqs: [
      {
        question: { type: String, trim: true },
        answer: { type: String, trim: true },
      },
    ],
    conclusion: { type: String, default: '' },
    // Analytics
    shares: { type: Number, default: 0 },
    // Scheduled publishing
    scheduledAt: { type: Date, default: null },
    // Reports
    reports: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String, enum: ['spam', 'offensive', 'fake', 'other'], default: 'other' },
        description: { type: String, maxlength: 500, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    reportCount: { type: Number, default: 0 },
    // AI-generated fields (optional, non-blocking)
    aiSummary: { type: String, default: '' },
    aiTags: [{ type: String }],
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
  // Sync reportCount
  if (this.isModified('reports')) {
    this.reportCount = this.reports.length;
  }
});

blogSchema.index({ title: 'text', content: 'text', tags: 'text' });
blogSchema.index({ status: 1, createdAt: -1 });
blogSchema.index({ author: 1, status: 1 });
blogSchema.index({ isFeatured: 1, status: 1 });
blogSchema.index({ isEditorsPick: 1, status: 1 });
blogSchema.index({ scheduledAt: 1, status: 1 });

module.exports = mongoose.model('Blog', blogSchema);
