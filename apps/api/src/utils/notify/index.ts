/**
 * Social-event email notifications (plan §3.5, §3.16, gap H2).
 *
 * Each helper:
 *   1. Loads the recipient + their UserPreferences.
 *   2. Returns silently if the relevant `*Notification*` flag is false.
 *   3. Renders the pre-compiled email template and sends via the auth email
 *      transport (skipped automatically in `APP_ENV=test`).
 *
 * Helpers are designed to be **fire-and-forget** from the calling service:
 * email failures must never block the social action that triggered them.
 * Use `notifyXxx(...).catch(...)` at the call site.
 */
// deno-lint-ignore-file no-explicit-any
import { prisma } from '@brewform/db';
import nodemailer from 'npm:nodemailer@^7.0.0';
import { config } from '../../config/index.ts';
import { createLogger } from '../logger/index.ts';
import { escapeHtml } from '@brewform/shared/utils';
import { template as newFollowerTemplate } from '../../templates/email/generated/new-follower.ts';
import { template as recipeLikedTemplate } from '../../templates/email/generated/recipe-liked.ts';
import { template as recipeCommentedTemplate } from '../../templates/email/generated/recipe-commented.ts';
import { template as followedUserPostedTemplate } from '../../templates/email/generated/followed-user-posted.ts';

const logger = createLogger('notify');

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value !== undefined ? escapeHtml(value) : _match;
  });
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export function closeTransporter(): void {
  if (transporter) {
    transporter.close();
    transporter = null;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (config.APP_ENV === 'test') {
    logger.info({ to, subject }, 'Notification skipped (test environment)');
    return;
  }
  try {
    await getTransporter().sendMail({ from: config.EMAIL_FROM, to, subject, html });
    logger.info({ to, subject }, 'Notification email sent');
  } catch (err) {
    logger.error({ err, to, subject }, 'Notification email failed');
  }
}

export function appBaseUrl(): string {
  return config.PUBLIC_APP_URL ||
    (config.APP_ENV === 'production' ? 'https://brewform.cc' : 'http://localhost:5173');
}

async function loadRecipient(userId: string): Promise<
  { email: string; username: string; prefs: any } | null
> {
  const user: any = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { preferences: true },
  } as any);
  if (!user || !user.email) return null;
  return { email: user.email, username: user.username, prefs: user.preferences ?? {} };
}

export async function notifyNewFollower(params: {
  followingId: string;
  followerUsername: string;
}): Promise<void> {
  const recipient = await loadRecipient(params.followingId);
  if (!recipient) return;
  if (recipient.prefs.newFollower === false) return;

  const html = renderTemplate(newFollowerTemplate, {
    app_name: 'BrewForm',
    username: recipient.username,
    follower_username: params.followerUsername,
    follower_url: `${appBaseUrl()}/u/${params.followerUsername}`,
  });
  await sendEmail(recipient.email, 'You have a new follower on BrewForm', html);
}

export async function notifyRecipeLiked(params: {
  recipeAuthorId: string;
  likerUsername: string;
  recipeTitle: string;
  recipeSlug: string;
}): Promise<void> {
  const recipient = await loadRecipient(params.recipeAuthorId);
  if (!recipient) return;
  if (recipient.prefs.recipeLiked === false) return;

  const html = renderTemplate(recipeLikedTemplate, {
    app_name: 'BrewForm',
    username: recipient.username,
    liker_username: params.likerUsername,
    recipe_title: params.recipeTitle,
    recipe_url: `${appBaseUrl()}/recipes/${params.recipeSlug}`,
  });
  await sendEmail(recipient.email, `${params.likerUsername} liked your recipe`, html);
}

export async function notifyRecipeCommented(params: {
  recipeAuthorId: string;
  commenterUsername: string;
  recipeTitle: string;
  recipeSlug: string;
}): Promise<void> {
  const recipient = await loadRecipient(params.recipeAuthorId);
  if (!recipient) return;
  if (recipient.prefs.recipeCommented === false) return;

  const html = renderTemplate(recipeCommentedTemplate, {
    app_name: 'BrewForm',
    username: recipient.username,
    commenter_username: params.commenterUsername,
    recipe_title: params.recipeTitle,
    recipe_url: `${appBaseUrl()}/recipes/${params.recipeSlug}`,
  });
  await sendEmail(recipient.email, `New comment on ${params.recipeTitle}`, html);
}

export async function notifyFollowersOfNewRecipe(params: {
  authorId: string;
  authorUsername: string;
  recipeTitle: string;
  recipeSlug: string;
}): Promise<void> {
  const follows: any[] = await (prisma as any).userFollow.findMany({
    where: { followingId: params.authorId },
    select: { followerId: true },
  });
  if (follows.length === 0) return;

  const followerIds = follows.map((f: any) => f.followerId);
  const users: any[] = await (prisma as any).user.findMany({
    where: { id: { in: followerIds }, deletedAt: null },
    include: { preferences: true },
  });

  const recipients = users
    .filter((u: any) => u.email)
    .map((u: any) => ({
      email: u.email,
      username: u.username,
      prefs: u.preferences ?? {},
    }))
    .filter((r: any) => r.prefs.followedUserPosted !== false);

  if (recipients.length === 0) return;

  const subject = `${params.authorUsername} posted a new recipe on BrewForm`;
  const recipeUrl = `${appBaseUrl()}/recipes/${params.recipeSlug}`;

  const BATCH_SIZE = 5;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((recipient) => {
        const html = renderTemplate(followedUserPostedTemplate, {
          app_name: 'BrewForm',
          username: recipient.username,
          author_username: params.authorUsername,
          recipe_title: params.recipeTitle,
          recipe_url: recipeUrl,
        });
        return sendEmail(recipient.email, subject, html);
      }),
    );
  }
}
