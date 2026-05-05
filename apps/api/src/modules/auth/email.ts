import { config } from '../../config/index.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { template as welcomeTemplate } from '../../templates/email/generated/welcome.ts';
import { template as resetPasswordTemplate } from '../../templates/email/generated/reset-password.ts';
import nodemailer from 'npm:nodemailer';

const logger = createLogger('email');

function createTransporter() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let html = template;
  for (const [key, value] of Object.entries(vars)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return html;
}

async function sendEmail(to: string, subject: string, html: string) {
  logger.info({ to, subject }, 'Sending email');

  if (config.APP_ENV === 'test') {
    logger.info({ to, subject }, 'Email skipped (test environment)');
    return;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, 'Email sent successfully');
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
    throw err;
  }
}

export async function sendWelcomeEmail(to: string, username: string) {
  const html = renderTemplate(welcomeTemplate, {
    username,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Welcome to BrewForm!', html);
}

export async function sendPasswordResetEmail(to: string, token: string, username: string) {
  const baseUrl = config.APP_ENV === 'production' ? 'https://brewform.cc' : 'http://localhost:5173';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const html = renderTemplate(resetPasswordTemplate, {
    username,
    reset_url: resetUrl,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Reset your BrewForm password', html);
}
