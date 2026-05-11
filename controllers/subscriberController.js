const crypto = require('crypto');
const Subscriber = require('../models/Subscriber');
const sendEmail = require('../utils/sendEmail');

// ── Welcome email HTML ────────────────────────────────────────────────────────
function welcomeEmailHtml(email, unsubscribeToken) {
  const unsubUrl = `${process.env.CLIENT_URL}/unsubscribe?token=${unsubscribeToken}`;
  return `
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px">BlogHub</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Where Ideas Come Alive</p>
      </div>
      <div style="padding:40px 32px">
        <h2 style="color:#111827;margin:0 0 8px;font-size:20px;font-weight:700">You're in the loop! 🎉</h2>
        <p style="color:#6b7280;margin:0 0 20px;font-size:14px;line-height:1.7">
          Thanks for subscribing to <strong style="color:#111827">BlogHub</strong>. You'll now receive the best articles, trending stories, and curated content delivered straight to your inbox every week.
        </p>
        <div style="background:#eff6ff;border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid #2563eb">
          <p style="margin:0;font-size:13px;color:#1d4ed8;font-weight:600">What to expect:</p>
          <ul style="margin:8px 0 0;padding-left:18px;color:#374151;font-size:13px;line-height:1.8">
            <li>Weekly digest of top articles</li>
            <li>Trending stories from our community</li>
            <li>Exclusive content from top writers</li>
          </ul>
        </div>
        <a href="${process.env.CLIENT_URL}/blogs" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">
          Explore Articles →
        </a>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #f3f4f6">
        <p style="color:#9ca3af;font-size:11px;margin:0">
          Don't want these emails? <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>
        </p>
      </div>
    </div>
  `;
}

// @desc  Subscribe to newsletter
exports.subscribe = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    const existing = await Subscriber.findOne({ email });

    if (existing) {
      if (existing.isActive) {
        return res.status(400).json({ success: false, message: 'This email is already subscribed' });
      }
      // Re-subscribe
      existing.isActive = true;
      await existing.save();
      return res.json({ success: true, message: 'Welcome back! You have been re-subscribed.' });
    }

    const unsubscribeToken = crypto.randomBytes(32).toString('hex');
    await Subscriber.create({ email, unsubscribeToken });

    // Send welcome email (non-blocking — don't fail subscription if email fails)
    try {
      await sendEmail({
        to: email,
        subject: "You're subscribed to BlogHub 🎉",
        html: welcomeEmailHtml(email, unsubscribeToken),
      });
      console.log(`Welcome email sent to ${email}`);
    } catch (emailErr) {
      console.error('Welcome email failed — full error:', emailErr);
    }

    res.status(201).json({ success: true, message: 'Successfully subscribed!' });
  } catch (error) {
    next(error);
  }
};

// @desc  Unsubscribe via token
exports.unsubscribe = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Invalid unsubscribe link' });

    const subscriber = await Subscriber.findOne({ unsubscribeToken: token });
    if (!subscriber) return res.status(404).json({ success: false, message: 'Subscription not found' });

    subscriber.isActive = false;
    await subscriber.save();

    res.json({ success: true, message: 'You have been unsubscribed successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc  Get all subscribers (admin)
exports.getAllSubscribers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Subscriber.countDocuments({ isActive: true });
    const subscribers = await Subscriber.find({ isActive: true })
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('email createdAt');

    res.json({
      success: true,
      subscribers,
      pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};
