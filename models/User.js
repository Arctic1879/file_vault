const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const File = require('./File');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  storageLimit: {
    type: Number,
    default: 100 * 1024 * 1024 // 100MB in bytes
  },
  storageUsed: {
    type: Number,
    default: 0
  },
  homeFolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to update storage usage
userSchema.methods.updateStorageUsed = async function(sizeChange) {
  const newStorageUsed = Math.max(0, this.storageUsed + sizeChange);
  this.storageUsed = newStorageUsed;
  await this.save();
  return newStorageUsed;
};

// Method to ensure home folder exists
userSchema.methods.ensureHomeFolder = async function() {
  if (!this.homeFolder) {
    try {
      const homeFolder = new File({
        originalName: this._id.toString(), // Use user ID as folder name
        encryptedName: this._id.toString(), // Same as originalName for folders
        mimeType: 'folder',
        size: 0,
        owner: this._id,
        isFolder: true,
        isHomeFolder: true,
        parentFolder: null
      });

      await homeFolder.save();
      this.homeFolder = homeFolder._id;
      await this.save();
      console.log('Created home folder for user:', this._id);
    } catch (error) {
      console.error('Error creating home folder:', error);
      throw error;
    }
  }
  return this.homeFolder;
};

module.exports = mongoose.model('User', userSchema); 