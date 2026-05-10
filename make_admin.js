require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isVerified: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function createOrUpdateAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'ramzan@gmail.com';
    const password = 'ramzan@123!';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let user = await User.findOne({ email });
    
    if (user) {
      console.log('User found. Updating to admin and resetting password...');
      user.role = 'admin';
      user.password = hashedPassword;
      user.isVerified = true;
      await user.save();
      console.log('User updated successfully.');
    } else {
      console.log('User not found. Creating new admin user...');
      user = new User({
        name: 'Ramzan Admin',
        email,
        password: hashedPassword,
        role: 'admin',
        isVerified: true
      });
      await user.save();
      console.log('Admin user created successfully.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

createOrUpdateAdmin();
