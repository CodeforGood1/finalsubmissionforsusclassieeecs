# Bulk PDF Upload Feature - Testing Guide

## Feature Overview
Added a new feature that allows teachers to upload multiple PDF files at once, with each PDF becoming a separate step in a learning module.

## What Was Added

### Backend Changes (server.js)
1. **New Endpoint**: `POST /api/teacher/upload-module-pdfs`
   - Accepts multiple PDF files (max 50)
   - Validates all files are PDFs
   - Creates module with each PDF as a step
   - Sends notifications to students
   - Returns module ID and PDF count

### Frontend Changes

#### ModuleBuilder.jsx
1. **New UI Button**: "📄 Bulk PDF Upload" button next to "Create New Module"
2. **Bulk PDF Modal** with fields:
   - Module Title (required)
   - Subject (required)
   - Target Section (required)
   - PDF File Selector (multiple files, max 50)
   - File list preview with sizes
3. **Upload Handler**: Validates inputs and uploads PDFs via FormData

#### ModuleLearning.jsx
1. **PDF Step Renderer**: New step type 'pdf'
   - Shows PDF icon and metadata
   - Download button
   - Embedded PDF viewer (iframe, 80vh height)
   - Displays filename and file size

## How to Test

### Step 1: Login as Teacher
1. Go to http://localhost
2. Login with teacher credentials:
   - Email: `susclass.global+sarah.teacher@gmail.com`
   - Password: `password123`

### Step 2: Access Module Builder
1. Click "Module Builder" in the navigation
2. You should see the new "📄 Bulk PDF Upload" button

### Step 3: Upload PDFs
1. Click "📄 Bulk PDF Upload"
2. Fill in:
   - Module Title: "Biology Study Materials"
   - Subject: "Biology"
   - Section: Select from dropdown (e.g., "SS1 A")
3. Click "Select PDF Files" and choose 2-5 PDF files
4. Review the file list
5. Click "Upload X PDFs"
6. Wait for success message

### Step 4: Verify Module Created
1. Check the "Live Modules" section
2. You should see the new module with PDF count
3. Note the module sections and step count

### Step 5: Test Student View
1. Logout and login as student:
   - Email: `susclass.global+amara@gmail.com` (SS1 A)
   - Password: `student123`
2. Go to "My Courses"
3. Find the new module
4. Click to open it
5. Navigate through PDF steps
6. Verify:
   - PDF displays in iframe
   - Download button works
   - Navigation between steps works
   - Progress tracking works

## Expected Behavior

### Success Case
- Module created with N steps (one per PDF)
- Each step has type 'pdf'
- Step header = PDF filename (without .pdf extension)
- Students can view PDFs inline
- Students can download PDFs
- Progress tracking works per step

### Error Cases
- No PDFs selected: "Please select at least one PDF file"
- Missing title: "Please enter a module title"
- Missing subject: "Please enter a subject"
- Missing section: "Please select a section"
- Non-PDF files: Filtered out with warning
- Upload fails: Error message displayed

## Technical Details

### PDF Step Structure
```json
{
  "type": "pdf",
  "header": "Chapter 1 - Introduction",
  "data": {
    "url": "/uploads/documents/timestamp-hash-filename.pdf",
    "filename": "Chapter 1 - Introduction.pdf",
    "size": 1234567
  }
}
```

### File Storage
- PDFs stored in: `/uploads/documents/`
- Filename format: `timestamp-randomhash-originalname.pdf`
- Served via Express static middleware

### Database
- Stored in `modules.steps` JSONB column
- Same structure as other module types
- Compatible with existing module system

## Notes
- Max 50 PDFs per upload (configurable in multer)
- Max file size: 500MB per file (configurable)
- Only PDF files accepted (application/pdf MIME type)
- Filename used as step title (without extension)
- All existing features remain unchanged
- No database migrations needed
