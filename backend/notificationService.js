// Email Notification Service - Mailjet integration

const { Pool } = require('pg');

let dbPool;

const initializeNotificationService = (pool) => {
  dbPool = pool;
};

const createMailjetClient = () => {
  const mjApiKeyPublic = process.env.MJ_APIKEY_PUBLIC;
  const mjApiKeyPrivate = process.env.MJ_APIKEY_PRIVATE;
  
  if (mjApiKeyPublic && mjApiKeyPrivate) {
    const Mailjet = require('node-mailjet');
    return Mailjet.apiConnect(mjApiKeyPublic, mjApiKeyPrivate);
  }
  
  console.warn('[WARNING] Mailjet API keys not set - emails will be logged only');
  return null;
};

// Resolve frontend base URL at runtime
// Priority: FRONTEND_URL (manual override) -> RENDER_EXTERNAL_URL (Render default) -> localhost
const FRONTEND_BASE = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';

// ============================================================
// EMAIL TEMPLATES
// ============================================================

const emailTemplates = {
  // STUDENT TEMPLATES
  MODULE_PUBLISHED: (data) => ({
    subject: `New Module Available: ${data.topic_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">New Learning Module Published</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.student_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">A new module has been published for your section <strong>${data.section}</strong>:</p>
          
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h3 style="color: #1e40af; margin: 0 0 10px 0;">${data.topic_title}</h3>
            <p style="color: #1e40af; margin: 5px 0;"><strong>Subject:</strong> ${data.subject || 'Not specified'}</p>
            <p style="color: #1e40af; margin: 5px 0;"><strong>Teacher:</strong> ${data.teacher_name}</p>
            <p style="color: #1e40af; margin: 5px 0;"><strong>Steps:</strong> ${data.step_count} lessons</p>
          </div>
          
          <p style="color: #1f2937; line-height: 1.6;">Start learning now to stay ahead in your coursework.</p>
          
           <a href="${FRONTEND_BASE}/courses" 
             style="display: inline-block; background-color: #111827; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
            View Module
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px; line-height: 1.4;">
            You received this email because you are enrolled in Section ${data.section}. 
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),

  TEST_ASSIGNED: (data) => ({
    subject: `New Test Assigned: ${data.test_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">New Test Assigned</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.student_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">A new test has been assigned to your section:</p>
          
          <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <h3 style="color: #92400e; margin: 0 0 10px 0;">${data.test_title}</h3>
            <p style="color: #92400e; margin: 5px 0;"><strong>Section:</strong> ${data.section}</p>
            <p style="color: #92400e; margin: 5px 0;"><strong>Questions:</strong> ${data.total_questions}</p>
            <p style="color: #92400e; margin: 5px 0;"><strong>Start:</strong> ${new Date(data.start_date).toLocaleString()}</p>
            <p style="color: #dc2626; margin: 5px 0; font-weight: bold;"><strong>Deadline:</strong> ${new Date(data.deadline).toLocaleString()}</p>
          </div>
          
          ${data.description ? `<p style="color: #4b5563; line-height: 1.6;"><strong>Description:</strong> ${data.description}</p>` : ''}
          
           <a href="${FRONTEND_BASE}/test" 
             style="display: inline-block; background-color: #111827; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
            Take Test Now
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),

  TEST_DEADLINE_REMINDER: (data) => ({
    subject: `Urgent: Test "${data.test_title}" Due in ${data.hours_remaining} Hours!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #dc2626; margin-bottom: 16px; font-weight: 700;">Test Deadline Approaching!</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.student_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">This is an urgent reminder! Your test deadline is approaching:</p>
          
          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="color: #dc2626; margin: 0 0 10px 0; font-size: 20px;">${data.test_title}</h3>
            <p style="color: #b91c1c; margin: 5px 0;"><strong>Section:</strong> ${data.section}</p>
            <p style="color: #b91c1c; margin: 5px 0;"><strong>Teacher:</strong> ${data.teacher_name}</p>
            <p style="color: #b91c1c; margin: 5px 0; font-size: 18px; font-weight: bold;">Due: ${data.deadline}</p>
            <p style="color: #dc2626; margin: 10px 0; font-size: 24px; font-weight: bold;">Only ${data.hours_remaining} hours remaining!</p>
          </div>
          
          <p style="color: #1f2937; line-height: 1.6; font-weight: 600;">Don't miss the deadline! Complete your test now.</p>
          
          <a href="${FRONTEND_BASE}/test" 
             style="display: inline-block; background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: 700; font-size: 16px;">
            Take Test Now - ${data.total_questions} Questions
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),

  TEST_DEADLINE_24H: (data) => ({
    subject: `Reminder: Test "${data.test_title}" Due in 24 Hours`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Test Deadline Reminder</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.student_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">This is a reminder that the following test is due in <strong>24 hours</strong>:</p>
          
          <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="color: #991b1b; margin: 0 0 10px 0;">${data.test_title}</h3>
            <p style="color: #991b1b; margin: 5px 0; font-size: 18px; font-weight: bold;">Deadline: ${new Date(data.deadline).toLocaleString()}</p>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6;">${data.submitted ? 'You have already submitted this test.' : 'You have not submitted this test yet. Complete it before the deadline!'}</p>
          
          ${!data.submitted ? `
            <a href="${FRONTEND_BASE}/test" 
               style="display: inline-block; background-color: #111827; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
              Complete Test Now
            </a>
          ` : ''}
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),

  GRADE_POSTED: (data) => ({
    subject: `Grade Posted: ${data.test_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Test Grade Posted</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.student_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">Your grade for the following test has been posted:</p>
          
          <div style="background-color: ${data.percentage >= 50 ? '#d1fae5' : '#fee2e2'}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${data.percentage >= 50 ? '#10b981' : '#dc2626'};">
            <h3 style="color: ${data.percentage >= 50 ? '#065f46' : '#991b1b'}; margin: 0 0 10px 0;">${data.test_title}</h3>
            <p style="color: ${data.percentage >= 50 ? '#065f46' : '#991b1b'}; margin: 5px 0; font-size: 24px; font-weight: bold;">
              Score: ${data.score}/${data.total_questions} (${data.percentage}%)
            </p>
            <p style="color: ${data.percentage >= 50 ? '#065f46' : '#991b1b'}; margin: 5px 0;">Status: ${data.status}</p>
          </div>
          
          ${data.percentage < 50 ? `
            <p style="color: #1f2937; line-height: 1.6; font-weight: 600;">Your score is below 50%. Consider reviewing the material and discussing with your teacher.</p>
          ` : `
            <p style="color: #1f2937; line-height: 1.6; font-weight: 600;">Great job! Keep up the good work.</p>
          `}
          
           <a href="${FRONTEND_BASE}/progress" 
             style="display: inline-block; background-color: #111827; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
            View Detailed Results
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),

  // TEACHER TEMPLATES
  MODULE_COMPLETED_BY_STUDENT: (data) => ({
    subject: `Student Completed Module: ${data.student_name} - ${data.module_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Student Module Completion</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.teacher_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">Great news! One of your students has completed a module:</p>
          
          <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <h3 style="color: #065f46; margin: 0 0 10px 0;">${data.module_title}</h3>
            <p style="color: #065f46; margin: 5px 0;"><strong>Student:</strong> ${data.student_name} (${data.student_reg_no || 'N/A'})</p>
            <p style="color: #065f46; margin: 5px 0;"><strong>Section:</strong> ${data.section}</p>
            <p style="color: #065f46; margin: 5px 0;"><strong>Completion Time:</strong> ${data.completion_time}</p>
            <p style="color: #065f46; margin: 5px 0;"><strong>Steps Completed:</strong> ${data.total_steps} steps</p>
          </div>
          
          <p style="color: #1f2937; line-height: 1.6; font-weight: 600;">The student has successfully completed all learning steps in this module!</p>
          
           <a href="${FRONTEND_BASE}/teacher/analytics" 
             style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
            View Student Progress
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),
  
  TEST_SUBMITTED: (data) => ({
    subject: `Test Submission: ${data.student_name} - ${data.test_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">New Test Submission</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.teacher_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">A student has submitted a test:</p>
          
          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h3 style="color: #1e40af; margin: 0 0 10px 0;">${data.test_title}</h3>
            <p style="color: #1e40af; margin: 5px 0;"><strong>Student:</strong> ${data.student_name} (${data.student_reg_no})</p>
            <p style="color: #1e40af; margin: 5px 0;"><strong>Score:</strong> ${data.score}/${data.total_questions} (${data.percentage}%)</p>
            <p style="color: #1e40af; margin: 5px 0;"><strong>Status:</strong> ${data.status}</p>
            <p style="color: #1e40af; margin: 5px 0;"><strong>Submitted:</strong> ${new Date(data.submitted_at).toLocaleString()}</p>
          </div>
          
           <a href="${FRONTEND_BASE}/teacher/submissions/${data.test_id}" 
             style="display: inline-block; background-color: #111827; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
            View All Submissions
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),

  LOW_CLASS_PERFORMANCE: (data) => ({
    subject: `Class Performance Alert: ${data.test_title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Low Class Performance Alert</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.teacher_name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">The average performance on the following test is below 60%:</p>
          
          <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="color: #991b1b; margin: 0 0 10px 0;">${data.test_title}</h3>
            <p style="color: #991b1b; margin: 5px 0;"><strong>Section:</strong> ${data.section}</p>
            <p style="color: #991b1b; margin: 5px 0; font-size: 20px;"><strong>Average Score:</strong> ${data.average_percentage}%</p>
            <p style="color: #991b1b; margin: 5px 0;"><strong>Submissions:</strong> ${data.submission_count}/${data.total_students}</p>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6;">Consider reviewing the material with students or providing additional resources.</p>
          
           <a href="${FRONTEND_BASE}/teacher/submissions/${data.test_id}" 
             style="display: inline-block; background-color: #111827; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
            View Detailed Statistics
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            <a href="${FRONTEND_BASE}/settings/notifications" style="color: #111827; text-decoration: underline;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    `
  }),

  // SYSTEM TEMPLATES
  ACCOUNT_CREATED: (data) => ({
    subject: `Welcome to Sustainable Classroom`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">
          <h2 style="color: #111827; margin-bottom: 16px; font-weight: 700;">Welcome to Sustainable Classroom</h2>
          <p style="color: #1f2937; line-height: 1.6;">Hello <strong>${data.name}</strong>,</p>
          <p style="color: #1f2937; line-height: 1.6;">Your ${data.role} account has been successfully created.</p>
          
          <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="color: #065f46; margin: 5px 0;"><strong>Email:</strong> ${data.email}</p>
            ${data.reg_no ? `<p style="color: #065f46; margin: 5px 0;"><strong>Registration No:</strong> ${data.reg_no}</p>` : ''}
            ${data.section ? `<p style="color: #065f46; margin: 5px 0;"><strong>Section:</strong> ${data.section}</p>` : ''}
          </div>
          
          <p style="color: #1f2937; line-height: 1.6;">You can now log in and start ${data.role === 'student' ? 'learning' : 'teaching'}.</p>
          
           <a href="${FRONTEND_BASE}/login" 
             style="display: inline-block; background-color: #111827; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: 600;">
            Login Now
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            If you didn't create this account, please contact your administrator.
          </p>
        </div>
      </div>
    `
  })
};

// ============================================================
// CORE NOTIFICATION FUNCTIONS
// ============================================================

/**
 * Send email notification
 * @param {string} eventCode - Notification event code
 * @param {Object} recipient - {id, type, email, name}
 * @param {Object} data - Template data
 * @param {Object} metadata - Additional metadata to store
 * @returns {Promise<Object>} - Send result
 */
const sendEmail = async (eventCode, recipient, data, metadata = {}) => {
  try {
    // Prevent test-triggered emails in production
    if (metadata && metadata.test && process.env.NODE_ENV === 'production') {
      console.log(`Test email suppressed in production (${eventCode} → ${recipient.email})`);
      return { success: false, reason: 'test_disabled_in_prod' };
    }
    // Check if user has email notifications enabled for this event
    // Default to ENABLED if no preference exists (opt-out model)
    const prefResult = await dbPool.query(
      `SELECT email_enabled FROM notification_preferences 
       WHERE user_id = $1 AND user_type = $2 AND event_code = $3`,
      [recipient.id, recipient.type, eventCode]
    );

    // If preference exists and is explicitly disabled, skip
    // If no preference exists (new user), send the email (opt-out model)
    if (prefResult.rows.length > 0 && prefResult.rows[0].email_enabled === false) {
      console.log(`Email notification disabled for user ${recipient.id} (${eventCode})`);
      return { success: false, reason: 'disabled_by_user' };
    }

    // Get email template
    const template = emailTemplates[eventCode];
    if (!template) {
      throw new Error(`No email template found for event: ${eventCode}`);
    }

    const { subject, html } = template(data);

    // Create Mailjet client
    const mailjet = createMailjetClient();
    
    if (!mailjet) {
      console.log(`[EMAIL MOCK] ${eventCode} → ${recipient.email}: ${subject}`);
      return { success: false, reason: 'no_mailjet_config' };
    }

    // Send email via Mailjet
    const result = await mailjet
      .post('send', { version: 'v3.1' })
      .request({
        Messages: [
          {
            From: {
              Email: 'susclass.global@gmail.com',
              Name: 'SusClass'
            },
            To: [
              {
                Email: recipient.email
              }
            ],
            Subject: subject,
            HTMLPart: html
          }
        ]
      });

    const status = result.body.Messages[0].Status;
    
    if (status === 'success') {
      // Log success
      await dbPool.query(
        `INSERT INTO notification_logs 
         (event_code, recipient_id, recipient_type, recipient_email, channel, status, subject, message, metadata, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
        [eventCode, recipient.id, recipient.type, recipient.email, 'email', 'sent', subject, html, JSON.stringify(metadata)]
      );

      console.log(`[OK] Email sent via Mailjet to ${recipient.email} (${eventCode})`);
      return { success: true, messageId: result.body.Messages[0].To[0].MessageUUID };
    } else {
      throw new Error(`Mailjet status: ${status}`);
    }

  } catch (error) {
    console.error(`[ERROR] Email send failed for ${recipient.email} (${eventCode}):`, error.message);

    // Log failure
    await dbPool.query(
      `INSERT INTO notification_logs 
       (event_code, recipient_id, recipient_type, recipient_email, channel, status, message, metadata, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eventCode, recipient.id, recipient.type, recipient.email, 'email', 'failed', '', JSON.stringify(metadata), error.message]
    );

    return { success: false, error: error.message };
  }
};

/**
 * Send notification to multiple recipients (batch)
 * @param {string} eventCode - Notification event code
 * @param {Array} recipients - Array of {id, type, email, name}
 * @param {Object} dataFactory - Function to generate data for each recipient: (recipient) => data
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Array>} - Array of send results
 */
const sendBatchEmails = async (eventCode, recipients, dataFactory, metadata = {}) => {
  const results = [];
  
  for (const recipient of recipients) {
    const data = typeof dataFactory === 'function' ? dataFactory(recipient) : dataFactory;
    const result = await sendEmail(eventCode, recipient, data, metadata);
    results.push({ recipient, result });
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
};

/**
 * Get all students in a section with notification preferences
 * @param {string} section - Section name
 * @param {string} eventCode - Event code to check preferences
 * @returns {Promise<Array>} - Array of students
 */
const getStudentsInSection = async (section, eventCode = null) => {
  // Section format can be "SS1 A" or need to match "class_dept || ' ' || section"
  let query = `
    SELECT s.id, s.name, s.email, s.reg_no, s.section, s.class_dept,
           ${eventCode ? 'np.email_enabled' : 'true as email_enabled'}
    FROM students s
  `;
  
  if (eventCode) {
    query += `
      LEFT JOIN notification_preferences np 
        ON s.id = np.user_id 
        AND np.user_type = 'student' 
        AND np.event_code = $2
      WHERE LOWER(s.class_dept || ' ' || s.section) = LOWER($1)
        AND (np.email_enabled IS NULL OR np.email_enabled = true)
    `;
  } else {
    query += ` WHERE LOWER(s.class_dept || ' ' || s.section) = LOWER($1)`;
  }

  const params = eventCode ? [section, eventCode] : [section];
  const result = await dbPool.query(query, params);
  
  return result.rows.map(row => ({
    id: row.id,
    type: 'student',
    email: row.email,
    name: row.name,
    reg_no: row.reg_no,
    section: row.section
  }));
};

/**
 * Get teacher by module ID
 * @param {number} moduleId - Module ID
 * @returns {Promise<Object>} - Teacher object
 */
const getTeacherByModuleId = async (moduleId) => {
  try {
    const result = await dbPool.query(
      'SELECT id, name, email FROM teachers WHERE id = (SELECT teacher_id FROM modules WHERE id = $1)',
      [moduleId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Database error getting teacher by module ID:', err);
    return null;
  }
};

/**
 * Get teacher by ID
 * @param {number} teacherId - Teacher ID
 * @returns {Promise<Object>} - Teacher object
 */
const getTeacherById = async (teacherId) => {
  const result = await dbPool.query(
    'SELECT id, name, email, staff_id FROM teachers WHERE id = $1',
    [teacherId]
  );
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    id: row.id,
    type: 'teacher',
    email: row.email,
    name: row.name,
    staff_id: row.staff_id
  };
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  initializeNotificationService,
  sendEmail,
  sendBatchEmails,
  getStudentsInSection,
  getTeacherById,
  emailTemplates
};
