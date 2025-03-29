# ArcticVault - Secure File Sharing System

A secure, user-friendly file sharing application built with React and Node.js. This project demonstrates implementation of end-to-end encryption, modern UI/UX practices, and full-stack development skills.

## Features

- 🔒 **End-to-End Encryption**: All files are encrypted before storage using AES-256-GCM
- 📁 **Folder Organization**: Create and manage nested folder structures
- 🔗 **Secure Sharing**: Password protection and download limits for sensitive files
- 📊 **Storage Management**: User storage tracking with 100MB allocation
- 🌓 **Dark/Light Mode**: Elegant theme switching with Material-UI
- 📱 **Responsive Design**: Mobile-first approach for all screen sizes
- 🔄 **Real-time Updates**: Instant UI updates for file operations
- 📦 **Folder Downloads**: Download entire folders as ZIP archives

## Tech Stack

- **Frontend**: React, Material-UI, React Router
- **Backend**: Node.js, Express
- **Database**: MongoDB
- **Authentication**: JWT
- **File Storage**: Local filesystem with encryption
- **File Compression**: Archiver for folder downloads

## Local Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   # Install backend dependencies
   npm install

   # Install frontend dependencies
   cd client
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   FILE_STORAGE_PATH=uploads/
   PORT=5000
   ```

4. Start the development servers:
   ```bash
   # Start backend (from root directory)
   npm run dev

   # Start frontend (from client directory)
   cd client
   npm start
   ```

The application will be available at `http://localhost:3000`

## Key Implementation Details

- **Security**: 
  - End-to-end file encryption
  - Secure password hashing
  - JWT authentication
  - File-level password protection

- **User Experience**:
  - Drag-and-drop file uploads
  - Progress tracking for uploads/downloads
  - Intuitive folder navigation
  - Responsive storage usage display

- **Architecture**:
  - RESTful API design
  - Modular component structure
  - Clean separation of concerns
  - Efficient file handling

## Screenshots

[Coming soon]

## Author

[Arctic1879](https://github.com/Arctic1879) - Creator and maintainer of ArcticVault

## License

This project is licensed under the MIT License. 