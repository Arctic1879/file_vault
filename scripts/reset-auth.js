 const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function resetAuth() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Delete all users
    await User.deleteMany({});
    console.log('All users deleted');

    console.log('Auth reset complete. You can now register new users.');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting auth:', error);
    process.exit(1);
  }
}

resetAuth(); 