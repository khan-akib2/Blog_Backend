require('dotenv').config();
const mongoose = require('mongoose');
const RealUser = require('./models/User');

async function createOrUpdateAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'ramzan@gmail.com';
    const password = 'ramzan@123!';
    
    let user = await RealUser.findOne({ email });
    
    if (user) {
      console.log('User found. Updating to admin and resetting password...');
      user.role = 'admin';
      user.password = password; // pre-save hook will hash this!
      user.isEmailVerified = true;
      await user.save();
      console.log('User updated successfully.');
    } else {
      console.log('User not found. Creating new admin user...');
      user = new RealUser({
        name: 'Ramzan Admin',
        email,
        password: password, // pre-save hook will hash this!
        role: 'admin',
        isEmailVerified: true
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
