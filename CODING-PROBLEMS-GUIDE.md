# 💻 Coding Problems Feature - Complete Guide

## Overview
Teachers can now create auto-graded coding problems with predefined test cases. Students write code in the browser, and it's automatically evaluated against teacher's test cases.

---

## 🎯 For Teachers: Creating Coding Problems

### Step 1: Access Module Builder
1. Go to Teacher Dashboard
2. Select a section
3. Click "Create New Module"

### Step 2: Add Coding Problem Step
1. Enter a topic title (e.g., "Sum of Two Numbers")
2. Select content type: **💻 Coding Problem (Auto-Graded)**

### Step 3: Configure the Problem

#### A. Problem Description
Write a clear problem statement:
```
Write a program that takes two integers as input and prints their sum.

Input Format:
Two space-separated integers

Output Format:
A single integer (the sum)

Example:
Input: 5 10
Output: 15
```

#### B. Starter Code Templates
Provide starter code for each language. Students will see this when they open the problem.

**Java Example:**
```java
import java.util.*;

public class Solution {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    // Read two integers
    // Calculate sum
    // Print result
  }
}
```

**Python Example:**
```python
# Read two integers
# Calculate sum
# Print result
```

#### C. Test Cases
Add multiple test cases for comprehensive grading:

**Test Case 1 (Visible):**
- Input: `5 10`
- Expected: `15`
- Hidden: ❌ (Students can see this)

**Test Case 2 (Visible):**
- Input: `0 0`
- Expected: `0`
- Hidden: ❌

**Test Case 3 (Hidden):**
- Input: `-5 10`
- Expected: `5`
- Hidden: ✅ (Students can't see this)

**Test Case 4 (Hidden):**
- Input: `100 200`
- Expected: `300`
- Hidden: ✅

**Why Hidden Test Cases?**
- Prevents students from hardcoding outputs
- Tests edge cases
- Ensures genuine problem-solving

#### D. Constraints (Optional)
- Time Limit: 5000ms (default)
- Memory Limit: 256MB (default)

### Step 4: Publish Module
Click "Add Step" then "Publish Module"

---

## 👨‍🎓 For Students: Solving Coding Problems

### Step 1: Access the Problem
1. Go to Student Dashboard
2. Click on a module with coding problems
3. Navigate to the coding step

### Step 2: Understand the Problem
- Read the problem description carefully
- Check the sample test cases
- Note the input/output format

### Step 3: Write Your Solution
1. Select your preferred language (Java, Python, Node.js, C++)
2. Write code in the editor
3. Use the starter code as a template

### Step 4: Test Your Code
1. Enter test input in the STDIN box
2. Click "Run Code"
3. Check the terminal output
4. Debug if needed

### Step 5: Submit for Grading
1. Click "Submit Solution"
2. Your code runs against ALL test cases (visible + hidden)
3. Get instant feedback with score

**Score Calculation:**
```
Score = (Passed Test Cases / Total Test Cases) × 100
```

Example: 3 out of 4 test cases passed = 75%

---

## 🔧 Technical Details

### Database Schema
```sql
CREATE TABLE student_submissions (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  student_email VARCHAR(255),
  module_id INT NOT NULL,
  submitted_code TEXT NOT NULL,
  language VARCHAR(50) NOT NULL,
  test_cases_passed INT DEFAULT 0,
  total_test_cases INT DEFAULT 0,
  score DECIMAL(5, 2) DEFAULT 0.00,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints

**Submit Code:**
```
POST /api/student/submit-code
Headers: Authorization: Bearer <token>
Body: {
  moduleId: number,
  code: string,
  language: string,
  testCases: Array<{input: string, expected: string}>
}
```

**Response:**
```json
{
  "success": true,
  "score": 75.00,
  "passed": 3,
  "total": 4
}
```

### Code Execution
- Uses Piston API (https://emkc.org/api/v2/piston)
- Supports: Java, Python, JavaScript, C++
- Runs in isolated sandbox
- 5-second timeout per execution

---

## 📊 Views & Analytics

### Available Database Views

1. **v_student_coding_progress** - Individual student stats
2. **v_module_coding_stats** - Module performance metrics
3. **v_submission_details** - Complete submission history
4. **v_teacher_coding_dashboard** - Teacher overview
5. **v_language_statistics** - Language usage stats

### Sample Queries

**Get student's best score:**
```sql
SELECT * FROM get_best_submission(student_id, module_id);
```

**Get leaderboard:**
```sql
SELECT * FROM get_coding_leaderboard('ECE A', 10);
```

**Get top performers:**
```sql
SELECT * FROM get_top_performers(module_id, 10);
```

---

## 💡 Best Practices

### For Teachers:
1. **Start Simple** - Begin with easy problems to build confidence
2. **Clear Instructions** - Provide detailed problem descriptions
3. **Multiple Test Cases** - Use 4-6 test cases (mix visible/hidden)
4. **Edge Cases** - Test boundary conditions (0, negative, large numbers)
5. **Starter Code** - Give students a helpful template

### For Students:
1. **Read Carefully** - Understand the problem before coding
2. **Test Locally** - Use "Run Code" before submitting
3. **Check Output Format** - Match expected output exactly
4. **Handle Edge Cases** - Consider special inputs
5. **Practice** - Try multiple approaches

---

## 🐛 Troubleshooting

### Common Issues:

**"No output returned"**
- Check if your code prints to stdout
- Ensure Scanner/input reading is correct

**"Test cases failed"**
- Output format must match exactly (including spaces/newlines)
- Check for trailing spaces or extra output

**"Execution timeout"**
- Optimize your algorithm
- Avoid infinite loops

**"Compilation error"**
- Check syntax
- Ensure class name is "Solution" for Java

---

## 🚀 Future Enhancements

- [ ] Real-time code collaboration
- [ ] Syntax highlighting improvements
- [ ] Code plagiarism detection
- [ ] Detailed test case feedback
- [ ] Performance metrics (time/memory)
- [ ] Code review by teachers
- [ ] Hints system
- [ ] Multiple submissions tracking

---

## 📝 Example Problem Template

```markdown
### Problem: Array Sum

**Description:**
Write a program that reads N integers and prints their sum.

**Input Format:**
- First line: N (number of integers)
- Second line: N space-separated integers

**Output Format:**
- Single integer (sum of all numbers)

**Constraints:**
- 1 ≤ N ≤ 100
- -1000 ≤ each integer ≤ 1000

**Sample Input:**
```
3
5 10 15
```

**Sample Output:**
```
30
```

**Test Cases:**
1. Visible: N=3, numbers=[5,10,15] → 30
2. Visible: N=1, numbers=[0] → 0
3. Hidden: N=5, numbers=[-5,5,-10,10,0] → 0
4. Hidden: N=100, numbers=[1,1,1,...] → 100
```

---

## 📞 Support

For issues or questions:
- Check the troubleshooting section
- Review sample problems
- Contact your system administrator

---

**Happy Coding! 🎉**
