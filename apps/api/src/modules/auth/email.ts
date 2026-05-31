import { config } from '../../config/index.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { appBaseUrl, getTransporter } from '../../utils/notify/index.ts';
import { escapeHtml } from '@brewform/shared/utils';
import { template as welcomeTemplate } from '../../templates/email/generated/welcome.ts';
import { template as resetPasswordTemplate } from '../../templates/email/generated/reset-password.ts';
import { template as verifyEmailTemplate } from '../../templates/email/generated/verify-email.ts';

const logger = createLogger('auth-email');

/**
 * Substitute `{{key}}` placeholders with HTML-escaped values.
 *
 * Missing keys are left as-is (the placeholder is preserved). All values
 * are passed through {@link escapeHtml} to prevent XSS.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value !== undefined ? escapeHtml(value) : _match;
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  logger.info({ delivery: 'pending', subject }, 'Sending auth email');

  if (config.APP_ENV === 'test') {
    logger.info({ delivery: 'skipped', subject }, 'Auth email skipped (test environment)');
    return;
  }

  try {
    await getTransporter().sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info({ delivery: 'sent', subject }, 'Auth email sent successfully');
  } catch (err) {
    logger.error({ err, delivery: 'failed', subject }, 'Failed to send auth email');
    throw err;
  }
}

/**
 * Send a welcome email to a newly registered user.
 *
 * @param to - Recipient email address
 * @param username - Display name for personalizing the welcome message
 */
export async function sendWelcomeEmail(to: string, username: string) {
  const html = renderTemplate(welcomeTemplate, {
    username,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Welcome to BrewForm!', html);
}

/**
 * Send a password reset email with a single-use token link.
 *
 * The reset URL is built using {@link appBaseUrl} so it respects
 * `config.PUBLIC_APP_URL` when set.
 *
 * @param to - Recipient email address
 * @param token - Password reset token (embedded in the link)
 * @param username - Display name for personalizing the message
 */
export async function sendPasswordResetEmail(to: string, token: string, username: string) {
  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  const html = renderTemplate(resetPasswordTemplate, {
    username,
    reset_url: resetUrl,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Reset your BrewForm password', html);
}

/**
 * Send an email verification message with a single-use token link.
 *
 * The verification URL is built using {@link appBaseUrl} so it respects
 * `config.PUBLIC_APP_URL` when set.
 *
 * @param to - Recipient email address
 * @param token - Email verification token (embedded in the link)
 * @param username - Display name for personalizing the message
 */
export async function sendVerificationEmail(to: string, token: string, username: string) {
  const verifyUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  const html = renderTemplate(verifyEmailTemplate, {
    username,
    verify_url: verifyUrl,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Verify your BrewForm email', html);
}
