const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const File = require('../models/File');
const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log('Registration attempt for email:', email);

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      console.log('User already exists:', email);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user (password will be hashed by the pre-save hook)
    user = new User({
      name,
      email,
      password,
      storageUsed: 0,
      storageLimit: 5368709120 // 5GB in bytes
    });

    await user.save();
    console.log('User created successfully:', email);

    // Create home folder for the user
    const homeFolder = new File({
      originalName: `${name}'s Home`,
      encryptedName: `${name}'s Home`,
      mimeType: 'folder',
      size: 0,
      owner: user._id,
      password: null,
      maxDownloads: null,
      downloadCount: 0,
      expiresAt: null,
      isFolder: true,
      isHomeFolder: true,
      parentFolder: null
    });

    await homeFolder.save();
    console.log('Home folder created for user:', email);

    // Update user with home folder reference
    user.homeFolder = homeFolder._id;
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Registration successful for user:', email);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Error registering user',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password using the model's method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Ensure home folder exists
    await user.ensureHomeFolder();
    console.log('Home folder verified for user:', email);

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', email);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Error logging in',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router; 