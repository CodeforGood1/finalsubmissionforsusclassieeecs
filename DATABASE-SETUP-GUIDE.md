# 🗄️ Database Setup Guide for Neon PostgreSQL

## 📋 What This Script Does

The `database-setup.sql` script will:

1. ✅ **Update existing TEACHERS table** - Adds missing columns (media, allocated_sections, staff_id, dept, created_at)
2. ✅ **Update existing STUDENTS table** - Adds missing columns (media, reg_no, class_dept, section, created_at)
3. ✅ **Create MODULES table** - Brand new table for learning modules
4. ✅ **Create indexes** - For faster queries
5. ✅ **Verify setup** - Shows confirmation messages

---

## 🚀 How to Run the Script

### Step 1: Open Neon Console
1. Go to: https://console.neon.tech
2. Login to your account
3. Select your project: **sus**
4. Click on **SQL Editor** in the left sidebar

### Step 2: Copy the SQL Script
1. Open the file: `sus - Copy/backend/database-setup.sql`
2. Copy ALL the contents (Ctrl+A, Ctrl+C)

### Step 3: Execute in Neon
1. Paste the script into the SQL Editor
2. Make sure your database **neondb** is selected (top dropdown)
3. Click **Run** button (or press Ctrl+Enter)
4. Wait for execution to complete

### Step 4: Check Results
You should see messages like:
```
NOTICE: === DATABASE SETUP VERIFICATION ===
NOTICE: ✓ teachers table exists
NOTICE: ✓ students table exists
NOTICE: ✓ modules table exists
NOTICE: === SETUP COMPLETE ===
```

---

## 📊 Expected Database Structure After Running Script

### TEACHERS Table
```
Column              | Type      | Description
--------------------|-----------|----------------------------------
id                  | SERIAL    | Primary key (auto-increment)
name                | TEXT      | Teacher's full name
email               | TEXT      | Unique email (login)
password            | TEXT      | Bcrypt hashed password
staff_id            | TEXT      | Staff ID number
dept                | TEXT      | Department (e.g., "Computer Science")
media               | JSONB     | Profile photo data from Cloudinary
allocated_sections  | JSONB     | Array of sections (e.g., ["ECE A", "CSE B"])
created_at          | TIMESTAMP | Account creation date
```

### STUDENTS Table
```
Column      | Type      | Description
------------|-----------|----------------------------------
id          | SERIAL    | Primary key (auto-increment)
name        | TEXT      | Student's full name
email       | TEXT      | Unique email (login)
password    | TEXT      | Bcrypt hashed password
reg_no      | TEXT      | Registration number
class_dept  | TEXT      | Department (e.g., "ECE", "CSE")
section     | TEXT      | Section letter (e.g., "A", "B")
media       | JSONB     | Profile photo data from Cloudinary
created_at  | TIMESTAMP | Account creation date
```

### MODULES Table (NEW)
```
Column       | Type      | Description
-------------|-----------|----------------------------------
id           | SERIAL    | Primary key (auto-increment)
section      | TEXT      | Full section (e.g., "ECE A")
topic_title  | TEXT      | Module title
teacher_id   | INTEGER   | Foreign key to teachers table
teacher_name | TEXT      | Teacher's name (for display)
step_count   | INTEGER   | Number of steps in module
steps        | JSONB     | Array of learning steps
created_at   | TIMESTAMP | Module creation date
```

---

## 🔍 Verify Your Setup

After running the script, verify by running these queries:

### Check all tables exist:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Expected result:
- modules
- students
- teachers

### Check TEACHERS table structure:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'teachers' 
ORDER BY ordinal_position;
```

### Check STUDENTS table structure:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'students' 
ORDER BY ordinal_position;
```

### Check MODULES table structure:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'modules' 
ORDER BY ordinal_position;
```

### Check indexes:
```sql
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
```

---

## ⚠️ Important Notes

1. **Safe to Run Multiple Times**: The script uses `IF NOT EXISTS` checks, so it won't break if you run it again
2. **No Data Loss**: Existing data in teachers and students tables will NOT be deleted
3. **Automatic Privileges**: Neon PostgreSQL automatically grants necessary privileges to the database owner
4. **Foreign Keys**: The modules table has a foreign key to teachers table with CASCADE delete

---

## 🧪 Test Data (Optional)

If you want to add test data for quick testing, run this AFTER the main script:

```sql
-- Test Teacher (password: "test123")
INSERT INTO teachers (name, email, password, staff_id, dept, allocated_sections) 
VALUES (
  'Dr. Test Teacher', 
  'teacher@test.com', 
  '$2b$10$rQZ5YJ5YJ5YJ5YJ5YJ5YJOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', 
  'T001', 
  'Computer Science', 
  '["ECE A", "CSE B"]'::jsonb
);

-- Test Student (password: "test123")
INSERT INTO students (name, email, password, reg_no, class_dept, section) 
VALUES (
  'John Test Student', 
  'student@test.com', 
  '$2b$10$rQZ5YJ5YJ5YJ5YJ5YJ5YJOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', 
  'REG001', 
  'ECE', 
  'A'
);
```

**Note**: The password hash above is just a placeholder. You should register users through the admin panel for proper password hashing.

---

## 🆘 Troubleshooting

### Error: "relation already exists"
- **Solution**: This is normal if tables already exist. The script will skip creating them.

### Error: "column already exists"
- **Solution**: This is normal if columns already exist. The script will skip adding them.

### Error: "permission denied"
- **Solution**: Make sure you're logged in as the database owner in Neon console.

### Error: "syntax error"
- **Solution**: Make sure you copied the ENTIRE script, including all the DO blocks.

---

## ✅ After Setup is Complete

Once the script runs successfully:

1. ✅ Your database is ready
2. ✅ All API endpoints will work
3. Application testing ready
4. ✅ Admin can register teachers and students
5. ✅ Teachers can create modules
6. ✅ Students can view and complete modules

**Next Step**: Go to http://localhost:5173 and login as admin!
