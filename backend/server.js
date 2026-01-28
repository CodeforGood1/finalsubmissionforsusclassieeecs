const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const fs = require('fs');
const { Pool } = require('pg');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const notificationService = require('./notificationService');

// Local services for on-premise deployment
const localStorageService = require('./localStorageService');
const localEmailService = require('./localEmailService');

// Initialize local storage directories
localStorageService.ensureUploadDirs();

// Initialize local email service
localEmailService.initializeEmailService();

// Get upload middleware
const { upload } = localStorageService;

const app = express();
app.use(express.json());
app.use(cors());

// Security Middleware
app.use(compression());

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", "https://meet.jit.si", "https://*.8x8.vc"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for video embedding
}));

// Rate limiting - disabled in development for easier testing
const isDev = process.env.NODE_ENV !== 'production';

// Rate limiting - general API protection
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 100, // Higher limit in dev
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev, // Skip rate limiting in development
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 100 : 10, // Higher limit in dev
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev, // Skip rate limiting in development
});

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Apply stricter rate limiting to auth routes
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/verify-otp', authLimiter);
app.use('/api/forgot-password', authLimiter);

// Serve static files from /public in production
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Docker/Render
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- CONFIGURATION ---
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'your_new_secure_secret_key';

// --- DATABASE CONNECTION (LOCAL POSTGRESQL) ---
// On-premise: Connect to local PostgreSQL server with optimized pool settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Pool optimization for on-premise deployment
  max: 20,                         // Maximum connections in pool
  idleTimeoutMillis: 30000,        // Close idle connections after 30s
  connectionTimeoutMillis: 10000,  // Connection timeout
  // SSL only if explicitly enabled for on-premise deployment
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

// --- SIMPLE IN-MEMORY CACHE ---
// Lightweight cache for frequently accessed data (teacher allocations, student sections)
const cache = {
  data: new Map(),
  ttl: 5 * 60 * 1000, // 5 minutes default TTL
  
  set(key, value, ttlMs = this.ttl) {
    this.data.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  },
  
  get(key) {
    const item = this.data.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.data.delete(key);
      return null;
    }
    return item.value;
  },
  
  invalidate(pattern) {
    for (const key of this.data.keys()) {
      if (key.includes(pattern)) {
        this.data.delete(key);
      }
    }
  },
  
  clear() {
    this.data.clear();
  }
};

// Clean expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of cache.data.entries()) {
    if (now > item.expiry) {
      cache.data.delete(key);
    }
  }
}, 5 * 60 * 1000);

console.log('[DATABASE] Connecting to PostgreSQL...');
console.log('[DATABASE] SSL:', process.env.DB_SSL === 'true' ? 'Enabled' : 'Disabled (on-premise mode)');
console.log('[CACHE] In-memory cache initialized (5 min TTL)');

// Initialize notification service
notificationService.initializeNotificationService(pool);

// Auto-create module_completion table if it doesn't exist
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS module_completion (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        step_index INTEGER NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(module_id, student_id, step_index)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_module ON module_completion(module_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_student ON module_completion(student_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_module_completion_completed ON module_completion(is_completed)');
    console.log('module_completion table ready');
    
    // Create daily_study_time table for time tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_study_time (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        study_date DATE NOT NULL DEFAULT CURRENT_DATE,
        total_seconds INTEGER NOT NULL DEFAULT 0,
        session_start TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, study_date)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_daily_study_student_date ON daily_study_time(student_id, study_date)');
    console.log('daily_study_time table ready');
  } catch (err) {
    console.error('[WARNING] Database table setup error:', err.message);
  }
})();

// --- LOCAL STORAGE CONFIGURATION (ON-PREMISE) ---
// Serve uploaded files statically
app.use('/uploads', express.static(localStorageService.UPLOAD_BASE_DIR));

console.log('[STORAGE] Local file storage configured');
console.log('[STORAGE] Upload directory:', localStorageService.UPLOAD_BASE_DIR);

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: "Access Denied: No Token" });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid or Expired Token" });
    req.user = decoded; 
    next();
  });
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden: Admin Only" });
  next();
};

// --- ROUTES: AUTHENTICATION ---

// Email configuration - uses local SMTP for on-premise deployment
console.log('=== LOCAL EMAIL CONFIG (ON-PREMISE) ===');
console.log('[EMAIL] SMTP Host:', process.env.SMTP_HOST || 'localhost');
console.log('[EMAIL] SMTP Port:', process.env.SMTP_PORT || 1025);
console.log('[EMAIL] Dev Mode:', process.env.EMAIL_DEV_MODE || 'auto');

// Send email using local SMTP service
const sendEmailAsync = async (mailOptions) => {
  return localEmailService.sendEmail(mailOptions);
};

// Helper to extract OTP from email HTML for debugging
const extractOTPFromHTML = (html) => {
  const match = html.match(/(\d{6})/);
  return match ? match[1] : 'not found';
};

// 1. Admin Login (Env based)
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: "Invalid Admin Credentials" });
  }
});

// 2. Universal Login (Student/Teacher)
app.post('/api/login', async (req, res) => {
    const { email, password, role } = req.body;
    const activeRole = role.toLowerCase();
    const table = activeRole === 'student' ? 'students' : 'teachers';

    try {
        const result = await pool.query(`SELECT * FROM ${table} WHERE LOWER(email) = LOWER($1)`, [email]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            
            if (isMatch) {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                // Use UTC timestamp for OTP expiry to match database NOW()
                const otpExpiry = new Date(Date.now() + 5 * 60000).toISOString(); // 5 mins in UTC

                await pool.query(
                    `UPDATE ${table} SET otp_code = $1, otp_expiry = $2 WHERE id = $3`,
                    [otp, otpExpiry, user.id]
                );

                // SEND RESPONSE FIRST - don't wait for email
                res.json({ success: true, mfaRequired: true, email: user.email });

                // Then send email in background (non-blocking)
                sendEmailAsync({
                    to: email,
                    subject: 'Your Portal Access Code',
                    html: `
                        <div style="font-family: sans-serif; text-align: center; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                            <h2 style="color: #333;">Security Verification</h2>
                            <p style="color: #666;">Use the code below to complete your login:</p>
                            <h1 style="color: #10b981; font-size: 40px; letter-spacing: 5px;">${otp}</h1>
                            <p style="color: #999; font-size: 12px;">This code expires in 5 minutes.</p>
                        </div>
                    `
                });
            } else {
                res.status(401).json({ success: false, message: "Incorrect Password" });
            }
        } else {
            res.status(404).json({ success: false, message: "Account not found" });
        }
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Database error" });
    }
});
// 3. Verify OTP - Step 2: The Final Authentication
// 3. Verify OTP - Step 2: The Final Authentication
// This must be a separate block from the login block!
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp, role } = req.body;
    const table = role.toLowerCase() === 'student' ? 'students' : 'teachers';

    try {
        // Look for a user where email and otp match, and time has not run out
        const result = await pool.query(
            `SELECT * FROM ${table} WHERE LOWER(email) = LOWER($1) AND otp_code = $2 AND otp_expiry > NOW()`,
            [email, otp]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];

            // SECURITY: Clear OTP immediately so it can't be used again
            await pool.query(
                `UPDATE ${table} SET otp_code = NULL, otp_expiry = NULL WHERE id = $1`, 
                [user.id]
            );

            // Correct code! Now generate the JWT Token for the frontend
            const token = jwt.sign(
                { id: user.id, email: user.email, role: role.toLowerCase() }, 
                JWT_SECRET, 
                { expiresIn: '24h' }
            );

            delete user.password; // Don't send the password hash back to the browser
            res.json({ 
                success: true, 
                token, 
                user: { ...user, role: role.toLowerCase() } 
            });
        } else {
            // Either the code is wrong, or it expired (5 min limit)
            res.status(401).json({ success: false, message: "Invalid or Expired OTP" });
        }
    } catch (err) {
        console.error("OTP Verification Error:", err);
        res.status(500).json({ error: "Database error during verification" });
    }
});

// --- PASSWORD RESET ---

// Request password reset (sends OTP to email)
app.post('/api/password-reset/request', async (req, res) => {
  const { email, role } = req.body;
  
  if (!email || !role) {
    return res.status(400).json({ error: "Email and role required" });
  }
  
  const table = role.toLowerCase() === 'teacher' ? 'teachers' : 'students';
  
  try {
    // Check if user exists
    const result = await pool.query(
      `SELECT id, name, email FROM ${table} WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const user = result.rows[0];
    
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store OTP
    await pool.query(
      `UPDATE ${table} SET otp_code = $1, otp_expiry = $2 WHERE id = $3`,
      [otp, expiry, user.id]
    );
    
    // Send email via Mailjet
    console.log('[PASSWORD RESET] Sending OTP to:', email);
    
    if (mailjet) {
      try {
        await mailjet.post('send', { version: 'v3.1' }).request({
          Messages: [{
            From: { Email: 'susclass.global@gmail.com', Name: 'SusClass' },
            To: [{ Email: email }],
            Subject: 'Password Reset Code',
            HTMLPart: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
                <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
                  <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Password Reset Request</h2>
                  <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${user.name}</strong>,</p>
                  <p style="color: #1f2937; line-height: 1.6;">Use this code to reset your password:</p>
                  <div style="background-color: #111827; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                    <span style="color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: 8px;">${otp}</span>
                  </div>
                  <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes.</p>
                  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">If you didn't request this, please ignore this email.</p>
                </div>
              </div>
            `
          }]
        });
        console.log('[PASSWORD RESET] Email sent successfully');
      } catch (emailErr) {
        console.error('[PASSWORD RESET] Email failed:', emailErr.message);
        console.log('[PASSWORD RESET] OTP for testing:', otp);
      }
    } else {
      console.log('[PASSWORD RESET] No Mailjet - OTP:', otp);
    }
    
    res.json({ success: true, message: "Reset code sent to email" });
  } catch (err) {
    console.error("Password Reset Request Error:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// Verify OTP and reset password
app.post('/api/password-reset/confirm', async (req, res) => {
  const { email, role, otp, newPassword } = req.body;
  
  if (!email || !role || !otp || !newPassword) {
    return res.status(400).json({ error: "All fields required" });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  
  const table = role.toLowerCase() === 'teacher' ? 'teachers' : 'students';
  
  try {
    // Verify OTP
    const result = await pool.query(
      `SELECT id FROM ${table} WHERE LOWER(email) = LOWER($1) AND otp_code = $2 AND otp_expiry > NOW()`,
      [email, otp]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired code" });
    }
    
    const userId = result.rows[0].id;
    
    // Hash new password and update
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      `UPDATE ${table} SET password = $1, otp_code = NULL, otp_expiry = NULL WHERE id = $2`,
      [hashed, userId]
    );
    
    console.log('[PASSWORD RESET] Password updated for:', email);
    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Password Reset Confirm Error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Admin reset any user's password
app.post('/api/admin/reset-password', authenticateToken, adminOnly, async (req, res) => {
  const { userId, userType, newPassword } = req.body;
  
  if (!userId || !userType || !newPassword) {
    return res.status(400).json({ error: "userId, userType, and newPassword required" });
  }
  
  const table = userType.toLowerCase() === 'teacher' ? 'teachers' : 'students';
  
  try {
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const result = await pool.query(
      `UPDATE ${table} SET password = $1 WHERE id = $2 RETURNING email`,
      [hashed, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log('[ADMIN] Password reset for:', result.rows[0].email);
    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Admin Password Reset Error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// --- ROUTES: ADMIN MANAGEMENT ---

// 3. Register Teacher
app.post('/api/admin/register-teacher', authenticateToken, adminOnly, async (req, res) => {
  const { name, email, password, staff_id, dept, media } = req.body;
  try {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    // Note: We pass objects directly; pg driver handles JSON conversion for JSONB columns
    const query = `INSERT INTO teachers (name, email, password, staff_id, dept, media, allocated_sections) 
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
    const values = [name, email, hashed, staff_id, dept, media || {}, []];
    
    const result = await pool.query(query, values);
    const teacherId = result.rows[0].id;
    
    // NOTIFICATION: Welcome email
    try {
      const teacher = {
        id: teacherId,
        type: 'teacher',
        email: email,
        name: name
      };
      
      await notificationService.sendEmail(
        'ACCOUNT_CREATED',
        teacher,
        {
          name: name,
          email: email,
          role: 'teacher',
          staff_id: staff_id
        },
        { teacher_id: teacherId }
      );
      console.log(`Sent ACCOUNT_CREATED notification to teacher ${name}`);
    } catch (notifErr) {
      console.error('Welcome notification error (non-blocking):', notifErr);
    }
    
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "DB Error: " + err.message });
  }
});

// 4. Register Student
app.post('/api/admin/register-student', authenticateToken, adminOnly, async (req, res) => {
  const { name, email, password, reg_no, class_dept, section, media } = req.body;
  
  console.log("=== STUDENT REGISTRATION ATTEMPT ===");
  console.log("Name:", name);
  console.log("Email:", email);
  console.log("Reg No:", reg_no);
  console.log("Class/Dept:", class_dept);
  console.log("Section:", section);
  console.log("Media:", media);
  
  try {
    // Validate required fields
    if (!name || !email || !password) {
      console.log("[ERROR] Missing required fields");
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    
    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      console.log("[ERROR] Invalid email format:", email);
      return res.status(400).json({ error: "Invalid email format. Please use a complete email address (e.g., user@example.com)" });
    }
    
    console.log("Validation passed, hashing password...");
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    
    console.log("Password hashed, inserting into database...");
    const query = `INSERT INTO students (name, email, password, reg_no, class_dept, section, media) 
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
    const values = [name, email, hashed, reg_no, class_dept, section, media || {}];
    
    const result = await pool.query(query, values);
    const studentId = result.rows[0].id;
    console.log("Student registered successfully");
    
    // NOTIFICATION: Welcome email
    try {
      const student = {
        id: studentId,
        type: 'student',
        email: email,
        name: name
      };
      
      await notificationService.sendEmail(
        'ACCOUNT_CREATED',
        student,
        {
          name: name,
          email: email,
          role: 'student',
          reg_no: reg_no,
          section: section
        },
        { student_id: studentId }
      );
      console.log(`Sent ACCOUNT_CREATED notification to student ${name}`);
    } catch (notifErr) {
      console.error('Welcome notification error (non-blocking):', notifErr);
    }
    
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("[ERROR] Registration Error:", err.message);
    console.error("Error Code:", err.code);
    console.error("Error Detail:", err.detail);
    
    // Check for duplicate email
    if (err.code === '23505') {
      return res.status(400).json({ error: "Email already exists. Please use a different email address." });
    }
    // Check for email format constraint
    if (err.message.includes('chk_email_format')) {
      return res.status(400).json({ error: "Invalid email format. Please enter a complete email address." });
    }
    res.status(500).json({ error: "Database Error: " + err.message });
  }
});

// 5. Teacher List (For Allocation)
app.get('/api/teachers', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, staff_id, dept, allocated_sections FROM teachers ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update Allocation (Old - keeping for backward compatibility)
app.put('/api/teachers/:id/allocate', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { sections } = req.body; // Expects an array: ["CSE A", "ECE B"]
  try {
    await pool.query('UPDATE teachers SET allocated_sections = $1 WHERE id = $2', [JSON.stringify(sections), id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7a. Admin: Update Teacher
app.put('/api/admin/teacher/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { name, email, staff_id, dept } = req.body;
  try {
    await pool.query(
      'UPDATE teachers SET name = $1, email = $2, staff_id = $3, dept = $4 WHERE id = $5',
      [name, email, staff_id, dept, id]
    );
    res.json({ success: true, message: "Teacher updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7b. Admin: Delete Teacher
app.delete('/api/admin/teacher/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM teachers WHERE id = $1', [id]);
    res.json({ success: true, message: "Teacher deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7c. Admin: Update Student
app.put('/api/admin/student/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { name, email, reg_no, class_dept, section } = req.body;
  try {
    await pool.query(
      'UPDATE students SET name = $1, email = $2, reg_no = $3, class_dept = $4, section = $5 WHERE id = $6',
      [name, email, reg_no, class_dept, section, id]
    );
    res.json({ success: true, message: "Student updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7d. Admin: Delete Student
app.delete('/api/admin/student/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM students WHERE id = $1', [id]);
    res.json({ success: true, message: "Student deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7e. Admin: Get All Students
app.get('/api/admin/students', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, reg_no, class_dept, section, created_at FROM students ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7f. Admin: Get All Teachers
app.get('/api/admin/teachers', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, staff_id, dept, allocated_sections, created_at FROM teachers ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7g. Admin: Allocate Teacher to Students (Many-to-Many)
app.post('/api/admin/allocate', authenticateToken, adminOnly, async (req, res) => {
  const { teacher_id, student_ids, subject } = req.body;
  try {
    // Delete existing allocations for this teacher and subject
    await pool.query(
      'DELETE FROM teacher_student_allocations WHERE teacher_id = $1 AND subject = $2',
      [teacher_id, subject]
    );
    
    // Insert new allocations
    for (const student_id of student_ids) {
      await pool.query(
        'INSERT INTO teacher_student_allocations (teacher_id, student_id, subject) VALUES ($1, $2, $3) ON CONFLICT (teacher_id, student_id, subject) DO NOTHING',
        [teacher_id, student_id, subject]
      );
    }
    
    res.json({ success: true, message: "Allocation updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7g2. Admin: Get Available Sections (unique class/section combinations)
app.get('/api/admin/sections', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY class_dept, section) as id,
        class_dept, 
        section, 
        COUNT(*) as student_count
      FROM students 
      WHERE class_dept IS NOT NULL AND section IS NOT NULL
      GROUP BY class_dept, section 
      ORDER BY class_dept, section
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7g3. Admin: Allocate Teacher to Sections (Class-based allocation)
app.post('/api/admin/allocate-sections', authenticateToken, adminOnly, async (req, res) => {
  const { teacher_id, sections, subject } = req.body;
  
  console.log("Allocation request:", { teacher_id, sections, subject });
  
  if (!teacher_id || !sections || sections.length === 0 || !subject) {
    return res.status(400).json({ error: "Teacher ID, sections, and subject are required" });
  }
  
  try {
    // Get all available sections to map IDs
    const allSectionsResult = await pool.query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY class_dept, section) as id,
        class_dept, 
        section
      FROM students 
      WHERE class_dept IS NOT NULL AND section IS NOT NULL
      GROUP BY class_dept, section 
      ORDER BY class_dept, section
    `);
    
    const allSections = allSectionsResult.rows;
    console.log("All available sections:", allSections);
    
    // Map selected section IDs to section strings (class_dept section) - USE SPACE not hyphen
    const selectedSectionStrings = sections.map(sectionId => {
      // Section IDs come as strings from frontend, compare as strings
      const section = allSections.find(s => String(s.id) === String(sectionId));
      if (section) {
        return `${section.class_dept} ${section.section}`; // Use SPACE for consistency
      }
      return null;
    }).filter(Boolean);
    
    console.log("Selected section strings:", selectedSectionStrings);
    
    if (selectedSectionStrings.length === 0) {
      return res.status(400).json({ error: "No valid sections found" });
    }
    
    // Get current allocated sections for this teacher
    const teacherResult = await pool.query(
      'SELECT allocated_sections FROM teachers WHERE id = $1',
      [teacher_id]
    );
    
    // Handle null or non-array allocated_sections
    let currentSections = teacherResult.rows[0]?.allocated_sections;
    
    // Parse if it's a JSON string, ensure it's an array
    if (typeof currentSections === 'string') {
      try {
        currentSections = JSON.parse(currentSections);
      } catch (e) {
        currentSections = [];
      }
    }
    
    if (!Array.isArray(currentSections)) {
      currentSections = [];
    }
    
    // Add new sections (avoiding duplicates) - convert Set back to Array
    const updatedSections = Array.from(new Set([...currentSections, ...selectedSectionStrings]));
    
    console.log("Updating teacher sections to:", updatedSections);
    
    // Update teacher's allocated_sections - ensure it's stored as proper JSON
    await pool.query(
      'UPDATE teachers SET allocated_sections = $1 WHERE id = $2',
      [JSON.stringify(updatedSections), teacher_id]
    );
    
    // Also create teacher_student_allocations for all students in these sections
    for (const sectionStr of selectedSectionStrings) {
      const [class_dept, section] = sectionStr.split(' '); // Split by SPACE
      
      // Get all students in this section
      const studentsResult = await pool.query(
        'SELECT id FROM students WHERE class_dept = $1 AND section = $2',
        [class_dept, section]
      );
      
      console.log(`Found ${studentsResult.rows.length} students in ${sectionStr}`);
      
      // Create allocations for each student
      for (const student of studentsResult.rows) {
        await pool.query(
          'INSERT INTO teacher_student_allocations (teacher_id, student_id, subject) VALUES ($1, $2, $3) ON CONFLICT (teacher_id, student_id, subject) DO NOTHING',
          [teacher_id, student.id, subject]
        );
      }
    }
    
    res.json({ 
      success: true, 
      message: `Teacher assigned to ${selectedSectionStrings.length} section(s): ${selectedSectionStrings.join(', ')}` 
    });
  } catch (err) {
    console.error("Section allocation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7h. Admin: Get Teacher's Students
app.get('/api/admin/teacher/:id/students', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM v_teacher_students WHERE teacher_id = $1 ORDER BY student_name',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7i. Admin: Get Student's Teachers
app.get('/api/admin/student/:id/teachers', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM v_student_teachers WHERE student_id = $1 ORDER BY teacher_name',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 8. Fetch Teacher Profile (for Dashboard)
app.get('/api/teacher/me', authenticateToken, async (req, res) => {
  try {
    // req.user.id comes from the decoded JWT token
    const result = await pool.query(
      'SELECT id, name, email, staff_id, dept, media, allocated_sections FROM teachers WHERE id = $1', 
      [req.user.id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Teacher not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8b. Teacher: Get My Allocated Students (with caching)
app.get('/api/teacher/my-students', authenticateToken, async (req, res) => {
  try {
    const teacher_id = req.user.id;
    const cacheKey = `teacher_students_${teacher_id}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const result = await pool.query(
      'SELECT * FROM v_teacher_students WHERE teacher_id = $1 ORDER BY student_name',
      [teacher_id]
    );
    
    // Cache for 2 minutes (allocations don't change often)
    cache.set(cacheKey, result.rows, 2 * 60 * 1000);
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Fetch Students for a specific section
app.get('/api/teacher/students/:section', authenticateToken, async (req, res) => {
  const fullSectionString = req.params.section; // e.g., "ECE A" or "ece a"

  try {
    // 1. Split "ECE A" into ["ECE", "A"]
    const parts = fullSectionString.trim().split(/\s+/); 
    const deptPart = parts[0];    // "ECE"
    const sectionPart = parts[1]; // "A"

    // 2. Query using LOWER() on both the column and the parameter
    const result = await pool.query(
      `SELECT id, name, reg_no, class_dept, section, media 
       FROM students 
       WHERE LOWER(class_dept) = LOWER($1) 
       AND LOWER(section) = LOWER($2) 
       ORDER BY name ASC`,
      [deptPart, sectionPart]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Students Error:", err.message);
    res.status(500).json({ error: "Failed to load roster" });
  }
});

// --- ROUTES: MEDIA (LOCAL STORAGE) ---

// 7. Media Upload (Images and Videos) - LOCAL STORAGE
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    console.log("[LOCAL UPLOAD] Request received");
    
    if (!req.file) {
      console.error("[LOCAL UPLOAD] No file in request");
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    // Determine file type for URL path
    const fileType = req.file.mimetype.startsWith('video/') ? 'videos' : 
                     req.file.mimetype.startsWith('image/') ? 'images' : 'documents';
    
    // Build local URL
    const fileUrl = `/uploads/${fileType}/${req.file.filename}`;
    
    console.log("[LOCAL UPLOAD] File saved:", req.file.filename);
    console.log("[LOCAL UPLOAD] URL:", fileUrl);
    
    res.json({ 
      url: fileUrl, 
      public_id: req.file.filename,
      filename: req.file.filename,
      type: req.file.mimetype,
      size: req.file.size,
      resource_type: req.file.mimetype.startsWith('video/') ? 'video' : 'image'
    });
  } catch (err) {
    console.error("[LOCAL UPLOAD] Error:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// Video streaming endpoint with range support for large files
app.get('/api/videos/stream/:filename', (req, res) => {
  const { filename } = req.params;
  localStorageService.streamVideo(req, res, filename);
});

// Get disk usage statistics (admin only)
app.get('/api/storage/stats', authenticateToken, adminOnly, async (req, res) => {
  try {
    const stats = await localStorageService.getDiskUsage();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List uploaded files (admin only)
app.get('/api/storage/files/:type', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { type } = req.params;
    const files = await localStorageService.listFiles(type);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file (admin only)
app.delete('/api/storage/files/:type/:filename', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { type, filename } = req.params;
    await localStorageService.deleteFile(filename, type);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FETCH INDIVIDUAL STUDENT PROFILE
// FETCH STUDENT PROFILE WITH PHOTO
app.get('/api/student/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, reg_no, class_dept, section, media FROM students WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Student not found" });

    const student = result.rows[0];
    
    // Get module progress
    const progressResult = await pool.query(
      'SELECT * FROM v_student_module_progress WHERE student_id = $1',
      [req.user.id]
    );
    
    const moduleProgress = progressResult.rows[0] || {
      total_modules: 0,
      completed_modules: 0,
      completion_percentage: 0
    };
    
    // Extract the image URL if it exists, otherwise provide a null
    const profilePic = student.media && student.media.url ? student.media.url : null;

    res.json({
      ...student,
      profilePic,
      progress: {
        modulesFinished: moduleProgress.completed_modules,
        totalModules: moduleProgress.total_modules,
        wellbeingScore: Math.round(moduleProgress.completion_percentage)
      }
    });
  } catch (err) {
    console.error("Student Profile Error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET STUDENT RECENT MODULES
app.get('/api/student/recent-modules', authenticateToken, async (req, res) => {
  try {
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [req.user.id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const fullSection = `${class_dept} ${section}`;
    
    // Get modules for student's section with accurate progress
    const modulesResult = await pool.query(`
      SELECT m.id, m.topic_title, m.section, m.created_at, m.step_count,
        COALESCE(
          (SELECT COUNT(*) * 100.0 / NULLIF(m.step_count, 0) 
           FROM module_completion mc 
           WHERE mc.module_id = m.id AND mc.student_id = $1 AND mc.is_completed = true), 
          0
        ) as progress
      FROM modules m 
      WHERE LOWER(m.section) = LOWER($2)
      ORDER BY m.created_at DESC 
      LIMIT 5
    `, [req.user.id, fullSection]);
    
    res.json(modulesResult.rows);
  } catch (err) {
    console.error("Recent modules error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET STUDENT STATS
app.get('/api/student/stats', authenticateToken, async (req, res) => {
  try {
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [req.user.id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const fullSection = `${class_dept} ${section}`;
    
    // Get total modules for section
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM modules WHERE LOWER(section) = LOWER($1)',
      [fullSection]
    );
    
    // Get completed modules (all steps completed)
    const completedResult = await pool.query(`
      SELECT COUNT(DISTINCT m.id) as completed
      FROM modules m
      WHERE LOWER(m.section) = LOWER($1)
      AND m.step_count > 0
      AND NOT EXISTS (
        SELECT 1 FROM generate_series(0, m.step_count - 1) s(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM module_completion mc 
          WHERE mc.module_id = m.id AND mc.student_id = $2 AND mc.step_index = s.n AND mc.is_completed = true
        )
      )
    `, [fullSection, req.user.id]);
    
    // Calculate streak (consecutive days with activity from today backwards)
    const streakResult = await pool.query(`
      WITH activity_dates AS (
        SELECT DISTINCT DATE(completed_at) as activity_date
        FROM module_completion
        WHERE student_id = $1 AND is_completed = true
        UNION
        SELECT DISTINCT study_date as activity_date
        FROM daily_study_time
        WHERE student_id = $1 AND total_seconds > 0
      ),
      streak_calc AS (
        SELECT activity_date,
               activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date DESC))::int as streak_group
        FROM activity_dates
        WHERE activity_date <= CURRENT_DATE
      )
      SELECT COUNT(*) as streak
      FROM streak_calc
      WHERE streak_group = (
        SELECT streak_group FROM streak_calc WHERE activity_date = CURRENT_DATE
        UNION ALL
        SELECT streak_group FROM streak_calc WHERE activity_date = CURRENT_DATE - 1
        LIMIT 1
      )
    `, [req.user.id]);
    
    res.json({
      modulesCompleted: parseInt(completedResult.rows[0]?.completed || 0),
      totalModules: parseInt(totalResult.rows[0]?.total || 0),
      streak: parseInt(streakResult.rows[0]?.streak || 0)
    });
  } catch (err) {
    console.error("Student stats error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// --- ROUTES: MODULE MANAGEMENT ---

// 10. Teacher: Upload/Publish New Module
app.post('/api/teacher/upload-module', authenticateToken, async (req, res) => {
  try {
    const { section, subject, topic, steps } = req.body;
    const teacherId = req.user.id;

    if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }

    // Get teacher name for display
    const teacherResult = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacherId]);
    const teacherName = teacherResult.rows[0]?.name || 'Unknown';

    // Insert module with steps as JSONB
    const query = `
      INSERT INTO modules (section, subject, topic_title, teacher_id, teacher_name, step_count, steps) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING id
    `;
    const values = [section, subject, topic, teacherId, teacherName, steps.length, JSON.stringify(steps)];
    
    const result = await pool.query(query, values);
    const moduleId = result.rows[0].id;
    
    // NOTIFICATION: Send to all students in section
    try {
      const students = await notificationService.getStudentsInSection(section, 'MODULE_PUBLISHED');
      
      if (students.length > 0) {
        // Send email notifications
        await notificationService.sendBatchEmails(
          'MODULE_PUBLISHED',
          students,
          (student) => ({
            student_name: student.name,
            section: section,
            topic_title: topic,
            subject: subject,
            teacher_name: teacherName,
            step_count: steps.length
          }),
          { module_id: moduleId, teacher_id: teacherId }
        );
        
        // Create in-app notifications for each student
        for (const student of students) {
          await pool.query(`
            INSERT INTO in_app_notifications 
            (recipient_type, recipient_id, type, title, message, metadata, created_at)
            VALUES ('student', $1, 'module_published', $2, $3, $4, CURRENT_TIMESTAMP)
          `, [
            student.id,
            'New Module Available',
            `${teacherName} published "${topic}" for ${section}. Start learning now!`,
            JSON.stringify({
              module_id: moduleId,
              module_title: topic,
              teacher_name: teacherName,
              section: section,
              subject: subject,
              step_count: steps.length
            })
          ]);
        }
        
        console.log(`Sent MODULE_PUBLISHED notifications to ${students.length} students`);
      }
    } catch (notifErr) {
      console.error('Notification error (non-blocking):', notifErr);
    }
    
    // Invalidate cache for this section's modules
    cache.invalidate(`modules_section_${section.toLowerCase()}`);
    
    res.status(201).json({ success: true, moduleId });
  } catch (err) {
    console.error("Module Upload Error:", err);
    res.status(500).json({ error: "Failed to publish module: " + err.message });
  }
});

// 11. Teacher: Fetch Modules for a Section
app.get('/api/teacher/modules/:section', authenticateToken, async (req, res) => {
  try {
    const section = req.params.section;
    
    const result = await pool.query(
      `SELECT id, topic_title, teacher_name, step_count, created_at 
       FROM modules 
       WHERE LOWER(section) = LOWER($1) 
       ORDER BY created_at DESC`,
      [section]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Modules Error:", err);
    res.status(500).json({ error: "Failed to load modules" });
  }
});

// 11b. Teacher: Get Single Module (for editing)
app.get('/api/teacher/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const teacherId = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Fetch Module Error:", err);
    res.status(500).json({ error: "Failed to load module" });
  }
});

// 11c. Teacher: Update/Edit Module
app.put('/api/teacher/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const { topic, subject, steps } = req.body;
    const teacherId = req.user.id;
    
    // Verify teacher owns this module
    const checkOwner = await pool.query(
      'SELECT id FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to edit this module" });
    }
    
    // Update module
    const query = `
      UPDATE modules 
      SET topic_title = $1, subject = $2, steps = $3, step_count = $4
      WHERE id = $5
      RETURNING id
    `;
    
    await pool.query(query, [topic, subject, JSON.stringify(steps), steps.length, moduleId]);
    res.json({ success: true, message: "Module updated successfully" });
  } catch (err) {
    console.error("Module Update Error:", err);
    res.status(500).json({ error: "Failed to update module: " + err.message });
  }
});

// 11c. Teacher: Delete Module
app.delete('/api/teacher/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const teacherId = req.user.id;
    
    // Verify teacher owns this module
    const checkOwner = await pool.query(
      'SELECT id FROM modules WHERE id = $1 AND teacher_id = $2',
      [moduleId, teacherId]
    );
    
    if (checkOwner.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized to delete this module" });
    }
    
    // Delete module
    await pool.query('DELETE FROM modules WHERE id = $1', [moduleId]);
    res.json({ success: true, message: "Module deleted successfully" });
  } catch (err) {
    console.error("Module Delete Error:", err);
    res.status(500).json({ error: "Failed to delete module: " + err.message });
  }
});

// 12. Student: Fetch My Modules (Based on Student's Section)
app.get('/api/student/my-modules', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    
    // Get student's section
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const fullSection = `${class_dept} ${section}`; // e.g., "ECE A"
    const cacheKey = `modules_section_${fullSection.toLowerCase()}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // Fetch modules for this section
    const modulesResult = await pool.query(
      `SELECT id, topic_title, teacher_name, step_count, created_at 
       FROM modules 
       WHERE LOWER(section) = LOWER($1) 
       ORDER BY created_at DESC`,
      [fullSection]
    );
    
    // Cache for 1 minute
    cache.set(cacheKey, modulesResult.rows, 60 * 1000);
    
    res.json(modulesResult.rows);
  } catch (err) {
    console.error("Student Modules Error:", err);
    res.status(500).json({ error: "Failed to load your modules" });
  }
});

// 13. Student: Fetch Specific Module Content (All Steps)
app.get('/api/student/module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const studentId = req.user.id;
    
    const result = await pool.query(
      'SELECT steps FROM modules WHERE id = $1',
      [moduleId]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Module not found" });
    
    // Get completion status for all steps
    const completionResult = await pool.query(
      'SELECT step_index FROM module_completion WHERE module_id = $1 AND student_id = $2 AND is_completed = TRUE',
      [moduleId, studentId]
    );
    
    const completedSteps = completionResult.rows.map(row => row.step_index);
    
    // Log module access for teacher analytics
    await pool.query('SELECT track_module_access($1, $2)', [studentId, moduleId]);
    
    const steps = result.rows[0].steps;
    
    // Format steps for the frontend
    // Handle both old format (title/content) and new format (header/data)
    const formattedSteps = steps.map((step, index) => ({
      id: index + 1,
      step_type: step.type, // 'video', 'text', 'mcq', 'coding', 'jitsi', 'code', 'quiz'
      step_header: step.header || step.title, // Support both formats
      content: step.type === 'video' ? (step.data || step.content) : 
               step.type === 'text' ? (step.data || step.content) : 
               step.type === 'code' ? (step.data || step.content) :
               null, // For video URLs and text content
      mcq_data: step.type === 'mcq' ? (step.data || step.content) :
                step.type === 'quiz' ? (step.data || step.content) :
                step.type === 'coding' ? (step.data || step.content) :
                step.type === 'jitsi' ? (step.data || step.content) :
                null, // For structured data (MCQ, coding problems, jitsi)
      is_completed: completedSteps.includes(index)
    }));
    
    console.log("Formatted steps for student:", formattedSteps);
    
    res.json(formattedSteps);
  } catch (err) {
    res.status(500).json({ error: "Failed to load module content" });
  }
});

// 13b. Student: Mark Step/Module as Complete
app.post('/api/student/module/:moduleId/complete', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    const studentId = req.user.id;
    const { stepIndex } = req.body;
    
    if (stepIndex !== undefined) {
      // Mark specific step as complete
      await pool.query(`
        INSERT INTO module_completion (module_id, student_id, step_index, is_completed)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (module_id, student_id, step_index)
        DO UPDATE SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP
      `, [moduleId, studentId, stepIndex]);
      
      // Check if all steps are now complete
      const moduleQuery = await pool.query('SELECT step_count FROM modules WHERE id = $1', [moduleId]);
      const totalSteps = moduleQuery.rows[0]?.step_count || 0;
      
      const completedQuery = await pool.query(
        'SELECT COUNT(*) as completed FROM module_completion WHERE module_id = $1 AND student_id = $2 AND is_completed = TRUE',
        [moduleId, studentId]
      );
      const completedSteps = parseInt(completedQuery.rows[0]?.completed || 0);
      
      if (completedSteps >= totalSteps) {
        // All steps complete - mark entire module as complete
        await pool.query('SELECT mark_module_complete($1, $2)', [studentId, moduleId]);
        
        // Send notification to teacher about student completion
        try {
          // Get module and student info
          const moduleInfo = await pool.query(
            'SELECT m.topic_title, m.section, m.teacher_id, m.step_count FROM modules m WHERE m.id = $1',
            [moduleId]
          );
          
          const studentInfo = await pool.query(
            'SELECT name, reg_no FROM students WHERE id = $1',
            [studentId]
          );
          
          if (moduleInfo.rows.length > 0 && studentInfo.rows.length > 0) {
            const module = moduleInfo.rows[0];
            const student = studentInfo.rows[0];
            
            // Get teacher info
            const teacher = await notificationService.getTeacherById(module.teacher_id);
            
            if (teacher) {
              // Send email notification to teacher
              await notificationService.sendEmail(
                teacher.email,
                'MODULE_COMPLETED_BY_STUDENT',
                {
                  teacher_name: teacher.name,
                  student_name: student.name,
                  student_reg_no: student.reg_no,
                  module_title: module.topic_title,
                  section: module.section,
                  total_steps: module.step_count,
                  completion_time: new Date().toLocaleString()
                }
              );
              
              // Create in-app notification for teacher
              await pool.query(`
                INSERT INTO in_app_notifications 
                (recipient_type, recipient_id, type, title, message, metadata, created_at)
                VALUES ('teacher', $1, 'module_completion', $2, $3, $4, CURRENT_TIMESTAMP)
              `, [
                module.teacher_id,
                'Student Completed Module',
                `${student.name} has completed the module "${module.topic_title}" with all ${module.step_count} steps.`,
                JSON.stringify({
                  student_id: studentId,
                  student_name: student.name,
                  module_id: moduleId,
                  module_title: module.topic_title,
                  section: module.section
                })
              ]);
              
              console.log(`[OK] Sent module completion notification to teacher ${teacher.name}`);
            }
          }
          
          // Also create achievement notification for the student
          await pool.query(`
            INSERT INTO in_app_notifications 
            (recipient_type, recipient_id, type, title, message, metadata, created_at)
            VALUES ('student', $1, 'module_achievement', $2, $3, $4, CURRENT_TIMESTAMP)
          `, [
            studentId,
            'Module Completed!',
            `Congratulations! You completed "${module.topic_title}" with all ${module.step_count} steps.`,
            JSON.stringify({
              module_id: moduleId,
              module_title: module.topic_title,
              section: module.section,
              completion_time: new Date().toISOString(),
              steps_completed: module.step_count
            })
          ]);
        } catch (notifErr) {
          console.error('Failed to send teacher notification:', notifErr);
          // Don't fail the completion if notification fails
        }
        
        res.json({ success: true, message: "Module completed!", allComplete: true });
      } else {
        res.json({ success: true, message: "Step marked as complete", progress: completedSteps / totalSteps });
      }
    } else {
      // Mark entire module as complete
      await pool.query('SELECT mark_module_complete($1, $2)', [studentId, moduleId]);
      
      // Send notification to teacher about student completion
      try {
        // Get module and student info
        const moduleInfo = await pool.query(
          'SELECT m.topic_title, m.section, m.teacher_id, m.step_count FROM modules m WHERE m.id = $1',
          [moduleId]
        );
        
        const studentInfo = await pool.query(
          'SELECT name, reg_no FROM students WHERE id = $1',
          [studentId]
        );
        
        if (moduleInfo.rows.length > 0 && studentInfo.rows.length > 0) {
          const module = moduleInfo.rows[0];
          const student = studentInfo.rows[0];
          
          // Get teacher info
          const teacher = await notificationService.getTeacherById(module.teacher_id);
          
          if (teacher) {
            // Send email notification to teacher
            await notificationService.sendEmail(
              teacher.email,
              'MODULE_COMPLETED_BY_STUDENT',
              {
                teacher_name: teacher.name,
                student_name: student.name,
                student_reg_no: student.reg_no,
                module_title: module.topic_title,
                section: module.section,
                total_steps: module.step_count,
                completion_time: new Date().toLocaleString()
              }
            );
            
            // Create in-app notification for teacher
            await pool.query(`
              INSERT INTO in_app_notifications 
              (recipient_type, recipient_id, type, title, message, metadata, created_at)
              VALUES ('teacher', $1, 'module_completion', $2, $3, $4, CURRENT_TIMESTAMP)
            `, [
              module.teacher_id,
              'Student Completed Module',
              `${student.name} has completed the module "${module.topic_title}" with all ${module.step_count} steps.`,
              JSON.stringify({
                student_id: studentId,
                student_name: student.name,
                module_id: moduleId,
                module_title: module.topic_title,
                section: module.section
              })
            ]);
            
            console.log(`[OK] Sent module completion notification to teacher ${teacher.name}`);
          }
        }
        
        // Also create achievement notification for the student
        await pool.query(`
          INSERT INTO in_app_notifications 
          (recipient_type, recipient_id, type, title, message, metadata, created_at)
          VALUES ('student', $1, 'module_achievement', $2, $3, $4, CURRENT_TIMESTAMP)
        `, [
          studentId,
          'Module Completed!',
          `Congratulations! You completed "${module.topic_title}" with all ${module.step_count} steps.`,
          JSON.stringify({
            module_id: moduleId,
            module_title: module.topic_title,
            section: module.section,
            completion_time: new Date().toISOString(),
            steps_completed: module.step_count
          })
        ]);
      } catch (notifErr) {
        console.error('Failed to send teacher notification:', notifErr);
        // Don't fail the completion if notification fails
      }
      
      res.json({ success: true, message: "Module marked as complete" });
    }
  } catch (err) {
    console.error("Mark Complete Error:", err);
    res.status(500).json({ error: "Failed to mark module complete" });
  }
});

// 13c. Student: Time Tracking Endpoints
app.post('/api/student/start-session', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO daily_study_time (student_id, study_date, session_start, last_activity)
      VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (student_id, study_date)
      DO UPDATE SET session_start = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP
    `, [studentId, today]);
    
    res.json({ success: true, message: 'Session started' });
  } catch (err) {
    console.error('Start session error:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

app.post('/api/student/update-time', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { seconds } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(`
      INSERT INTO daily_study_time (student_id, study_date, total_seconds, last_activity)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (student_id, study_date)
      DO UPDATE SET 
        total_seconds = daily_study_time.total_seconds + $3,
        last_activity = CURRENT_TIMESTAMP
    `, [studentId, today, seconds]);
    
    res.json({ success: true, message: 'Time updated' });
  } catch (err) {
    console.error('Update time error:', err);
    res.status(500).json({ error: 'Failed to update time' });
  }
});

app.get('/api/student/daily-time', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      'SELECT total_seconds, session_start FROM daily_study_time WHERE student_id = $1 AND study_date = $2',
      [studentId, today]
    );
    
    const data = result.rows[0] || { total_seconds: 0, session_start: null };
    res.json(data);
  } catch (err) {
    console.error('Get daily time error:', err);
    res.status(500).json({ error: 'Failed to get daily time' });
  }
});

// 13d. Student: Get My Module Progress
app.get('/api/student/module-progress', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM v_student_module_progress WHERE student_id = $1',
      [studentId]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        total_modules: 0,
        completed_modules: 0,
        pending_modules: 0,
        completion_percentage: 0
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Module Progress Error:", err);
    res.status(500).json({ error: "Failed to load module progress" });
  }
});

// 13d. Teacher: Get Module Statistics
app.get('/api/teacher/module/:moduleId/statistics', authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    
    const result = await pool.query(
      'SELECT * FROM v_module_statistics WHERE module_id = $1',
      [moduleId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Module Statistics Error:", err);
    res.status(500).json({ error: "Failed to load module statistics" });
  }
});

app.post('/api/student/submit-code', authenticateToken, async (req, res) => {
    try {
        const { moduleId, code, language, testCases } = req.body;
        const studentId = req.user.id;
        const studentEmail = req.user.email;

        if (!testCases || testCases.length === 0) {
            return res.status(400).json({ error: "No test cases provided." });
        }

        let passedCount = 0;

        // --- EVALUATION LOOP ---
        for (const tc of testCases) {
            const response = await fetch("https://emkc.org/api/v2/piston/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    language: language,
                    version: "*",
                    files: [{ content: code }],
                    stdin: tc.input,
                }),
            });

            const result = await response.json();
            const actualOutput = (result.run.stdout || "").trim();
            
            // Compare output with expected result
            if (actualOutput === tc.expected.trim()) {
                passedCount++;
            }
        }

        // --- CALCULATION ---
        const totalCases = testCases.length;
        const finalScore = ((passedCount / totalCases) * 100).toFixed(2);

        // --- DATABASE STORAGE ---
        const query = `
            INSERT INTO student_submissions 
            (student_id, student_email, module_id, submitted_code, language, test_cases_passed, total_test_cases, score) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING score, test_cases_passed, total_test_cases;
        `;
        
        const values = [studentId, studentEmail, moduleId, code, language, passedCount, totalCases, finalScore];
        const dbResult = await pool.query(query, values);

        // --- RESPONSE FOR POPUP ---
        res.json({ 
            success: true, 
            score: dbResult.rows[0].score, 
            passed: dbResult.rows[0].test_cases_passed, 
            total: dbResult.rows[0].total_test_cases 
        });

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        res.status(500).json({ error: "Internal Server Error: " + err.message });
    }
});

// 13e. Teacher: Get Student's Module Progress
app.get('/api/teacher/student/:studentId/module-progress', authenticateToken, async (req, res) => {
  try {
    const studentId = req.params.studentId;
    
    const result = await pool.query(
      'SELECT * FROM v_student_module_progress WHERE student_id = $1',
      [studentId]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        total_modules: 0,
        completed_modules: 0,
        pending_modules: 0,
        completion_percentage: 0
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Student Module Progress Error:", err);
    res.status(500).json({ error: "Failed to load student module progress" });
  }
});

// --- ROUTES: MCQ TEST SYSTEM ---

// 14. Teacher: Create MCQ Test
app.post('/api/teacher/test/create', authenticateToken, async (req, res) => {
  try {
    const { section, title, description, questions, start_date, deadline } = req.body;
    const teacher_id = req.user.id;
    
    // Get teacher name
    const teacherResult = await pool.query('SELECT name FROM teachers WHERE id = $1', [teacher_id]);
    const teacher_name = teacherResult.rows[0]?.name || 'Unknown';
    
    const query = `
      INSERT INTO mcq_tests (teacher_id, teacher_name, section, title, description, questions, total_questions, start_date, deadline)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      teacher_id, teacher_name, section, title, description,
      JSON.stringify(questions), questions.length, start_date, deadline
    ]);
    
    const test = result.rows[0];
    
    // NOTIFICATION: Send to all students in section
    try {
      const students = await notificationService.getStudentsInSection(section, 'TEST_ASSIGNED');
      
      if (students.length > 0) {
        // Send email notifications
        await notificationService.sendBatchEmails(
          'TEST_ASSIGNED',
          students,
          (student) => ({
            student_name: student.name,
            section: section,
            test_title: title,
            description: description,
            total_questions: questions.length,
            start_date: start_date,
            deadline: deadline
          }),
          { test_id: test.id, teacher_id: teacher_id }
        );
        
        // Create in-app notifications for each student
        for (const student of students) {
          await pool.query(`
            INSERT INTO in_app_notifications 
            (recipient_type, recipient_id, type, title, message, metadata, created_at)
            VALUES ('student', $1, 'test_assigned', $2, $3, $4, CURRENT_TIMESTAMP)
          `, [
            student.id,
            'New Test Assigned',
            `Test "${title}" assigned by ${teacher_name}. Due: ${new Date(deadline).toLocaleDateString()}`,
            JSON.stringify({
              test_id: test.id,
              test_title: title,
              teacher_name: teacher_name,
              section: section,
              start_date: start_date,
              deadline: deadline,
              total_questions: questions.length
            })
          ]);
        }
        
        console.log(`[OK] Sent TEST_ASSIGNED notifications to ${students.length} students`);
      }
    } catch (notifErr) {
      console.error('Notification error (non-blocking):', notifErr);
    }
    
    res.status(201).json({ success: true, test });
  } catch (err) {
    console.error("Test Creation Error:", err);
    res.status(500).json({ error: "Failed to create test: " + err.message });
  }
});

// 15. Teacher: Get All Tests for Section
app.get('/api/teacher/tests/:section', authenticateToken, async (req, res) => {
  try {
    const section = req.params.section;
    
    const result = await pool.query(
      `SELECT * FROM v_test_statistics 
       WHERE LOWER(section) = LOWER($1) 
       ORDER BY deadline DESC`,
      [section]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Tests Error:", err);
    res.status(500).json({ error: "Failed to load tests" });
  }
});

// 16. Teacher: Get Test Submissions (who submitted)
app.get('/api/teacher/test/:testId/submissions', authenticateToken, async (req, res) => {
  try {
    const test_id = req.params.testId;
    
    const result = await pool.query(
      `SELECT 
        id, student_name, student_reg_no, score, percentage, status, submitted_at, time_taken
       FROM test_submissions
       WHERE test_id = $1
       ORDER BY submitted_at DESC`,
      [test_id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Submissions Error:", err);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

// 17. Teacher: Get Student's Detailed Progress
app.get('/api/teacher/student/:studentId/progress', authenticateToken, async (req, res) => {
  try {
    const student_id = req.params.studentId;
    
    // Get student basic info
    const studentResult = await pool.query(
      'SELECT * FROM v_student_test_progress WHERE student_id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    // Get detailed test history
    const testsResult = await pool.query(
      'SELECT * FROM get_student_detailed_progress($1)',
      [student_id]
    );
    
    res.json({
      student: studentResult.rows[0],
      tests: testsResult.rows
    });
  } catch (err) {
    console.error("Student Progress Error:", err);
    res.status(500).json({ error: "Failed to load student progress" });
  }
});

// 18. Student: Get My Tests (Pending & Completed)
app.get('/api/student/tests', authenticateToken, async (req, res) => {
  try {
    const student_id = req.user.id;
    
    // Get student's section
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const full_section = `${class_dept} ${section}`;
    
    // Get all tests with submission status
    const result = await pool.query(
      `SELECT 
        t.id,
        t.title,
        t.description,
        t.total_questions,
        t.deadline,
        t.teacher_name,
        sub.id as submission_id,
        sub.score,
        sub.percentage,
        sub.status,
        sub.submitted_at,
        CASE 
          WHEN sub.id IS NULL THEN 'pending'
          ELSE 'completed'
        END as completion_status,
        CASE 
          WHEN t.deadline < CURRENT_TIMESTAMP AND sub.id IS NULL THEN true
          ELSE false
        END as is_overdue
       FROM mcq_tests t
       LEFT JOIN test_submissions sub ON t.id = sub.test_id AND sub.student_id = $1
       WHERE LOWER(t.section) = LOWER($2) AND t.is_active = true
       ORDER BY t.deadline ASC`,
      [student_id, full_section]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("Student Tests Error:", err);
    res.status(500).json({ error: "Failed to load tests" });
  }
});

// 19. Student: Get Test to Take
app.get('/api/student/test/:testId', authenticateToken, async (req, res) => {
  try {
    const test_id = req.params.testId;
    const student_id = req.user.id;
    
    // Check if already submitted
    const submissionCheck = await pool.query(
      'SELECT id FROM test_submissions WHERE test_id = $1 AND student_id = $2',
      [test_id, student_id]
    );
    
    if (submissionCheck.rows.length > 0) {
      return res.status(400).json({ error: "Test already submitted" });
    }
    
    // Get test details
    const result = await pool.query(
      'SELECT id, title, description, questions, total_questions, deadline FROM mcq_tests WHERE id = $1 AND is_active = true',
      [test_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Test not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Test Details Error:", err);
    res.status(500).json({ error: "Failed to load test" });
  }
});

// 20. Student: Submit Test
app.post('/api/student/test/submit', authenticateToken, async (req, res) => {
  try {
    const { test_id, answers, time_taken } = req.body;
    const student_id = req.user.id;
    
    console.log("=== TEST SUBMISSION DEBUG ===");
    console.log("Test ID:", test_id);
    console.log("Student Answers:", answers);
    
    // Get student info
    const studentResult = await pool.query(
      'SELECT name, reg_no FROM students WHERE id = $1',
      [student_id]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const { name, reg_no } = studentResult.rows[0];
    
    // Get test questions to calculate score
    const testResult = await pool.query(
      'SELECT questions, total_questions, deadline FROM mcq_tests WHERE id = $1',
      [test_id]
    );
    
    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: "Test not found" });
    }
    
    const { questions, total_questions, deadline } = testResult.rows[0];
    console.log("Test Questions:", questions);
    
    // CALCULATE SCORE IN BACKEND (more reliable than SQL trigger)
    let correct_count = 0;
    
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const studentAnswer = answers[i.toString()]; // answers is {"0": 1, "1": 2, ...} (index-based)
      // Support both 'correct' and 'correctAnswer' field names
      const correctAnswer = question.correct !== undefined ? question.correct : question.correctAnswer;
      
      console.log(`Q${i}: Student="${studentAnswer}" vs Correct="${correctAnswer}"`);
      
      // Compare as numbers or strings (case-insensitive for strings)
      const studentVal = typeof studentAnswer === 'number' ? studentAnswer : String(studentAnswer || '').toUpperCase().trim();
      const correctVal = typeof correctAnswer === 'number' ? correctAnswer : String(correctAnswer || '').toUpperCase().trim();
      
      if (studentVal === correctVal) {
        correct_count++;
        console.log(`  [MATCH]`);
      } else {
        console.log(`  [NO MATCH]`);
      }
    }
    
    const score = correct_count;
    const percentage = total_questions > 0 ? ((correct_count / total_questions) * 100).toFixed(2) : 0;
    
    // Check if late submission
    const isLate = new Date() > new Date(deadline);
    const status = isLate ? 'late' : 'completed';
    
    console.log(`Final Score: ${score}/${total_questions} = ${percentage}%`);
    console.log("=== END DEBUG ===");
    
    // Insert submission with calculated score
    const query = `
      INSERT INTO test_submissions (test_id, student_id, student_name, student_reg_no, answers, score, percentage, status, time_taken)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      test_id, student_id, name, reg_no, JSON.stringify(answers), score, percentage, status, time_taken
    ]);
    
    const submission = result.rows[0];
    console.log("Submission saved:", submission);
    
    // NOTIFICATION 1: Notify teacher about submission
    try {
      const testInfo = await pool.query(
        'SELECT teacher_id, teacher_name, section, title FROM mcq_tests WHERE id = $1',
        [test_id]
      );
      
      if (testInfo.rows.length > 0) {
        const testData = testInfo.rows[0];
        const teacher = await notificationService.getTeacherById(testData.teacher_id);
        
        if (teacher) {
          await notificationService.sendEmail(
            'TEST_SUBMITTED',
            teacher,
            {
              teacher_name: teacher.name,
              student_name: name,
              student_reg_no: reg_no,
              test_title: testData.title,
              score: score,
              total_questions: total_questions,
              percentage: percentage,
              status: status,
              submitted_at: new Date().toISOString(),
              test_id: test_id
            },
            { test_id, student_id, submission_id: submission.id }
          );
          console.log(`[OK] Sent TEST_SUBMITTED notification to teacher ${teacher.name}`);
        }
      }
    } catch (notifErr) {
      console.error('Teacher notification error (non-blocking):', notifErr);
    }
    
    // NOTIFICATION 2: Notify student about grade
    try {
      const studentInfo = await pool.query(
        'SELECT email FROM students WHERE id = $1',
        [student_id]
      );
      
      const testInfo = await pool.query(
        'SELECT title FROM mcq_tests WHERE id = $1',
        [test_id]
      );
      
      if (studentInfo.rows.length > 0 && testInfo.rows.length > 0) {
        const student = {
          id: student_id,
          type: 'student',
          email: studentInfo.rows[0].email,
          name: name
        };
        
        await notificationService.sendEmail(
          'GRADE_POSTED',
          student,
          {
            student_name: name,
            test_title: testInfo.rows[0].title,
            score: score,
            total_questions: total_questions,
            percentage: percentage,
            status: status
          },
          { test_id, submission_id: submission.id }
        );
        
        // Create in-app notification for student
        await pool.query(`
          INSERT INTO in_app_notifications 
          (recipient_type, recipient_id, type, title, message, metadata, created_at)
          VALUES ('student', $1, 'grade_posted', $2, $3, $4, CURRENT_TIMESTAMP)
        `, [
          student_id,
          'Grade Posted',
          `Your grade for "${testInfo.rows[0].title}" is ready: ${score}/${total_questions} (${percentage}%)`,
          JSON.stringify({
            test_id: test_id,
            test_title: testInfo.rows[0].title,
            score: score,
            total_questions: total_questions,
            percentage: percentage,
            status: status,
            graded_at: new Date().toISOString()
          })
        ]);
        
        console.log(`Sent GRADE_POSTED notification to student ${name}`);
      }
    } catch (notifErr) {
      console.error('Student grade notification error (non-blocking):', notifErr);
    }
    
    res.json({ success: true, submission });
  } catch (err) {
    console.error("Test Submission Error:", err);
    res.status(500).json({ error: "Failed to submit test: " + err.message });
  }
});

// 21. Student: Get My Progress Overview
app.get('/api/student/progress', authenticateToken, async (req, res) => {
  try {
    const student_id = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM v_student_test_progress WHERE student_id = $1',
      [student_id]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        total_tests_assigned: 0,
        tests_completed: 0,
        tests_overdue: 0,
        average_score: 0
      });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Progress Error:", err);
    res.status(500).json({ error: "Failed to load progress" });
  }
});

// --- ROUTES: CODING WORKBENCH ---

// 22. Student: Submit Code Solution
app.post('/api/student/submit-code', authenticateToken, async (req, res) => {
  try {
    const { moduleId, code, language, testCases } = req.body;
    const studentId = req.user.id;
    const studentEmail = req.user.email;

    if (!testCases || testCases.length === 0) {
      return res.status(400).json({ error: "No test cases provided." });
    }

    let passedCount = 0;

    // --- EVALUATION LOOP ---
    for (const tc of testCases) {
      const response = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: language,
          version: "*",
          files: [{ content: code }],
          stdin: tc.input,
        }),
      });

      const result = await response.json();
      const actualOutput = (result.run.stdout || "").trim();

      // Compare output with expected result
      if (actualOutput === tc.expected.trim()) {
        passedCount++;
      }
    }

    // --- CALCULATION ---
    const totalCases = testCases.length;
    const finalScore = ((passedCount / totalCases) * 100).toFixed(2);

    // --- DATABASE STORAGE ---
    const query = `
      INSERT INTO student_submissions (student_id, student_email, module_id, submitted_code, language, test_cases_passed, total_test_cases, score) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING score, test_cases_passed, total_test_cases;
    `;
    const values = [studentId, studentEmail, moduleId, code, language, passedCount, totalCases, finalScore];
    const dbResult = await pool.query(query, values);

    // --- RESPONSE FOR POPUP ---
    res.json({ 
      success: true, 
      score: dbResult.rows[0].score, 
      passed: dbResult.rows[0].test_cases_passed, 
      total: dbResult.rows[0].total_test_cases 
    });
  } catch (err) {
    console.error("SERVER ERROR:", err.message);
    res.status(500).json({ error: "Internal Server Error: " + err.message });
  }
});

// ============================================================
// NOTIFICATION SYSTEM ENDPOINTS
// ============================================================

// Get user notification preferences
app.get('/api/notifications/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    
    const result = await pool.query(
      `SELECT * FROM v_user_notification_settings 
       WHERE user_id = $1 AND user_type = $2
       ORDER BY category, event_name`,
      [userId, userType]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Get Notification Preferences Error:', err);
    res.status(500).json({ error: 'Failed to load notification preferences' });
  }
});

// Update notification preference
app.put('/api/notifications/preferences/:eventCode', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    const eventCode = req.params.eventCode;
    const { email_enabled, sms_enabled } = req.body;
    
    const result = await pool.query(
      `INSERT INTO notification_preferences (user_id, user_type, event_code, email_enabled, sms_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, user_type, event_code) 
       DO UPDATE SET 
         email_enabled = EXCLUDED.email_enabled,
         sms_enabled = EXCLUDED.sms_enabled,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, userType, eventCode, email_enabled, sms_enabled]
    );
    
    res.json({ success: true, preference: result.rows[0] });
  } catch (err) {
    console.error('Update Notification Preference Error:', err);
    res.status(500).json({ error: 'Failed to update notification preference' });
  }
});

// Get user notification history
app.get('/api/notifications/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await pool.query(
      `SELECT * FROM v_recent_notifications 
       WHERE recipient_id = $1 AND recipient_type = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, userType, limit, offset]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Get Notification History Error:', err);
    res.status(500).json({ error: 'Failed to load notification history' });
  }
});

// ============================================================
// IN-APP NOTIFICATIONS API
// ============================================================

// Get user's notification inbox
app.get('/api/notifications/inbox', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT * FROM in_app_notifications 
       WHERE recipient_id = $1 AND recipient_type = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, userType, limit, offset]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get Inbox Error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// Get unread notification count
app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;

    const result = await pool.query(
      `SELECT COUNT(*) as count FROM in_app_notifications 
       WHERE recipient_id = $1 AND recipient_type = $2 AND is_read = false`,
      [userId, userType]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Get Unread Count Error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark single notification as read
app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.id;
    const userType = req.user.role;

    await pool.query(
      `UPDATE in_app_notifications 
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND recipient_id = $2 AND recipient_type = $3`,
      [notificationId, userId, userType]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Mark Read Error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark all notifications as read
app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role;

    await pool.query(
      `UPDATE in_app_notifications 
       SET is_read = true, read_at = NOW()
       WHERE recipient_id = $1 AND recipient_type = $2 AND is_read = false`,
      [userId, userType]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Mark All Read Error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Get notification statistics (admin/teacher)
app.get('/api/notifications/stats', authenticateToken, async (req, res) => {
  try {
    // Only allow teachers and admins
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const result = await pool.query(
      `SELECT * FROM v_notification_stats 
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY date DESC, event_code`
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Get Notification Stats Error:', err);
    res.status(500).json({ error: 'Failed to load notification statistics' });
  }
});

// Manual test notification (development only)
if (process.env.ENABLE_DEV_ENDPOINTS === 'true' || process.env.NODE_ENV !== 'production') {
  app.post('/api/notifications/test', authenticateToken, async (req, res) => {
    try {
      const { eventCode, data } = req.body;
      
      const recipient = {
        id: req.user.id,
        type: req.user.role,
        email: req.user.email,
        name: req.user.name || 'User'
      };
      
      const result = await notificationService.sendEmail(eventCode, recipient, data, { test: true });
      res.json({ success: true, result });
    } catch (err) {
      console.error('Test Notification Error:', err);
      res.status(500).json({ error: err.message });
    }
  });
}

// Send deadline reminders for upcoming tests (can be called via cron job)
app.post('/api/admin/send-deadline-reminders', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (for security)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find tests with deadlines in next 24 hours that haven't been submitted
    const upcomingTests = await pool.query(`
      SELECT DISTINCT t.id, t.title, t.section, t.teacher_name, t.deadline, t.total_questions
      FROM mcq_tests t
      WHERE t.deadline > NOW() 
        AND t.deadline <= NOW() + INTERVAL '24 hours'
        AND t.is_active = true
    `);

    let remindersSent = 0;

    for (const test of upcomingTests.rows) {
      try {
        // Get students in this section who haven't submitted
        const students = await notificationService.getStudentsInSection(test.section, 'TEST_DEADLINE_REMINDER');
        
        // Filter out students who already submitted
        const unsubmittedStudents = [];
        for (const student of students) {
          const submissionCheck = await pool.query(
            'SELECT id FROM mcq_submissions WHERE test_id = $1 AND student_id = $2',
            [test.id, student.id]
          );
          if (submissionCheck.rows.length === 0) {
            unsubmittedStudents.push(student);
          }
        }

        if (unsubmittedStudents.length > 0) {
          // Send email reminders
          await notificationService.sendBatchEmails(
            'TEST_DEADLINE_REMINDER',
            unsubmittedStudents,
            (student) => ({
              student_name: student.name,
              test_title: test.title,
              teacher_name: test.teacher_name,
              section: test.section,
              deadline: new Date(test.deadline).toLocaleString(),
              hours_remaining: Math.ceil((new Date(test.deadline) - new Date()) / (1000 * 60 * 60)),
              total_questions: test.total_questions
            }),
            { test_id: test.id }
          );

          // Send in-app notifications
          for (const student of unsubmittedStudents) {
            await pool.query(`
              INSERT INTO in_app_notifications 
              (recipient_type, recipient_id, type, title, message, metadata, created_at)
              VALUES ('student', $1, 'test_deadline_reminder', $2, $3, $4, CURRENT_TIMESTAMP)
            `, [
              student.id,
              'Test Deadline Reminder',
              `"${test.title}" is due in ${Math.ceil((new Date(test.deadline) - new Date()) / (1000 * 60 * 60))} hours! Don't forget to submit.`,
              JSON.stringify({
                test_id: test.id,
                test_title: test.title,
                teacher_name: test.teacher_name,
                section: test.section,
                deadline: test.deadline,
                priority: 'high'
              })
            ]);
          }

          remindersSent += unsubmittedStudents.length;
          console.log(`[OK] Sent deadline reminders for "${test.title}" to ${unsubmittedStudents.length} students`);
        }
      } catch (testErr) {
        console.error(`Error sending reminders for test ${test.id}:`, testErr);
      }
    }

    res.json({ 
      success: true, 
      tests_processed: upcomingTests.rows.length,
      reminders_sent: remindersSent 
    });
  } catch (err) {
    console.error('Send Deadline Reminders Error:', err);
    res.status(500).json({ error: 'Failed to send deadline reminders' });
  }
});

// =============================================================================
// LIVE SESSIONS (JITSI) CALENDAR API
// =============================================================================

// Get scheduled live sessions for student
app.get('/api/student/live-sessions', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.id;
    
    // Get student's section
    const studentResult = await pool.query(
      'SELECT class_dept, section FROM students WHERE id = $1',
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const { class_dept, section } = studentResult.rows[0];
    const fullSection = `${class_dept} ${section}`;
    
    // Get modules with jitsi steps
    const result = await pool.query(`
      SELECT m.id as module_id, m.topic_title, m.teacher_name, m.section, m.subject, m.steps
      FROM modules m
      WHERE LOWER(m.section) = LOWER($1)
      ORDER BY m.created_at DESC
    `, [fullSection]);
    
    // Extract jitsi sessions from modules
    const sessions = [];
    for (const module of result.rows) {
      if (module.steps && Array.isArray(module.steps)) {
        module.steps.forEach((step, index) => {
          if (step.type === 'jitsi' && step.data) {
            const sessionData = typeof step.data === 'string' ? JSON.parse(step.data) : step.data;
            sessions.push({
              id: `${module.module_id}-${index}`,
              module_id: module.module_id,
              topic: module.topic_title,
              step_title: step.header,
              teacher_name: module.teacher_name,
              section: module.section,
              subject: module.subject,
              room_name: sessionData.roomName,
              scheduled_time: sessionData.scheduledTime,
              duration: sessionData.duration || 60,
              meeting_url: sessionData.meetingUrl || `https://8x8.vc/${sessionData.roomName}`
            });
          }
        });
      }
    }
    
    // Sort by scheduled time
    sessions.sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
    
    res.json(sessions);
  } catch (err) {
    console.error('Live Sessions Error:', err);
    res.status(500).json({ error: 'Failed to fetch live sessions' });
  }
});

// Get scheduled live sessions for teacher
app.get('/api/teacher/live-sessions', authenticateToken, async (req, res) => {
  try {
    const teacherId = req.user.id;
    
    // Get modules created by this teacher with jitsi steps
    const result = await pool.query(`
      SELECT m.id as module_id, m.topic_title, m.teacher_name, m.section, m.subject, m.steps
      FROM modules m
      WHERE m.teacher_id = $1
      ORDER BY m.created_at DESC
    `, [teacherId]);
    
    // Extract jitsi sessions from modules
    const sessions = [];
    for (const module of result.rows) {
      if (module.steps && Array.isArray(module.steps)) {
        module.steps.forEach((step, index) => {
          if (step.type === 'jitsi' && step.data) {
            const sessionData = typeof step.data === 'string' ? JSON.parse(step.data) : step.data;
            sessions.push({
              id: `${module.module_id}-${index}`,
              module_id: module.module_id,
              topic: module.topic_title,
              step_title: step.header,
              section: module.section,
              subject: module.subject,
              room_name: sessionData.roomName,
              scheduled_time: sessionData.scheduledTime,
              duration: sessionData.duration || 60,
              meeting_url: sessionData.meetingUrl || `https://8x8.vc/${sessionData.roomName}`
            });
          }
        });
      }
    }
    
    // Sort by scheduled time
    sessions.sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
    
    res.json(sessions);
  } catch (err) {
    console.error('Teacher Live Sessions Error:', err);
    res.status(500).json({ error: 'Failed to fetch live sessions' });
  }
});

// =============================================================================
// CHAT SYSTEM - Real-time Faculty-Student Communication
// =============================================================================

// Initialize chat tables
const initChatTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'direct',
        section VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        user_role VARCHAR(20) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, user_id, user_role)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL,
        sender_role VARCHAR(20) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text',
        file_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('[CHAT] Tables initialized');
  } catch (err) {
    console.error('[CHAT] Table init error:', err.message);
  }
};

// Initialize chat tables on startup
initChatTables();

// Get or create direct chat room between teacher and student
app.post('/api/chat/room', authenticateToken, async (req, res) => {
  try {
    const { targetId, targetRole } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate: teachers can chat with students, students can chat with teachers
    if (userRole === targetRole) {
      return res.status(400).json({ error: 'Cannot create chat with same role' });
    }

    // Check if room already exists
    const existingRoom = await pool.query(`
      SELECT cr.* FROM chat_rooms cr
      JOIN chat_participants cp1 ON cr.id = cp1.room_id
      JOIN chat_participants cp2 ON cr.id = cp2.room_id
      WHERE cr.type = 'direct'
        AND cp1.user_id = $1 AND cp1.user_role = $2
        AND cp2.user_id = $3 AND cp2.user_role = $4
    `, [userId, userRole, targetId, targetRole]);

    if (existingRoom.rows.length > 0) {
      return res.json({ room: existingRoom.rows[0] });
    }

    // Get names for room name
    const userTable = userRole === 'student' ? 'students' : 'teachers';
    const targetTable = targetRole === 'student' ? 'students' : 'teachers';
    
    const userData = await pool.query(`SELECT name FROM ${userTable} WHERE id = $1`, [userId]);
    const targetData = await pool.query(`SELECT name FROM ${targetTable} WHERE id = $1`, [targetId]);

    const roomName = `${userData.rows[0]?.name || 'User'} - ${targetData.rows[0]?.name || 'User'}`;

    // Create new room
    const newRoom = await pool.query(
      `INSERT INTO chat_rooms (name, type) VALUES ($1, 'direct') RETURNING *`,
      [roomName]
    );

    // Add participants
    await pool.query(
      `INSERT INTO chat_participants (room_id, user_id, user_role) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [newRoom.rows[0].id, userId, userRole, targetId, targetRole]
    );

    res.json({ room: newRoom.rows[0] });
  } catch (err) {
    console.error('Create chat room error:', err);
    res.status(500).json({ error: 'Failed to create chat room' });
  }
});

// Get user's chat rooms
app.get('/api/chat/rooms', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const rooms = await pool.query(`
      SELECT cr.*, 
        cp.last_read_at,
        (SELECT COUNT(*) FROM chat_messages cm 
         WHERE cm.room_id = cr.id AND cm.created_at > cp.last_read_at
         AND NOT (cm.sender_id = $1 AND cm.sender_role = $2)) as unread_count,
        (SELECT cm.message FROM chat_messages cm 
         WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) as last_message,
        (SELECT cm.created_at FROM chat_messages cm 
         WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) as last_message_at
      FROM chat_rooms cr
      JOIN chat_participants cp ON cr.id = cp.room_id
      WHERE cp.user_id = $1 AND cp.user_role = $2
      ORDER BY last_message_at DESC NULLS LAST
    `, [userId, userRole]);

    // Get other participant info for each room
    const roomsWithParticipants = await Promise.all(rooms.rows.map(async (room) => {
      const otherParticipant = await pool.query(`
        SELECT cp.user_id, cp.user_role,
          CASE 
            WHEN cp.user_role = 'student' THEN (SELECT name FROM students WHERE id = cp.user_id)
            ELSE (SELECT name FROM teachers WHERE id = cp.user_id)
          END as name
        FROM chat_participants cp
        WHERE cp.room_id = $1 AND NOT (cp.user_id = $2 AND cp.user_role = $3)
        LIMIT 1
      `, [room.id, userId, userRole]);

      return {
        ...room,
        other_participant: otherParticipant.rows[0] || null
      };
    }));

    res.json(roomsWithParticipants);
  } catch (err) {
    console.error('Get chat rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch chat rooms' });
  }
});

// Get messages for a room
app.get('/api/chat/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const { limit = 50, before } = req.query;

    // Verify user is participant
    const participant = await pool.query(
      `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
      [roomId, userId, userRole]
    );

    if (participant.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant of this room' });
    }

    let query = `
      SELECT * FROM chat_messages 
      WHERE room_id = $1 AND is_deleted = FALSE
    `;
    const params = [roomId];

    if (before) {
      query += ` AND created_at < $2`;
      params.push(before);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const messages = await pool.query(query, params);

    // Update last read
    await pool.query(
      `UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP 
       WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
      [roomId, userId, userRole]
    );

    res.json(messages.rows.reverse());
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message (REST fallback - Socket.io preferred)
app.post('/api/chat/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify user is participant
    const participant = await pool.query(
      `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
      [roomId, userId, userRole]
    );

    if (participant.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant of this room' });
    }

    // Get sender name
    const table = userRole === 'student' ? 'students' : 'teachers';
    const userData = await pool.query(`SELECT name FROM ${table} WHERE id = $1`, [userId]);
    const senderName = userData.rows[0]?.name || 'Unknown';

    // Insert message
    const newMessage = await pool.query(
      `INSERT INTO chat_messages (room_id, sender_id, sender_role, sender_name, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [roomId, userId, userRole, senderName, message]
    );

    res.json(newMessage.rows[0]);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get list of users available to chat (for initiating new conversations)
app.get('/api/chat/available-users', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'student') {
      // Students can see their allocated teachers
      const studentData = await pool.query(
        `SELECT class_dept, section FROM students WHERE id = $1`, [userId]
      );
      
      if (studentData.rows.length === 0) {
        return res.json([]);
      }

      const { class_dept, section } = studentData.rows[0];
      const fullSection = `${class_dept} ${section}`;

      const teachers = await pool.query(`
        SELECT DISTINCT t.id, t.name, t.email, ta.subject
        FROM teachers t
        JOIN teacher_allocations ta ON t.id = ta.teacher_id
        WHERE LOWER(ta.section) = LOWER($1)
      `, [fullSection]);

      res.json(teachers.rows.map(t => ({ ...t, role: 'teacher' })));
    } else if (userRole === 'teacher') {
      // Teachers can see students in their allocated sections
      const allocations = await pool.query(
        `SELECT section FROM teacher_allocations WHERE teacher_id = $1`, [userId]
      );

      const sections = allocations.rows.map(a => a.section.toLowerCase());
      
      if (sections.length === 0) {
        return res.json([]);
      }

      const students = await pool.query(`
        SELECT id, name, email, class_dept, section
        FROM students
        WHERE LOWER(class_dept || ' ' || section) = ANY($1::text[])
      `, [sections]);

      res.json(students.rows.map(s => ({ ...s, role: 'student' })));
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error('Get available users error:', err);
    res.status(500).json({ error: 'Failed to fetch available users' });
  }
});

// =============================================================================
// GLOBAL ERROR HANDLER - Must be last middleware
// =============================================================================
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Handle specific error types
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({ error: 'Duplicate entry' });
  }
  if (err.code === '23503') { // PostgreSQL foreign key violation
    return res.status(400).json({ error: 'Referenced record not found' });
  }
  
  // Generic error response
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// SPA fallback - serve index.html for any non-API routes
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Export app for testing, only listen if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  
  // Create HTTP server for Socket.io
  const server = http.createServer(app);
  
  // Initialize Socket.io
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST']
    }
  });

  // Socket.io authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // Socket.io connection handler
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[SOCKET] User connected: ${user.email} (${user.role})`);

    // Join user's personal room for direct messages
    socket.join(`user:${user.role}:${user.id}`);

    // Join chat room
    socket.on('join-room', async (roomId) => {
      try {
        // Verify user is participant
        const participant = await pool.query(
          `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
          [roomId, user.id, user.role]
        );
        
        if (participant.rows.length > 0) {
          socket.join(`room:${roomId}`);
          console.log(`[SOCKET] ${user.email} joined room ${roomId}`);
        }
      } catch (err) {
        console.error('[SOCKET] Join room error:', err);
      }
    });

    // Leave chat room
    socket.on('leave-room', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // Send message
    socket.on('send-message', async (data) => {
      try {
        const { roomId, message } = data;

        // Verify user is participant
        const participant = await pool.query(
          `SELECT * FROM chat_participants WHERE room_id = $1 AND user_id = $2 AND user_role = $3`,
          [roomId, user.id, user.role]
        );

        if (participant.rows.length === 0) {
          socket.emit('error', { message: 'Not authorized' });
          return;
        }

        // Get sender name
        const table = user.role === 'student' ? 'students' : 'teachers';
        const userData = await pool.query(`SELECT name FROM ${table} WHERE id = $1`, [user.id]);
        const senderName = userData.rows[0]?.name || 'Unknown';

        // Save message
        const newMessage = await pool.query(
          `INSERT INTO chat_messages (room_id, sender_id, sender_role, sender_name, message)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [roomId, user.id, user.role, senderName, message]
        );

        // Broadcast to room
        io.to(`room:${roomId}`).emit('new-message', newMessage.rows[0]);

        // Also notify other participant if not in room
        const otherParticipants = await pool.query(
          `SELECT user_id, user_role FROM chat_participants 
           WHERE room_id = $1 AND NOT (user_id = $2 AND user_role = $3)`,
          [roomId, user.id, user.role]
        );

        otherParticipants.rows.forEach(p => {
          io.to(`user:${p.user_role}:${p.user_id}`).emit('message-notification', {
            roomId,
            message: newMessage.rows[0],
            from: senderName
          });
        });

      } catch (err) {
        console.error('[SOCKET] Send message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', (roomId) => {
      socket.to(`room:${roomId}`).emit('user-typing', {
        userId: user.id,
        userRole: user.role,
        roomId
      });
    });

    // Stop typing indicator
    socket.on('stop-typing', (roomId) => {
      socket.to(`room:${roomId}`).emit('user-stopped-typing', {
        userId: user.id,
        userRole: user.role,
        roomId
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[SOCKET] User disconnected: ${user.email}`);
    });
  });

  server.listen(PORT, () => console.log(`SERVER ACTIVE ON PORT ${PORT}`));
}

module.exports = app;