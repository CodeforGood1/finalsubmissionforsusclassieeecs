# Mixed Media Upload Feature - Complete Guide

## Overview
Added a new feature that allows teachers to upload PDFs and videos together in one operation. The system automatically routes PDFs to document/text steps and videos to video steps.

## What Was Implemented

### Backend (server.js)
1. **New Endpoint**: `POST /api/teacher/upload-module-mixed`
   - Accepts mixed file types (PDFs and videos)
   - Max 50 files total
   - Automatically separates files by MIME type
   - Creates appropriate step types for each file
   - Returns counts of PDFs and videos uploaded

### Frontend (ModuleBuilder.jsx)
1. **New Button**: "Mixed Media Upload" (indigo color)
2. **Mixed Media Modal** with:
   - Module Title input
   - Subject input
   - Section selector
   - File input accepting both PDFs and videos
   - Smart file list showing file type badges
   - Upload progress indicator

## How It Works

### File Type Detection
- **PDFs**: `application/pdf` MIME type → Creates 'pdf' type steps
- **Videos**: `video/*` MIME types → Creates 'video' type steps
- **Unsupported**: Any other file type is rejected with error message

### Step Creation Logic
```javascript
// PDFs become document steps
{
  type: 'pdf',
  header: 'Filename without extension',
  data: {
    url: '/uploads/documents/filename.pdf',
    filename: 'Original.pdf',
    size: 123456
  }
}

// Videos become video steps
{
  type: 'video',
  header: 'Filename without extension',
  data: '/uploads/videos/filename.mp4'
}
```

### File Storage
- PDFs: `/app/backend/uploads/documents/`
- Videos: `/app/backend/uploads/videos/`
- Both served via Express static middleware

## Testing Instructions

### 1. Login as Teacher
```
URL: http://localhost
Email: susclass.global+sarah.teacher@gmail.com
Password: password123
```

### 2. Access Mixed Media Upload
1. Go to Module Builder
2. Click "Mixed Media Upload" button (indigo)
3. Fill in form:
   - Module Title: "Complete Course Materials"
   - Subject: "Biology"
   - Section: "SS1 A"
4. Select files (mix of PDFs and videos)
5. Review file list with type badges
6. Click "Upload X Files"

### 3. Verify Module Created
- Check "Live Modules" section
- Module should show correct step count
- Note: Step count = total PDFs + total videos

### 4. Test Student View
```
Login: susclass.global+amara@gmail.com / student123
```
1. Go to "My Courses"
2. Find the mixed media module
3. Navigate through steps
4. Verify:
   - PDF steps show embedded viewer
   - Video steps show video player
   - All files load correctly
   - Progress tracking works

## Features

### Smart File Handling
- Automatically detects file types
- Routes to correct step type
- Preserves upload order
- Generates clean step titles from filenames

### Error Handling
- Validates all files before upload
- Rejects unsupported file types
- Shows clear error messages
- Lists problematic files by name

### User Experience
- Visual file type indicators (📄 for PDF, 🎬 for video)
- Color-coded badges (red for PDF, blue for video)
- File size display
- Upload progress feedback
- Success confirmation with counts

## API Response

### Success Response
```json
{
  "success": true,
  "moduleId": 9,
  "sections": ["SS1 A"],
  "pdfCount": 3,
  "videoCount": 2,
  "totalSteps": 5,
  "message": "Module created with 3 PDFs and 2 videos"
}
```

### Error Response
```json
{
  "error": "Only PDF and video files allowed. Unsupported files: document.docx, image.png"
}
```

## Database Structure

Module stored in `modules` table:
```sql
{
  "id": 9,
  "topic_title": "Complete Course Materials",
  "subject": "Biology",
  "section": "SS1 A",
  "step_count": 5,
  "steps": [
    {
      "type": "pdf",
      "header": "Chapter 1",
      "data": {...}
    },
    {
      "type": "video",
      "header": "Lecture 1",
      "data": "/uploads/videos/..."
    },
    ...
  ]
}
```

## Comparison with Other Upload Methods

### Bulk PDF Upload
- **Purpose**: Upload only PDFs
- **Button**: Purple "📄 Bulk PDF Upload"
- **Result**: All steps are PDF type
- **Use Case**: Document-heavy modules

### Mixed Media Upload
- **Purpose**: Upload PDFs and videos together
- **Button**: Indigo "Mixed Media Upload"
- **Result**: Mixed PDF and video steps
- **Use Case**: Complete course materials

### Manual Module Builder
- **Purpose**: Create custom modules step-by-step
- **Button**: Green "Create New Module"
- **Result**: Any combination of step types
- **Use Case**: Complex modules with MCQs, coding, etc.

## Technical Details

### File Validation
```javascript
const pdfFiles = req.files.filter(f => f.mimetype === 'application/pdf');
const videoFiles = req.files.filter(f => f.mimetype.startsWith('video/'));
const unsupportedFiles = req.files.filter(f => 
  f.mimetype !== 'application/pdf' && !f.mimetype.startsWith('video/')
);
```

### Supported Video Formats
- MP4 (video/mp4)
- WebM (video/webm)
- OGG (video/ogg)
- MOV (video/quicktime)
- AVI (video/x-msvideo)
- MKV (video/x-matroska)

### File Size Limits
- Max file size: 500MB per file (configurable)
- Max files: 50 total (configurable)
- No limit on total upload size (within server limits)

## Notifications

Students receive in-app notifications with:
- Module title
- Teacher name
- PDF count
- Video count
- Direct link to module

Example:
> "Dr. Sarah Okonkwo published 'Complete Course Materials' with 3 PDFs and 2 videos. Start learning now!"

## Performance Considerations

- Files uploaded sequentially via FormData
- Large files may take time to upload
- Progress indicator shows upload status
- Backend processes files in order received
- No client-side file size validation (handled by server)

## Security

- Teacher authentication required
- File type validation on server
- MIME type checking
- Unique filename generation
- Files stored outside public directory
- Served through controlled Express routes

## Troubleshooting

### Upload Fails
- Check file types are PDF or video
- Verify file sizes under 500MB
- Check server logs: `docker logs lms-backend`
- Ensure sufficient disk space

### Files Not Displaying
- Check browser console for errors
- Verify file URLs in database
- Check file exists: `docker exec lms-backend ls /app/backend/uploads/`
- Test direct file access: `http://localhost/uploads/videos/filename.mp4`

### Wrong Step Type
- Backend automatically detects MIME type
- If wrong type, check file's actual MIME type
- Rename file with correct extension if needed

## Files Modified

1. **backend/server.js**
   - Added `/api/teacher/upload-module-mixed` endpoint
   - File type separation logic
   - Mixed step creation

2. **client/src/pages/ModuleBuilder.jsx**
   - Added mixed media upload state
   - Added mixed media modal UI
   - Added file type detection and display
   - Added upload handler

3. **client/src/pages/ModuleLearning.jsx**
   - Already supports PDF and video steps
   - No changes needed

## No Breaking Changes

- All existing features work as before
- Backward compatible with existing modules
- No database migrations required
- No changes to existing endpoints

## Future Enhancements

Possible improvements:
- Drag-and-drop file upload
- Reorder files before upload
- Preview files before upload
- Batch file compression
- Upload progress per file
- Resume interrupted uploads
- Cloud storage integration (optional)

## Summary

The mixed media upload feature provides a streamlined way for teachers to create comprehensive learning modules by uploading PDFs and videos together. The system intelligently routes each file to the appropriate step type, maintaining the upload order and providing clear feedback throughout the process.

**Key Benefits:**
- Saves time (one upload operation instead of multiple)
- Maintains file order
- Clear visual feedback
- Automatic type detection
- No manual step creation needed
- Works with existing module system
