import { config } from '../../config/index.ts';
import { createLogger } from '../../utils/logger/index.ts';
import mjml2html from 'mjml';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import nodemailer from 'npm:nodemailer@^7.0.0';

const logger = createLogger('email');

function getTemplateDir(): string {
  const thisFile = new URL(import.meta.url).pathname;
  return join(dirname(thisFile), '..', '..', 'templates', 'email');
}

function loadTemplate(templateName: string): string {
  const templatePath = join(getTemplateDir(), `${templateName}.mjml`);
  return readFileSync(templatePath, 'utf-8');
}

function createTransporter() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
  });
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
  const template = loadTemplate('welcome');
  const html = mjml2html(
    template
      .replace(/\{\{username\}\}/g, username)
      .replace(/\{\{app_name\}\}/g, 'BrewForm'),
    { minify: true },
  ).html;

  await sendEmail(to, 'Welcome to BrewForm!', html);
}

export async function sendPasswordResetEmail(to: string, token: string, username: string) {
  const baseUrl = config.APP_ENV === 'production'
    ? 'https://brewform.github.io'
    : 'http://localhost:5173';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const template = loadTemplate('reset-password');
  const html = mjml2html(
    template
      .replace(/\{\{username\}\}/g, username)
      .replace(/\{\{reset_url\}\}/g, resetUrl)
      .replace(/\{\{app_name\}\}/g, 'BrewForm'),
    { minify: true },
  ).html;

  await sendEmail(to, 'Reset your BrewForm password', html);
}