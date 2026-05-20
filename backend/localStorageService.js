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

const EXTENSION_ALLOWLIST = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.pdf', '.csv', '.doc', '.docx'
]);

// Generate unique filename using only server-side random data.
const generateFilename = (originalname) => {
  const ext = path.extname(originalname || '').toLowerCase();
  const safeExt = EXTENSION_ALLOWLIST.has(ext) ? ext : '';
  return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${safeExt}`;
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

const sanitizeStoredFilename = (filename) => {
  const cleanName = path.basename(filename || '');
  const newRandomName = /^[0-9]+-[a-f0-9]{32}\.[a-z0-9]+$/i;
  const legacyRandomName = /^[0-9]+-[a-f0-9]{16}(?:-[a-zA-Z0-9-]{1,50})?\.[a-z0-9]+$/i;
  if (!newRandomName.test(cleanName) && !legacyRandomName.test(cleanName)) {
    throw new Error('Invalid filename');
  }
  return cleanName;
};

const sanitizeStorageType = (type = 'images') => {
  if (!['images', 'videos', 'documents', 'temp'].includes(type)) {
    throw new Error('Invalid storage type');
  }
  return type;
};

// Get public URL for a file
const getFileUrl = (filename, type = 'images') => {
  // Returns relative URL that will be served by Express or nginx
  return `/uploads/${sanitizeStorageType(type)}/${sanitizeStoredFilename(filename)}`;
};

// Get absolute file path
const getFilePath = (filename, type = 'images') => {
  const safeType = sanitizeStorageType(type);
  const safeName = sanitizeStoredFilename(filename);
  const filePath = path.join(UPLOAD_BASE_DIR, safeType, safeName);
  const resolvedBase = path.resolve(UPLOAD_BASE_DIR, safeType);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedBase + path.sep)) {
    throw new Error('Invalid file path');
  }
  return resolvedFile;
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
      const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(range);
      const sendRangeNotSatisfiable = () => {
        res.writeHead(416, {
          'Content-Range': `bytes */${fileSize}`,
          'Accept-Ranges': 'bytes'
        });
        res.end();
      };

      if (!rangeMatch || fileSize === 0) {
        return sendRangeNotSatisfiable();
      }

      const [, startText, endText] = rangeMatch;
      let start;
      let end;

      if (!startText && !endText) {
        return sendRangeNotSatisfiable();
      }

      if (!startText) {
        const suffixLength = parseInt(endText, 10);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
          return sendRangeNotSatisfiable();
        }
        start = Math.max(fileSize - suffixLength, 0);
        end = fileSize - 1;
      } else {
        start = parseInt(startText, 10);
        end = endText ? parseInt(endText, 10) : fileSize - 1;
      }

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        start >= fileSize ||
        end < start
      ) {
        return sendRangeNotSatisfiable();
      }

      end = Math.min(end, fileSize - 1);
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
  const safeType = sanitizeStorageType(type);
  const dirPath = path.join(UPLOAD_BASE_DIR, safeType);
  return new Promise((resolve, reject) => {
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        if (err.code === 'ENOENT') {
          resolve([]);
        } else {
          reject(err);
        }
      } else {
        const fileList = [];
        for (const filename of files) {
          try {
            const safeName = sanitizeStoredFilename(filename);
            fileList.push({
              filename: safeName,
              url: getFileUrl(safeName, safeType),
              path: getFilePath(safeName, safeType)
            });
          } catch (_) {
            // Ignore unexpected files in the upload directory.
          }
        }
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
  sanitizeStoredFilename,
  sanitizeStorageType,
  UPLOAD_BASE_DIR,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_DOCUMENT_TYPES
};
