# 📝 MCQ Test System - Complete Guide

## 🎯 System Overview

### What It Does:
1. **Teacher** posts MCQ tests (15-20 questions) for their class with a deadline
2. **Students** see tests in "Test Knowledge" page on dashboard
3. **Student Progress** shows completed, pending, and overdue tests
4. **Teacher** clicks a student to see their test results and progress

---

## 🗄️ Database Setup

### Run this SQL script in Neon Console:

**File**: `sus - Copy/backend/database-addon-simple.sql`

This creates:
- ✅ `mcq_tests` table - Teacher-posted tests
- ✅ `test_submissions` table - Student submissions with auto-scoring
- ✅ Views for progress tracking
- ✅ Trigger for automatic score calculation
- ✅ Helper function for detailed progress

---

## 🚀 API Endpoints (21 Total)

### Teacher Routes:

#### 14. Create MCQ Test
```
POST /api/teacher/test/create
Headers: Authorization: Bearer <token>
Body: {
  "section": "ECE A",
  "title": "JavaScript Fundamentals Test",
  "description": "Complete within 1 week",
  "questions": [
    {
      "question": "What is a closure in JavaScript?",
      "a": "A function",
      "b": "A function with access to parent scope",
      "c": "A loop",
      "d": "A variable",
      "correct": "B"
    },
    // ... 14-19 more questions
  ],
  "deadline": "2026-01-21T23:59:59Z"
}
```

#### 15. Get All Tests for Section
```
GET /api/teacher/tests/:section
Example: GET /api/teacher/tests/ECE A

Response: [{
  test_id: 1,
  title: "JavaScript Fundamentals Test",
  section: "ECE A",
  total_questions: 20,
  deadline: "2026-01-21T23:59:59Z",
  total_submissions: 15,
  average_score: 75.50,
  passed_count: 12,
  failed_count: 3
}]
```

#### 16. Get Test Submissions
```
GET /api/teacher/test/:testId/submissions
Example: GET /api/teacher/test/1/submissions

Response: [{
  id: 1,
  student_name: "John Doe",
  student_reg_no: "REG001",
  score: 16,
  percentage: 80.00,
  status: "completed",
  submitted_at: "2026-01-15T10:30:00Z",
  time_taken: 1200
}]
```

#### 17. Get Student's Detailed Progress
```
GET /api/teacher/student/:studentId/progress
Example: GET /api/teacher/student/5/progress

Response: {
  student: {
    student_id: 5,
    student_name: "John Doe",
    reg_no: "REG001",
    full_section: "ECE A",
    total_tests_assigned: 5,
    tests_completed: 3,
    tests_overdue: 1,
    average_score: 78.50
  },
  tests: [
    {
      test_id: 1,
      test_title: "JS Test",
      test_deadline: "...",
      score: 16,
      percentage: 80.00,
      status: "completed",
      is_overdue: false,
      is_completed: true
    },
    {
      test_id: 2,
      test_title: "CSS Test",
      test_deadline: "...",
      score: null,
      is_overdue: true,
      is_completed: false
    }
  ]
}
```

---

### Student Routes:

#### 18. Get My Tests (Pending & Completed)
```
GET /api/student/tests
Headers: Authorization: Bearer <token>

Response: [{
  id: 1,
  title: "JavaScript Fundamentals Test",
  description: "Complete within 1 week",
  total_questions: 20,
  deadline: "2026-01-21T23:59:59Z",
  teacher_name: "Dr. Smith",
  submission_id: null,
  score: null,
  completion_status: "pending",
  is_overdue: false
}, {
  id: 2,
  title: "CSS Basics Test",
  submission_id: 5,
  score: 18,
  percentage: 90.00,
  status: "completed",
  submitted_at: "...",
  completion_status: "completed",
  is_overdue: false
}]
```

#### 19. Get Test to Take
```
GET /api/student/test/:testId
Example: GET /api/student/test/1

Response: {
  id: 1,
  title: "JavaScript Fundamentals Test",
  description: "Complete within 1 week",
  questions: [
    {
      "question": "What is a closure?",
      "a": "A function",
      "b": "A function with access to parent scope",
      "c": "A loop",
      "d": "A variable",
      "correct": "B"
    }
    // ... more questions
  ],
  total_questions: 20,
  deadline: "2026-01-21T23:59:59Z"
}
```

#### 20. Submit Test
```
POST /api/student/test/submit
Headers: Authorization: Bearer <token>
Body: {
  "test_id": 1,
  "answers": {
    "0": "B",
    "1": "A",
    "2": "C",
    // ... answers for all questions
  },
  "time_taken": 1200
}

Response: {
  success: true,
  submission: {
    id: 5,
    score: 16,
    percentage: 80.00,
    status: "completed"
  }
}
```

#### 21. Get My Progress Overview
```
GET /api/student/progress
Headers: Authorization: Bearer <token>

Response: {
  student_id: 5,
  student_name: "John Doe",
  reg_no: "REG001",
  full_section: "ECE A",
  total_tests_assigned: 5,
  tests_completed: 3,
  tests_overdue: 1,
  average_score: 78.50,
  last_submission_date: "2026-01-15T10:30:00Z"
}
```

---

## 📊 How It Works

### Teacher Workflow:

1. **Login as Teacher**
2. **Go to Teacher Dashboard**
3. **Create MCQ Test**:
   - Select section (e.g., "ECE A")
   - Enter title and description
   - Add 15-20 MCQ questions
   - Set deadline (e.g., 1 week from now)
   - Click "Post Test"

4. **View Test Statistics**:
   - See how many students submitted
   - View average score
   - See pass/fail counts

5. **Click on a Student**:
   - View their test history
   - See completed tests with scores
   - See pending/overdue tests
   - View overall progress

---

### Student Workflow:

1. **Login as Student**
2. **Go to Dashboard → Test Knowledge**
3. **See List of Tests**:
   - Pending tests (not yet taken)
   - Completed tests (with scores)
   - Overdue tests (missed deadline)

4. **Take a Test**:
   - Click on pending test
   - Answer 15-20 MCQ questions
   - Submit before deadline
   - See immediate results

5. **View Progress**:
   - Go to "Progress Tracker"
   - See total tests assigned
   - See tests completed
   - See average score
   - See overdue tests

---

## 🎨 Frontend Integration

### Update TestKnowledge.jsx

```javascript
// Fetch student's tests
useEffect(() => {
  fetch('http://localhost:5000/api/student/tests', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    const pending = data.filter(t => t.completion_status === 'pending');
    const completed = data.filter(t => t.completion_status === 'completed');
    setPendingTests(pending);
    setCompletedTests(completed);
  });
}, []);
```

### Update ProgressTracker.jsx

```javascript
// Fetch student's progress
useEffect(() => {
  fetch('http://localhost:5000/api/student/progress', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    setProgress(data);
  });
}, []);
```

### Update TeacherDashboard.jsx

```javascript
// When teacher clicks a student
const viewStudentProgress = (studentId) => {
  fetch(`http://localhost:5000/api/teacher/student/${studentId}/progress`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    setSelectedStudent(data.student);
    setStudentTests(data.tests);
    setShowProgressModal(true);
  });
};
```

---

## 🗄️ Database Schema

### mcq_tests
```
id              SERIAL PRIMARY KEY
teacher_id      INTEGER (FK → teachers)
teacher_name    TEXT
section         TEXT (e.g., "ECE A")
title           TEXT
description     TEXT
questions       JSONB (array of questions)
total_questions INTEGER
deadline        TIMESTAMP
created_at      TIMESTAMP
is_active       BOOLEAN
```

### test_submissions
```
id              SERIAL PRIMARY KEY
test_id         INTEGER (FK → mcq_tests)
student_id      INTEGER (FK → students)
student_name    TEXT
student_reg_no  TEXT
answers         JSONB (student's answers)
score           INTEGER (auto-calculated)
percentage      DECIMAL (auto-calculated)
status          TEXT ('completed' or 'late')
submitted_at    TIMESTAMP
time_taken      INTEGER (seconds)
```

---

## ✅ Features

### Automatic Calculations:
- ✅ Score auto-calculated by comparing answers
- ✅ Percentage auto-calculated
- ✅ Status auto-set (completed/late based on deadline)

### Data Integrity:
- ✅ One submission per student per test (UNIQUE constraint)
- ✅ Foreign key constraints
- ✅ Cascade deletes

### Progress Tracking:
- ✅ Total tests assigned
- ✅ Tests completed
- ✅ Tests overdue
- ✅ Average score
- ✅ Last submission date

---

## 🧪 Testing Steps

1. **Run SQL Script**: Copy `database-addon-simple.sql` to Neon
2. **Backend Running**: Already running on port 5000
3. **Login as Teacher**: Create a test with 15-20 questions
4. **Login as Student**: See test in "Test Knowledge"
5. **Take Test**: Submit answers
6. **Check Progress**: View in "Progress Tracker"
7. **Teacher View**: Click student to see their progress

---

## 📈 Example Test JSON

```json
{
  "section": "ECE A",
  "title": "JavaScript Fundamentals - Week 1",
  "description": "Complete this test within 1 week to assess your understanding of JavaScript basics",
  "questions": [
    {
      "question": "What is the correct syntax for referring to an external script called 'app.js'?",
      "a": "<script href='app.js'>",
      "b": "<script name='app.js'>",
      "c": "<script src='app.js'>",
      "d": "<script file='app.js'>",
      "correct": "C"
    },
    {
      "question": "How do you write 'Hello World' in an alert box?",
      "a": "msgBox('Hello World');",
      "b": "alert('Hello World');",
      "c": "msg('Hello World');",
      "d": "alertBox('Hello World');",
      "correct": "B"
    }
    // ... 13-18 more questions
  ],
  "deadline": "2026-01-21T23:59:59Z"
}
```

---

## 🎯 Summary

✅ **Backend**: 21 API routes (8 new for MCQ system)  
✅ **Database**: 2 new tables with auto-scoring  
✅ **Teacher**: Post tests, view submissions, see student progress  
✅ **Student**: Take tests, view results, track progress  
✅ **Auto-grading**: Scores calculated automatically  
✅ **Deadline tracking**: Shows overdue tests  

**Execute the SQL script to complete setup.**
