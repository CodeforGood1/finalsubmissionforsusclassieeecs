// ============================================================
// LOCAL EMAIL SERVICE
// ============================================================
// Purpose: Handle email notifications locally for on-premise deployment
// Replaces: Mailjet cloud email service
// Features:
//   - Local SMTP support (Postfix, MailHog, etc.)
//   - Email queue with retry logic
//   - Fallback to in-app notifications
//   - Development mode with console logging
// ============================================================

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Email queue for offline/retry scenarios
const emailQueue = [];
const EMAIL_QUEUE_FILE = path.join(__dirname, 'data', 'email-queue.json');

// Ensure data directory exists
const ensureDataDir = () => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Create transporter based on environment
const createTransporter = () => {
  // Check if we're using Gmail
  const isGmail = process.env.SMTP_HOST === 'smtp.gmail.com' || 
                  process.env.EMAIL_SERVICE === 'gmail';
  
  let config;
  
  if (isGmail) {
    // Gmail configuration
    config = {
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER || process.env.GMAIL_USER,
        pass: process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD
      }
    };
    console.log('[EMAIL] Using Gmail SMTP');
  } else {
    // Generic SMTP configuration
    config = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT) || 1025,
      secure: process.env.SMTP_SECURE === 'true',
      ignoreTLS: process.env.SMTP_IGNORE_TLS !== 'false',
    };
    
    // Add auth if credentials are provided
    if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      config.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      };
    }
  }
  
  console.log('[EMAIL] SMTP Configuration:');
  console.log(`  Host: ${config.host || 'Gmail Service'}`);
  console.log(`  Port: ${config.port || '587 (Gmail)'}`);
  console.log(`  Secure: ${config.secure ?? 'auto'}`);
  console.log(`  Auth: ${config.auth ? 'Configured' : 'None (dev mode)'}`);
  
  return nodemailer.createTransport(config);
};

let transporter = null;

// Initialize email service
const initializeEmailService = () => {
  try {
    ensureDataDir();
    transporter = createTransporter();
    
    // Verify connection
    transporter.verify((error, success) => {
      if (error) {
        console.warn('[LOCAL EMAIL] SMTP connection failed:', error.message);
        console.log('[LOCAL EMAIL] Emails will be queued and logged to console');
      } else {
        console.log('[LOCAL EMAIL] SMTP server ready');
      }
    });
    
    // Load any queued emails from previous session
    loadEmailQueue();
    
    // Process queue periodically
    setInterval(processEmailQueue, 60000); // Every minute
    
  } catch (err) {
    console.error('[LOCAL EMAIL] Failed to initialize:', err.message);
  }
};

// Email sender info
const getFromAddress = () => ({
  name: process.env.EMAIL_FROM_NAME || 'Sustainable Classroom',
  address: process.env.EMAIL_FROM_ADDRESS || 'noreply@classroom.local'
});

// Send email
const sendEmail = async (mailOptions) => {
  const from = getFromAddress();
  
  const emailData = {
    from: `"${from.name}" <${from.address}>`,
    to: mailOptions.to,
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text || stripHtml(mailOptions.html),
    timestamp: new Date().toISOString()
  };
  
  console.log('[EMAIL] Sending to:', emailData.to, '| Subject:', emailData.subject);
  
  // Check if real SMTP is configured
  // hasRealSMTP = true if:
  // 1. Gmail/authenticated SMTP (has user + password), OR
  // 2. MailHog/local SMTP (has host configured, even without auth)
  const hasAuthSMTP = process.env.SMTP_USER && process.env.SMTP_PASSWORD;
  const hasLocalSMTP = process.env.SMTP_HOST && !process.env.EMAIL_DEV_MODE;
  const shouldSendEmail = hasAuthSMTP || hasLocalSMTP;
  
  // Pure development mode - just log to console (no SMTP configured)
  if (!shouldSendEmail && (process.env.NODE_ENV === 'development' || process.env.EMAIL_DEV_MODE === 'true')) {
    console.log('[EMAIL DEV] Email logged (no SMTP configured):');
    console.log('  To:', emailData.to);
    console.log('  Subject:', emailData.subject);
    
    // Extract OTP if present for testing
    const otpMatch = emailData.html?.match(/(\d{6})/);
    if (otpMatch) {
      console.log('  [DEV] OTP Code:', otpMatch[1]);
    }
    
    return { success: true, mode: 'development' };
  }
  
  // Try to send
  try {
    if (!transporter) {
      transporter = createTransporter();
    }
    
    const result = await transporter.sendMail(emailData);
    console.log('[LOCAL EMAIL] Sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (err) {
    console.error('[LOCAL EMAIL] Send failed:', err.message);
    
    // Queue for retry
    queueEmail(emailData);
    
    return { success: false, error: err.message, queued: true };
  }
};

// Send OTP email
const sendOTPEmail = async (email, otp, userName = 'User') => {
  return sendEmail({
    to: email,
    subject: 'Your Login Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Security Verification</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">Use the code below to complete your login:</p>
          
          <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h1 style="color: #059669; font-size: 40px; letter-spacing: 8px; margin: 0; font-family: monospace;">${otp}</h1>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            Sustainable Classroom LMS - On-Premise Edition
          </p>
        </div>
      </div>
    `
  });
};

// Send notification email
const sendNotificationEmail = async (email, subject, content, userName = 'User') => {
  return sendEmail({
    to: email,
    subject: subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">${subject}</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${userName}</strong>,</p>
          ${content}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            Sustainable Classroom LMS - On-Premise Edition
          </p>
        </div>
      </div>
    `
  });
};

// Queue email for later retry
const queueEmail = (emailData) => {
  emailQueue.push({
    ...emailData,
    attempts: 0,
    queuedAt: new Date().toISOString()
  });
  
  saveEmailQueue();
  console.log(`[LOCAL EMAIL] Email queued for retry (${emailQueue.length} in queue)`);
};

// Process queued emails
const processEmailQueue = async () => {
  if (emailQueue.length === 0) return;
  
  console.log(`[LOCAL EMAIL] Processing queue (${emailQueue.length} emails)`);
  
  const toProcess = [...emailQueue];
  emailQueue.length = 0; // Clear queue
  
  for (const email of toProcess) {
    email.attempts++;
    
    if (email.attempts > 5) {
      console.log(`[LOCAL EMAIL] Dropping email after 5 attempts: ${email.to}`);
      continue;
    }
    
    try {
      await transporter.sendMail(email);
      console.log(`[LOCAL EMAIL] Queued email sent: ${email.to}`);
    } catch (err) {
      console.log(`[LOCAL EMAIL] Retry failed (attempt ${email.attempts}): ${email.to}`);
      emailQueue.push(email); // Re-queue
    }
  }
  
  saveEmailQueue();
};

// Save queue to disk
const saveEmailQueue = () => {
  try {
    ensureDataDir();
    fs.writeFileSync(EMAIL_QUEUE_FILE, JSON.stringify(emailQueue, null, 2));
  } catch (err) {
    console.error('[LOCAL EMAIL] Failed to save queue:', err.message);
  }
};

// Load queue from disk
const loadEmailQueue = () => {
  try {
    if (fs.existsSync(EMAIL_QUEUE_FILE)) {
      const data = fs.readFileSync(EMAIL_QUEUE_FILE, 'utf8');
      const loaded = JSON.parse(data);
      emailQueue.push(...loaded);
      console.log(`[LOCAL EMAIL] Loaded ${loaded.length} queued emails`);
    }
  } catch (err) {
    console.error('[LOCAL EMAIL] Failed to load queue:', err.message);
  }
};

// Strip HTML tags for text version
const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Get queue status
const getQueueStatus = () => ({
  queueLength: emailQueue.length,
  transporterReady: !!transporter,
  config: {
    host: process.env.SMTP_HOST || 'localhost',
    port: process.env.SMTP_PORT || 1025,
    devMode: process.env.EMAIL_DEV_MODE === 'true' || process.env.NODE_ENV === 'development'
  }
});

module.exports = {
  initializeEmailService,
  sendEmail,
  sendOTPEmail,
  sendNotificationEmail,
  processEmailQueue,
  getQueueStatus
};
