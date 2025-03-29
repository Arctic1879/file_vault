const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const File = require('../models/File');
const { encryptFile, decryptFile, generateEncryptedFileName } = require('../utils/encryption');
const User = require('../models/User');
const archiver = require('archiver');

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = process.env.FILE_STORAGE_PATH || 'uploads/';
    try {
      await fs.promises.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const encryptedName = generateEncryptedFileName(file.originalname);
    cb(null, encryptedName);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Helper function to update folder sizes up the chain
const updateFolderSizes = async (folderId) => {
  let currentFolder = await File.findById(folderId);
  while (currentFolder) {
    await currentFolder.calculateFolderSize();
    await currentFolder.save();
    currentFolder = await File.findById(currentFolder.parentFolder);
  }
};

// Upload file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    console.log('File upload started');
    if (!req.file) {
      console.log('No file received in request');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { maxDownloads, expiresIn, password } = req.body;
    let parentFolderId = req.body.folderId;

    // If no parent folder specified, use home folder
    if (!parentFolderId) {
      const homeFolder = await File.findOne({ 
        owner: req.user._id, 
        isFolder: true,
        isHomeFolder: true 
      });
      if (homeFolder) {
        parentFolderId = homeFolder._id;
      }
    }

    // Verify the parent folder exists and belongs to the user
    if (parentFolderId) {
      const parentFolder = await File.findOne({
        _id: parentFolderId,
        owner: req.user._id,
        isFolder: true
      });

      if (!parentFolder) {
        console.log('Parent folder not found or not accessible');
        return res.status(400).json({ message: 'Invalid parent folder' });
      }
    }

    // Check storage quota
    const user = await User.findById(req.user._id);
    const fileSize = req.file.size;
    
    if (user.storageUsed + fileSize > user.storageLimit) {
      await fs.promises.unlink(req.file.path);
      return res.status(400).json({ 
        message: 'Storage quota exceeded',
        currentUsage: user.storageUsed,
        limit: user.storageLimit
      });
    }

    console.log('File received:', {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    console.log('Upload parameters:', { maxDownloads, expiresIn, hasPassword: !!password });
    
    // Generate encrypted filename for storage
    const encryptedFilename = generateEncryptedFileName(req.file.originalname);
    const encryptedFilePath = path.join(process.env.FILE_STORAGE_PATH || 'uploads', encryptedFilename);
    
    // Encrypt the file
    await encryptFile(req.file.path, encryptedFilePath, password);
    console.log('File encrypted successfully');

    // Delete the temporary uploaded file
    await fs.promises.unlink(req.file.path);
    console.log('Temporary file deleted');

    // Calculate expiration date if maxDownloads is set
    const expiresAt = maxDownloads ? new Date() : null;
    if (expiresAt) {
      expiresAt.setDate(expiresAt.getDate() + (parseInt(expiresIn) || 7));
    }

    const file = new File({
      originalName: req.file.originalname,
      encryptedName: encryptedFilename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      owner: req.user._id,
      password: password || null,
      maxDownloads: parseInt(maxDownloads) || null,
      expiresAt,
      parentFolder: parentFolderId
    });

    console.log('Saving file to database...');
    await file.save();
    
    // Update user's storage usage
    const newStorageUsed = await user.updateStorageUsed(fileSize);
    
    // Update folder sizes if file was uploaded to a folder
    if (parentFolderId) {
      await updateFolderSizes(parentFolderId);
    }
    
    console.log('File saved successfully:', file._id);
    
    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: file._id,
        originalName: file.originalName,
        size: file.size,
        expiresAt: file.expiresAt,
        parentFolder: file.parentFolder
      },
      storageUsed: newStorageUsed,
      storageLimit: user.storageLimit
    });
  } catch (error) {
    console.error('File upload error:', error);
    console.error('Stack trace:', error.stack);
    if (req.file && req.file.path) {
      try {
        await fs.promises.unlink(req.file.path);
        console.log('Cleaned up temporary file after error');
      } catch (unlinkError) {
        console.error('Error deleting temporary file:', unlinkError);
      }
    }
    res.status(500).json({ 
      message: error.message || 'Error uploading file',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user's files
router.get('/my-files', auth, async (req, res) => {
  try {
    const { folderId } = req.query;
    console.log('Fetching files for user:', req.user._id);
    console.log('Folder ID:', folderId);

    // If no folderId is provided, only return the home folder
    if (!folderId) {
      const homeFolder = await File.findOne({ 
        owner: req.user._id, 
        isFolder: true,
        isHomeFolder: true 
      });
      
      if (homeFolder) {
        return res.json([{
          _id: homeFolder._id,
          originalName: homeFolder.originalName,
          isFolder: true,
          parentFolder: null,
          mimeType: 'folder',
          size: homeFolder.size,
          downloadCount: homeFolder.downloadCount,
          maxDownloads: homeFolder.maxDownloads,
          expiresAt: homeFolder.expiresAt,
          password: homeFolder.password
        }]);
      }
      return res.json([]);
    }

    // For any other folder, return its contents
    const query = {
      owner: req.user._id,
      parentFolder: folderId
    };

    console.log('MongoDB query:', query);
    const files = await File.find(query);
    console.log('Found files:', files.length);

    const formattedFiles = files.map(file => ({
      _id: file._id,
      originalName: file.originalName,
      isFolder: file.isFolder,
      parentFolder: file.parentFolder,
      mimeType: file.mimeType,
      size: file.size,
      downloadCount: file.downloadCount,
      maxDownloads: file.maxDownloads,
      expiresAt: file.expiresAt,
      password: file.password
    }));

    console.log('Files:', formattedFiles);
    res.json(formattedFiles);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Error fetching files' });
  }
});

// Download file
router.get('/download/:id', auth, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.user._id
    });

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.isFolder) {
      return res.status(400).json({ message: 'Cannot download a folder directly' });
    }

    // Check if file is password protected
    if (file.password) {
      const providedPassword = req.headers['x-file-password'];
      if (!providedPassword || providedPassword !== file.password) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    }

    // Check if file has expired
    if (file.expiresAt && new Date() > file.expiresAt) {
      return res.status(400).json({ message: 'File has expired' });
    }

    // Check if download limit has been reached
    if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
      return res.status(400).json({ message: 'Download limit reached' });
    }

    // Get the encrypted file path
    const encryptedFilePath = path.join(process.env.FILE_STORAGE_PATH || 'uploads', file.encryptedName);
    
    // Check if file exists
    if (!fs.existsSync(encryptedFilePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    // Decrypt the file
    const decryptedData = await decryptFile(encryptedFilePath, file.password || '');

    // Update download count
    file.downloadCount += 1;
    await file.save();

    // Set response headers
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Length', decryptedData.length);

    // Send the decrypted data
    res.send(decryptedData);

  } catch (error) {
    console.error('Error downloading file:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error downloading file' });
    }
  }
});

// Get storage info
router.get('/storage-info', auth, async (req, res) => {
  try {
    // Get all non-folder files for the current user
    const userFiles = await File.find({ 
      owner: req.user._id,
      isFolder: false 
    });
    
    // Calculate user's storage
    const userStorageUsed = userFiles.reduce((total, file) => total + (file.size || 0), 0);

    // Update the user's storage used in their profile
    const user = await User.findById(req.user._id);
    user.storageUsed = userStorageUsed;
    await user.save();

    res.json({
      used: userStorageUsed,
      limit: 100 * 1024 * 1024, // 100MB in bytes
      available: (100 * 1024 * 1024) - userStorageUsed
    });
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({ message: 'Error getting storage info' });
  }
});

// Delete file
router.delete('/:id', auth, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.user._id
    });

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // If it's a folder, recursively delete all contents
    if (file.isFolder) {
      await File.deleteMany({
        owner: req.user._id,
        $or: [
          { _id: file._id },
          { parentFolder: file._id }
        ]
      });
    } else {
      // Delete the file from storage
      const filePath = path.join(__dirname, '..', 'uploads', file.encryptedName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // Delete the file record
      await file.deleteOne();
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Error deleting file' });
  }
});

// Create folder
router.post('/create-folder', auth, async (req, res) => {
  try {
    const { name, parentFolderId } = req.body;
    console.log('Creating folder:', { name, parentFolderId });

    let finalParentId = parentFolderId;
    // If no parent folder specified, use home folder
    if (!parentFolderId) {
      const homeFolder = await File.findOne({ 
        owner: req.user._id, 
        isFolder: true,
        isHomeFolder: true 
      });
      if (homeFolder) {
        finalParentId = homeFolder._id;
      }
    }

    // Validate folder name
    if (!name || /[<>:"/\\|?*]/.test(name)) {
      return res.status(400).json({ message: 'Invalid folder name' });
    }

    // Check if folder already exists in parent
    const existingFolder = await File.findOne({
      owner: req.user._id,
      parentFolder: finalParentId,
      originalName: name,
      isFolder: true
    });

    if (existingFolder) {
      console.log('Folder already exists:', existingFolder);
      return res.status(400).json({ message: 'Folder already exists' });
    }

    const folder = new File({
      originalName: name,
      encryptedName: name,
      mimeType: 'folder',
      size: 0,
      owner: req.user._id,
      password: null,
      maxDownloads: null,
      downloadCount: 0,
      expiresAt: null,
      isFolder: true,
      isHomeFolder: false,
      parentFolder: finalParentId
    });

    console.log('Saving folder:', folder);
    await folder.save();
    console.log('Folder saved successfully:', folder._id);

    res.status(201).json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ message: 'Error creating folder' });
  }
});

// Rename file or folder
router.put('/:id/rename', auth, async (req, res) => {
  try {
    const { newName } = req.body;
    console.log('Renaming file/folder:', req.params.id, 'to:', newName);

    // Validate new name
    if (!newName || /[<>:"/\\|?*]/.test(newName)) {
      return res.status(400).json({ message: 'Invalid name' });
    }

    // Find the file/folder
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if name already exists in the same folder
    const existingFile = await File.findOne({
      owner: req.user._id,
      parentFolder: file.parentFolder,
      originalName: newName,
      _id: { $ne: file._id }
    });

    if (existingFile) {
      return res.status(400).json({ message: 'A file with this name already exists in this folder' });
    }

    // Update the name
    file.originalName = newName;
    if (file.isFolder) {
      file.encryptedName = newName; // For folders, encryptedName is same as originalName
    }
    await file.save();

    console.log('File/folder renamed successfully');
    res.json(file);
  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).json({ message: 'Error renaming file' });
  }
});

// Download folder as zip
router.get('/download-folder/:id', auth, async (req, res) => {
  try {
    const folder = await File.findOne({
      _id: req.params.id,
      owner: req.user._id,
      isFolder: true
    });

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    console.log('Download requested for folder:', folder._id);

    // Create a zip archive
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    // Set response headers
    res.attachment(`${folder.originalName}.zip`);
    archive.pipe(res);

    // Function to recursively add files to the archive
    const addFilesToArchive = async (currentFolder, currentPath = '') => {
      const files = await File.find({ parentFolder: currentFolder._id });
      
      for (const file of files) {
        const filePath = currentPath ? `${currentPath}/${file.originalName}` : file.originalName;
        
        if (file.isFolder) {
          // Create a folder in the zip by appending an empty buffer
          archive.append(Buffer.from(''), { name: filePath + '/' });
          await addFilesToArchive(file, filePath);
        } else {
          // Get the encrypted file path
          const encryptedFilePath = path.join(process.env.FILE_STORAGE_PATH || 'uploads', file.encryptedName);
          
          // Check if file exists
          if (!fs.existsSync(encryptedFilePath)) {
            console.error('File not found on disk:', file.encryptedName);
            continue;
          }

          try {
            // Decrypt the file
            const decryptedData = await decryptFile(encryptedFilePath, file.password || '');
            
            // Add the decrypted data to the archive
            archive.append(decryptedData, { name: filePath });
          } catch (error) {
            console.error('Error processing file:', file.originalName, error);
            continue;
          }
        }
      }
    };

    // Start adding files to the archive
    await addFilesToArchive(folder);

    // Finalize the archive
    await archive.finalize();

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error creating zip archive' });
      }
    });

  } catch (error) {
    console.error('Error downloading folder:', error);
    console.error('Stack trace:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error downloading folder' });
    }
  }
});

module.exports = router; 