# 📄 CSV Upload Guide for MCQ Tests

## 🎯 Overview

Teachers can now bulk upload MCQ questions using CSV files instead of adding them one by one. This saves time when creating tests with 15-20 questions.

---

## 📋 CSV Format

### Required Columns (in order):
1. `question` - The question text
2. `option_a` - First option
3. `option_b` - Second option
4. `option_c` - Third option
5. `option_d` - Fourth option
6. `correct_answer` - Correct answer (A, B, C, or D)

### Example CSV:
```csv
question,option_a,option_b,option_c,option_d,correct_answer
Which logic gate is known as a universal gate?,AND,OR,XOR,NAND,D
In a CE amplifier the phase difference is,0°,90°,180°,270°,C
Which modulation technique is most resistant to noise?,AM,FM,PAM,ASK,B
```

---

## 🚀 How to Use

### Step 1: Prepare Your CSV File

**Option 1: Use the Template**
- Download: `sample-mcq-template.csv`
- Edit in Excel, Google Sheets, or any text editor
- Replace sample questions with your own

**Option 2: Create from Scratch**
1. Open Excel or Google Sheets
2. Create columns: question, option_a, option_b, option_c, option_d, correct_answer
3. Add your questions (one per row)
4. Save as CSV

### Step 2: Upload in Teacher Dashboard

1. Login as Teacher
2. Go to "MCQ Tests" tab
3. Click "+ Create New Test"
4. Fill in:
   - Test Title
   - Description
   - Start Date & Time
   - Deadline
5. Click "📄 Upload CSV" button
6. Select your CSV file
7. Questions will be imported automatically
8. Review the imported questions
9. Click "Create Test"

---

## ✅ CSV Format Rules

### ✓ DO:
- Use commas to separate columns
- Put quotes around text with commas (e.g., "What is 2+2, in binary?")
- Use A, B, C, or D for correct_answer (case insensitive)
- Include header row (optional, will be skipped)
- Use UTF-8 encoding for special characters (°, ², etc.)

### ✗ DON'T:
- Don't use semicolons (;) as separators
- Don't leave empty rows between questions
- Don't use numbers (1,2,3,4) for correct_answer
- Don't include extra columns

---

## 📝 Example CSV Files

### Example 1: Basic Questions
```csv
question,option_a,option_b,option_c,option_d,correct_answer
What is 2+2?,2,3,4,5,C
What is the capital of France?,London,Paris,Berlin,Rome,B
Which is a programming language?,HTML,CSS,Python,SQL,C
```

### Example 2: With Special Characters
```csv
question,option_a,option_b,option_c,option_d,correct_answer
What is the value of π?,3.14,2.71,1.41,1.73,A
Temperature in Celsius: 0°C = ? °F,32,0,100,212,A
What is 2²?,2,4,8,16,B
```

### Example 3: With Commas in Text
```csv
question,option_a,option_b,option_c,option_d,correct_answer
"In JavaScript, which is correct?","var x = 1, y = 2","var x, y = 1, 2","var x = y = 1","var x; y;",A
"Which is a valid email?","user@domain","user@domain.com","@domain.com","user.domain",B
```

---

## 🔧 Creating CSV in Different Tools

### Microsoft Excel:
1. Enter data in columns
2. File → Save As
3. Choose "CSV (Comma delimited) (*.csv)"
4. Click Save

### Google Sheets:
1. Enter data in columns
2. File → Download → Comma Separated Values (.csv)

### Text Editor (Notepad, VS Code):
1. Type data with commas
2. Save with .csv extension
3. Ensure UTF-8 encoding

---

## 🧪 Testing Your CSV

### Before Uploading:
1. Open CSV in text editor
2. Check format matches example
3. Verify correct_answer is A/B/C/D
4. Ensure no empty lines
5. Count questions (should be 15-20)

### After Uploading:
1. Check the count: "Add Questions (X/20)"
2. Review each question in the list
3. Verify correct answers are marked
4. Remove any incorrect questions
5. Add more if needed

---

## ❌ Common Errors & Solutions

### Error: "No valid questions found in CSV"
**Cause**: Wrong format or empty file
**Solution**: Check CSV has correct columns and data

### Error: "Failed to parse CSV"
**Cause**: Invalid CSV structure
**Solution**: 
- Remove extra commas
- Put quotes around text with commas
- Check for hidden characters

### Questions Missing After Upload
**Cause**: Incorrect column order
**Solution**: Ensure columns are in exact order:
```
question,option_a,option_b,option_c,option_d,correct_answer
```

### Wrong Correct Answers
**Cause**: Using numbers (1,2,3,4) instead of letters
**Solution**: Use A, B, C, or D only

---

## 💡 Tips & Best Practices

### 1. Start Small
- Test with 5 questions first
- Verify they import correctly
- Then upload full set

### 2. Keep a Backup
- Save original CSV file
- Keep a copy before editing
- Easy to re-upload if needed

### 3. Use Template
- Start with sample-mcq-template.csv
- Modify to your needs
- Maintains correct format

### 4. Review Before Creating Test
- Check all questions imported
- Verify correct answers
- Remove duplicates
- Can still add manually

### 5. Mix Upload Methods
- Upload CSV for bulk questions
- Add manual questions for special cases
- Edit individual questions if needed

---

## 📊 Sample CSV Template

**File**: `sample-mcq-template.csv`

Contains 20 sample questions covering:
- Digital Electronics
- Programming
- Networking
- Mathematics
- Computer Architecture

**To Use**:
1. Download the file
2. Replace questions with your own
3. Keep the same format
4. Upload to create test

---

## 🎯 Complete Workflow

### Creating a Test with CSV:

1. **Prepare Questions**
   - Create CSV file
   - Add 15-20 questions
   - Verify format

2. **Login & Navigate**
   - Login as Teacher
   - Go to "MCQ Tests" tab
   - Click "+ Create New Test"

3. **Fill Test Details**
   - Test Title: "Digital Electronics - Week 1"
   - Description: "Complete within 1 week"
   - Start Date: Today
   - Deadline: 1 week from now

4. **Upload Questions**
   - Click "📄 Upload CSV"
   - Select your CSV file
   - Wait for import confirmation
   - Review imported questions

5. **Finalize**
   - Check question count (15-20)
   - Verify correct answers
   - Click "Create Test"

6. **Process Complete**
   - Test is now available to students
   - Students can see it in "Test Knowledge"
   - View submissions later

---

## ✅ Checklist Before Upload

- [ ] CSV has correct column headers
- [ ] All questions have 4 options
- [ ] Correct answers are A/B/C/D (not 1/2/3/4)
- [ ] No empty rows
- [ ] Special characters are properly encoded
- [ ] File is saved as .csv (not .xlsx)
- [ ] Tested with small sample first
- [ ] Backup copy saved

---

## 🆘 Need Help?

### If CSV upload fails:
1. Check browser console (F12) for errors
2. Verify CSV format matches template
3. Try with sample-mcq-template.csv first
4. Contact support with error message

### Alternative:
- Can always add questions manually
- Mix CSV upload with manual entry
- Edit questions after upload

---

## 📈 Benefits of CSV Upload

✅ **Fast**: Upload 20 questions in seconds  
✅ **Reusable**: Save CSV for future tests  
✅ **Shareable**: Share question banks with colleagues  
✅ **Editable**: Easy to modify in Excel/Sheets  
✅ **Backup**: Keep question database offline  
✅ **Flexible**: Mix with manual entry  

---

## 🎓 Example Use Cases

### Use Case 1: Weekly Quizzes
- Create CSV with 20 questions per week
- Upload every Monday
- Students take test by Friday
- Reuse questions next semester

### Use Case 2: Subject-wise Tests
- Maintain separate CSV per subject
- Digital_Electronics.csv
- Analog_Electronics.csv
- Communication_Systems.csv
- Upload as needed

### Use Case 3: Difficulty Levels
- Easy_Questions.csv
- Medium_Questions.csv
- Hard_Questions.csv
- Mix and match for balanced tests

---

## 🔄 Updating Questions

### To modify questions:
1. Export current questions (copy from UI)
2. Edit in CSV
3. Create new test with updated CSV
4. Or manually edit in UI

### To reuse questions:
1. Keep CSV files organized
2. Modify as needed
3. Upload to new test
4. Change dates and title

---

**Happy Testing!** 🎉
