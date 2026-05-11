const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── helpers ─────────────────────────────────────────────────────────────────

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function otpEmailHtml(name, otp) {
  return `
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#1d4ed8,#3b82f6);padding:32px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px">BlogHub</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Where Ideas Come Alive</p>
      </div>
      <div style="padding:40px 32px">
        <h2 style="color:#111827;margin:0 0 8px;font-size:20px;font-weight:700">Verify your email</h2>
        <p style="color:#6b7280;margin:0 0 28px;font-size:14px;line-height:1.6">Hi <strong style="color:#111827">${name}</strong>, use the code below to complete your registration. It expires in <strong>10 minutes</strong>.</p>
        <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
          <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:600">Your verification code</p>
          <p style="margin:0;font-size:42px;font-weight:800;letter-spacing:10px;color:#1d4ed8;font-family:'Courier New',monospace">${otp}</p>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">If you didn't create an account, you can safely ignore this email.</p>
      </div>
      <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #f3f4f6">
        <p style="color:#d1d5db;font-size:11px;margin:0">— The BlogHub Team</p>
      </div>
    </div>
  `;
}

// ─── send OTP ─────────────────────────────────────────────────────────────────

exports.sendOTP = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing && existing.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const otp = generateOTP();
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    if (existing && !existing.isEmailVerified) {
      existing.emailVerificationToken = hashedOTP;
      existing.emailVerificationExpires = expires;
      if (name) existing.name = name;
      if (password) existing.password = password;
      await existing.save({ validateBeforeSave: false });
    } else {
      await User.create({
        name,
        email,
        password,
        authProvider: 'local',
        isEmailVerified: false,
        emailVerificationToken: hashedOTP,
        emailVerificationExpires: expires,
      });
    }

    try {
      await sendEmail({
        to: email,
        subject: 'Your BlogHub verification code',
        html: otpEmailHtml(name || 'there', otp),
      });
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
      return res.status(500).json({ success: false, message: 'Failed to send OTP email. Please try again.' });
    }

    res.status(200).json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    next(error);
  }
};

// ─── verify OTP ───────────────────────────────────────────────────────────────

exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

    const user = await User.findOne({
      email,
      emailVerificationToken: hashedOTP,
      emailVerificationExpires: { $gt: Date.now() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
    res.json({
      success: true,
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (error) {
    next(error);
  }
};

// ─── register (alias for sendOTP) ────────────────────────────────────────────

exports.register = (req, res, next) => exports.sendOTP(req, res, next);

// ─── login ────────────────────────────────────────────────────────────────────

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account deactivated' });
    if (!user.isEmailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email before logging in', needsVerification: true, email: user.email });
    }

    const token = generateToken(user._id);
    res.json({
      success: true,
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (error) {
    next(error);
  }
};

// ─── google oauth ─────────────────────────────────────────────────────────────

exports.googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Google credential required' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        user.isEmailVerified = true;
        if (!user.avatar && picture) user.avatar = picture;
        await user.save({ validateBeforeSave: false });
      }
    } else {
      user = await User.create({
        name,
        email,
        googleId,
        avatar: picture || '',
        authProvider: 'google',
        isEmailVerified: true,
      });
    }

    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account deactivated' });

    const token = generateToken(user._id);
    res.json({
      success: true,
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (error) {
    next(error);
  }
};

// ─── get me ───────────────────────────────────────────────────────────────────

exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ─── update profile ───────────────────────────────────────────────────────────

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, bio } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { name, bio }, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// ─── update avatar ────────────────────────────────────────────────────────────

exports.updateAvatar = async (req, res, next) => {
  try {
    const { uploadToCloudinary } = require('../utils/uploadToCloudinary');
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });
    const result = await uploadToCloudinary(req.file.buffer, 'avatars');
    const user = await User.findByIdAndUpdate(req.user._id, { avatar: result.secure_url }, { new: true });
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};
