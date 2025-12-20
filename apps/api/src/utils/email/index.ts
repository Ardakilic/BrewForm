/**
 * BrewForm Email Service
 * Uses Nodemailer with MJML templates
 */

import nodemailer, { type Transporter } from 'nodemailer';
import mjml2html from 'mjml';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../logger/index.js';

// Singleton transporter
let transporterInstance: Transporter | null = null;

/**
 * Get the email transporter instance (singleton pattern)
 */
function getTransporter(): Transporter {
  if (!transporterInstance) {
    const config = getConfig();
    
    transporterInstance = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser && config.smtpPass
        ? {
            user: config.smtpUser,
            pass: config.smtpPass,
          }
        : undefined,
    });

    getLogger().info({ type: 'email', message: 'Email transporter initialized' });
  }

  return transporterInstance;
}

/**
 * Base MJML template wrapper
 */
function wrapInTemplate(content: string, title: string): string {
  return `
    <mjml>
      <mj-head>
        <mj-title>${title}</mj-title>
        <mj-preview>${title}</mj-preview>
        <mj-attributes>
          <mj-all font-family="'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" />
          <mj-text font-size="14px" line-height="1.6" color="#333333" />
          <mj-button background-color="#6F4E37" color="#ffffff" border-radius="4px" />
        </mj-attributes>
        <mj-style>
          .coffee-header { background-color: #6F4E37; }
          .footer-text { font-size: 12px; color: #666666; }
        </mj-style>
      </mj-head>
      <mj-body background-color="#f4f4f4">
        <mj-section css-class="coffee-header" padding="20px">
          <mj-column>
            <mj-text font-size="28px" color="#ffffff" align="center" font-weight="bold">
              ☕ BrewForm
            </mj-text>
          </mj-column>
        </mj-section>
        ${content}
        <mj-section padding="20px">
          <mj-column>
            <mj-text css-class="footer-text" align="center">
              © ${new Date().getFullYear()} BrewForm. All rights reserved.
            </mj-text>
            <mj-text css-class="footer-text" align="center">
              This email was sent because you're a BrewForm user.
            </mj-text>
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `;
}

/**
 * Compile MJML to HTML
 */
function compileMjml(mjmlContent: string): string {
  const result = mjml2html(mjmlContent, {
    validationLevel: 'soft',
    minify: true,
  });

  if (result.errors.length > 0) {
    getLogger().warn({
      type: 'email',
      operation: 'compile',
      errors: result.errors,
    });
  }

  return result.html;
}

/**
 * Email templates
 */
export const EmailTemplates = {
  /**
   * Email verification template
   */
  verification: (username: string, verifyUrl: string): string => {
    const content = `
      <mj-section background-color="#ffffff" padding="40px 20px">
        <mj-column>
          <mj-text font-size="24px" font-weight="bold" align="center">
            Verify Your Email
          </mj-text>
          <mj-text align="center">
            Hi ${username},
          </mj-text>
          <mj-text align="center">
            Welcome to BrewForm! Please verify your email address to get started 
            with tracking your coffee brewing adventures.
          </mj-text>
          <mj-button href="${verifyUrl}">
            Verify Email Address
          </mj-button>
          <mj-text align="center" font-size="12px" color="#666666">
            This link will expire in 24 hours.
          </mj-text>
          <mj-text align="center" font-size="12px" color="#666666">
            If you didn't create a BrewForm account, please ignore this email.
          </mj-text>
        </mj-column>
      </mj-section>
    `;
    return compileMjml(wrapInTemplate(content, 'Verify Your Email - BrewForm'));
  },

  /**
   * Password reset template
   */
  passwordReset: (username: string, resetUrl: string): string => {
    const content = `
      <mj-section background-color="#ffffff" padding="40px 20px">
        <mj-column>
          <mj-text font-size="24px" font-weight="bold" align="center">
            Reset Your Password
          </mj-text>
          <mj-text align="center">
            Hi ${username},
          </mj-text>
          <mj-text align="center">
            We received a request to reset your BrewForm password. 
            Click the button below to create a new password.
          </mj-text>
          <mj-button href="${resetUrl}">
            Reset Password
          </mj-button>
          <mj-text align="center" font-size="12px" color="#666666">
            This link will expire in 1 hour.
          </mj-text>
          <mj-text align="center" font-size="12px" color="#666666">
            If you didn't request a password reset, please ignore this email 
            or contact support if you have concerns.
          </mj-text>
        </mj-column>
      </mj-section>
    `;
    return compileMjml(wrapInTemplate(content, 'Reset Your Password - BrewForm'));
  },

  /**
   * Welcome email template
   */
  welcome: (username: string): string => {
    const content = `
      <mj-section background-color="#ffffff" padding="40px 20px">
        <mj-column>
          <mj-text font-size="24px" font-weight="bold" align="center">
            Welcome to BrewForm! ☕
          </mj-text>
          <mj-text align="center">
            Hi ${username},
          </mj-text>
          <mj-text align="center">
            Your email has been verified and you're all set to start your 
            coffee brewing journey with BrewForm!
          </mj-text>
          <mj-text align="center">
            Here's what you can do:
          </mj-text>
          <mj-text>
            • <strong>Create Recipes</strong> - Document your brewing process<br/>
            • <strong>Track Equipment</strong> - Manage your coffee gear<br/>
            • <strong>Share & Discover</strong> - Learn from the community<br/>
            • <strong>Compare Brews</strong> - Find your perfect cup
          </mj-text>
          <mj-button href="${getConfig().appUrl}/dashboard">
            Start Brewing
          </mj-button>
        </mj-column>
      </mj-section>
    `;
    return compileMjml(wrapInTemplate(content, 'Welcome to BrewForm!'));
  },

  /**
   * Password changed notification
   */
  passwordChanged: (username: string): string => {
    const content = `
      <mj-section background-color="#ffffff" padding="40px 20px">
        <mj-column>
          <mj-text font-size="24px" font-weight="bold" align="center">
            Password Changed
          </mj-text>
          <mj-text align="center">
            Hi ${username},
          </mj-text>
          <mj-text align="center">
            Your BrewForm password was successfully changed.
          </mj-text>
          <mj-text align="center" font-size="12px" color="#666666">
            If you didn't make this change, please contact support immediately 
            and reset your password.
          </mj-text>
        </mj-column>
      </mj-section>
    `;
    return compileMjml(wrapInTemplate(content, 'Password Changed - BrewForm'));
  },
};

/**
 * Send an email
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const config = getConfig();
  const logger = getLogger();
  const transporter = getTransporter();

  try {
    const result = await transporter.sendMail({
      from: `"${config.smtpFromName}" <${config.smtpFromEmail}>`,
      to,
      subject,
      html,
    });

    logger.info({
      type: 'email',
      operation: 'send',
      to,
      subject,
      messageId: result.messageId,
    });

    return true;
  } catch (error) {
    logger.error({
      type: 'email',
      operation: 'send',
      to,
      subject,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return false;
  }
}

/**
 * Send verification email
 */
export async function sendVerificationEmail(
  to: string,
  username: string,
  token: string
): Promise<boolean> {
  const config = getConfig();
  const verifyUrl = `${config.appUrl}/verify-email?token=${token}`;
  const html = EmailTemplates.verification(username, verifyUrl);
  
  return sendEmail(to, 'Verify Your Email - BrewForm', html);
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  username: string,
  token: string
): Promise<boolean> {
  const config = getConfig();
  const resetUrl = `${config.appUrl}/reset-password?token=${token}`;
  const html = EmailTemplates.passwordReset(username, resetUrl);
  
  return sendEmail(to, 'Reset Your Password - BrewForm', html);
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(
  to: string,
  username: string
): Promise<boolean> {
  const html = EmailTemplates.welcome(username);
  return sendEmail(to, 'Welcome to BrewForm! ☕', html);
}

/**
 * Send password changed notification
 */
export async function sendPasswordChangedEmail(
  to: string,
  username: string
): Promise<boolean> {
  const html = EmailTemplates.passwordChanged(username);
  return sendEmail(to, 'Password Changed - BrewForm', html);
}

export const email = {
  send: sendEmail,
  sendVerification: sendVerificationEmail,
  sendPasswordReset: sendPasswordResetEmail,
  sendWelcome: sendWelcomeEmail,
  sendPasswordChanged: sendPasswordChangedEmail,
  templates: EmailTemplates,
};

export default email;
