const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  encryptedName: {
    type: String,
    required: function() {
      return !this.isFolder;
    }
  },
  mimeType: {
    type: String,
    required: function() {
      return !this.isFolder;
    }
  },
  size: {
    type: Number,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  password: {
    type: String,
    default: null
  },
  maxDownloads: {
    type: Number,
    default: null
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date,
    default: null
  },
  isFolder: {
    type: Boolean,
    default: false
  },
  isHomeFolder: {
    type: Boolean,
    default: false
  },
  parentFolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for child files/folders
fileSchema.virtual('children', {
  ref: 'File',
  localField: '_id',
  foreignField: 'parentFolder'
});

// Indexes for faster queries
fileSchema.index({ owner: 1, parentFolder: 1 });
fileSchema.index({ owner: 1, isFolder: 1 });

// Method to get full path
fileSchema.methods.getFullPath = async function() {
  if (this.isHomeFolder) return '/';
  
  const path = [];
  let current = this;
  
  while (current && !current.isHomeFolder) {
    path.unshift(current.originalName);
    if (current.parentFolder) {
      current = await mongoose.model('File').findById(current.parentFolder);
    } else {
      break;
    }
  }
  
  return '/' + path.join('/');
};

// Method to calculate folder size
fileSchema.methods.calculateFolderSize = async function() {
  if (!this.isFolder) return this.size;
  
  const files = await mongoose.model('File').find({ parentFolder: this._id });
  let totalSize = 0;
  
  for (const file of files) {
    if (file.isFolder) {
      totalSize += await file.calculateFolderSize();
    } else {
      totalSize += file.size;
    }
  }
  
  // Save the updated size
  this.size = totalSize;
  await this.save();
  
  return totalSize;
};

// Method to calculate total storage used by a user
fileSchema.statics.calculateUserStorage = async function(userId) {
  const files = await this.find({ 
    owner: userId,
    isFolder: false // Only count actual files, not folders
  });
  
  return files.reduce((total, file) => total + file.size, 0);
};

module.exports = mongoose.model('File', fileSchema); 