import type { Context, Next } from 'hono';
import { getRecipeMeta } from '../modules/recipe/service.ts';
import { escapeHtml, escapeHtmlAttr } from '@brewform/shared/utils';
import { config } from '../config/index.ts';

const CRAWLER_UA =
  /Twitterbot|facebookexternalhit|WhatsApp|Discordbot|Slackbot|LinkedInBot|Googlebot|bingbot|Pinterestbot|TelegramBot/i;

const RECIPE_PATH_RE = /^\/recipes\/([a-z0-9][\w-]*)$/i;

export const deps = { getRecipeMeta };

export async function crawlerMiddleware(c: Context, next: Next) {
  const ua = c.req.header('user-agent') ?? '';
  if (!CRAWLER_UA.test(ua)) return next();

  const url = new URL(c.req.url);
  const recipeMatch = url.pathname.match(RECIPE_PATH_RE);

  if (!recipeMatch) return next();

  const slug = recipeMatch[1];

  try {
    const meta = await deps.getRecipeMeta(slug);
    if (!meta || meta.visibility !== 'public') return next();

    const baseUrl = config.PUBLIC_APP_URL || config.APP_URL;
    const canonicalUrl = `${baseUrl}/recipes/${encodeURIComponent(meta.slug)}`;

    const description = meta.productName
      ? `${meta.brewMethod || 'Coffee'} recipe using ${meta.productName}`
      : `${meta.brewMethod || 'Coffee'} recipe by ${
        meta.author?.displayName || meta.author?.username || 'BrewForm user'
      }`;

    const imageTag = meta.photoUrl
      ? `
  <meta property="og:image" content="${escapeHtmlAttr(meta.photoUrl)}">
  <meta name="twitter:image" content="${escapeHtmlAttr(meta.photoUrl)}">`
      : `
  <meta property="og:image" content="${escapeHtmlAttr(baseUrl)}/og-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:image" content="${escapeHtmlAttr(baseUrl)}/og-default.png">`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(meta.title)} | BrewForm</title>
  <meta name="description" content="${escapeHtmlAttr(description)}">
  <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}">
  <meta property="og:title" content="${escapeHtmlAttr(meta.title)}">
  <meta property="og:description" content="${escapeHtmlAttr(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}">
  <meta property="og:site_name" content="BrewForm">${imageTag}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}">
  <meta name="twitter:description" content="${escapeHtmlAttr(description)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeHtmlAttr(canonicalUrl)}">${escapeHtml(meta.title)}</a>...</p>
</body>
</html>`;

    return c.html(html);
  } catch {
    return next();
  }
}
