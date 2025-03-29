const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');
const { Readable } = require('stream');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secure-encryption-key';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;

// Generate a random IV
const generateIV = () => {
  return crypto.randomBytes(IV_LENGTH);
};

// Generate a random salt
const generateSalt = () => {
  return crypto.randomBytes(SALT_LENGTH);
};

// Generate a random filename
const generateEncryptedFileName = (originalName) => {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const extension = path.extname(originalName);
  return `${timestamp}_${randomBytes}${extension}`;
};

// Derive key from password and salt
const deriveKey = (password, salt) => {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password || ENCRYPTION_KEY, salt, 32, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey);
    });
  });
};

// Encrypt file
const encryptFile = async (inputPath, outputPath, password = '') => {
  try {
    // Read the input file
    const fileData = await fs.promises.readFile(inputPath);
    
    // Generate salt and IV
    const salt = generateSalt();
    const iv = generateIV();
    
    // Derive key from password and salt
    const key = await deriveKey(password, salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the data
    const encryptedData = Buffer.concat([
      cipher.update(fileData),
      cipher.final()
    ]);
    
    // Get the auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine all components
    const finalData = Buffer.concat([
      salt,           // 16 bytes
      iv,            // 16 bytes
      authTag,       // 16 bytes
      encryptedData  // variable length
    ]);
    
    // Write the encrypted data to the output file
    await fs.promises.writeFile(outputPath, finalData);
    
    return true;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
};

// Decrypt file
const decryptFile = async (inputPath, password = '') => {
  try {
    // Read the encrypted file
    const encryptedData = await fs.promises.readFile(inputPath);
    
    // Extract components
    const salt = encryptedData.slice(0, SALT_LENGTH);
    const iv = encryptedData.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = encryptedData.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const data = encryptedData.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from password and salt
    const key = await deriveKey(password, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    const decryptedData = Buffer.concat([
      decipher.update(data),
      decipher.final()
    ]);
    
    return decryptedData;
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
};

module.exports = {
  generateEncryptedFileName,
  encryptFile,
  decryptFile
}; 