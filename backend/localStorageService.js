// Local File Storage Service - On-premise file handling

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Base upload directory - configurable via environment variable
const UPLOAD_BASE_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = [
    path.join(UPLOAD_BASE_DIR, 'images'),
    path.join(UPLOAD_BASE_DIR, 'videos'),
    path.join(UPLOAD_BASE_DIR, 'documents'),
    path.join(UPLOAD_BASE_DIR, 'temp')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created upload directory: ${dir}`);
    }
  });
  
  return UPLOAD_BASE_DIR;
};

// Generate unique filename with timestamp and random string
const generateFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalname).toLowerCase();
  const baseName = path.basename(originalname, ext)
    .replace(/[^a-zA-Z0-9]/g, '-')
    .substring(0, 50);
  return `${timestamp}-${randomString}-${baseName}${ext}`;
};

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

// File filter for security
const fileFilter = (req, file, cb) => {
  const allAllowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES];
  
  if (allAllowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: images, videos, PDF, CSV`), false);
  }
};

// Determine destination based on file type
const getDestination = (file) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return path.join(UPLOAD_BASE_DIR, 'images');
  } else if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    return path.join(UPLOAD_BASE_DIR, 'videos');
  } else if (ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
    return path.join(UPLOAD_BASE_DIR, 'documents');
  }
  return path.join(UPLOAD_BASE_DIR, 'temp');
};

// Configure multer storage
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = getDestination(file);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  }
});

// Create multer upload instance
const createUploader = (options = {}) => {
  const defaults = {
    storage: localStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: options.maxSize || 500 * 1024 * 1024, // 500MB default for videos
      files: options.maxFiles || 10
    }
  };
  
  return multer({ ...defaults, ...options });
};

// Default uploader instance
const upload = createUploader();

// Get public URL for a file
const getFileUrl = (filename, type = 'images') => {
  // Returns relative URL that will be served by Express or nginx
  return `/uploads/${type}/${filename}`;
};

// Get absolute file path
const getFilePath = (filename, type = 'images') => {
  return path.join(UPLOAD_BASE_DIR, type, filename);
};

// Delete file
const deleteFile = (filename, type = 'images') => {
  const filePath = getFilePath(filename, type);
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
};

// Get file info
const getFileInfo = (filename, type = 'images') => {
  const filePath = getFilePath(filename, type);
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          filename,
          path: filePath,
          url: getFileUrl(filename, type),
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }
    });
  });
};

// Video streaming helper with range support
const streamVideo = (req, res, filename) => {
  const filePath = getFilePath(filename, 'videos');
  
  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Video not found' });
      }
      return res.status(500).json({ error: 'Error accessing video' });
    }
    
    const fileSize = stats.size;
    const range = req.headers.range;
    
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      
      const file = fs.createReadStream(filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });
      
      file.pipe(res);
    } else {
      // No range requested - send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      });
      
      fs.createReadStream(filePath).pipe(res);
    }
  });
};

// List files in a directory
const listFiles = (type = 'images') => {
  const dirPath = path.join(UPLOAD_BASE_DIR, type);
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        if (err.code === 'ENOENT') {
          resolve([]);
        } else {
          reject(err);
        }
      } else {
        const fileList = files.map(filename => ({
          filename,
          url: getFileUrl(filename, type),
          path: path.join(dirPath, filename)
        }));
        resolve(fileList);
      }
    });
  });
};

// Get disk usage statistics
const getDiskUsage = async () => {
  const types = ['images', 'videos', 'documents'];
  const stats = {};
  
  for (const type of types) {
    const files = await listFiles(type);
    let totalSize = 0;
    
    for (const file of files) {
      try {
        const fileStat = fs.statSync(file.path);
        totalSize += fileStat.size;
      } catch (e) {
        // Skip if file doesn't exist
      }
    }
    
    stats[type] = {
      count: files.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    };
  }
  
  return stats;
};

module.exports = {
  ensureUploadDirs,
  upload,
  createUploader,
  getFileUrl,
  getFilePath,
  deleteFile,
  getFileInfo,
  streamVideo,
  listFiles,
  getDiskUsage,
  generateFilename,
  UPLOAD_BASE_DIR,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_DOCUMENT_TYPES
};
