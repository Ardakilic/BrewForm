import type { Context, Next } from 'hono';
import { getRecipeMeta } from '../modules/recipe/service.ts';
import { escapeHtml, escapeHtmlAttr } from '@brewform/shared/utils';
import { config } from '../config/index.ts';
import { createLogger } from '../utils/logger/index.ts';

const log = createLogger('crawler');

const CRAWLER_UA =
  /Twitterbot|facebookexternalhit|WhatsApp|Discordbot|Slackbot|LinkedInBot|Googlebot|bingbot|Pinterestbot|TelegramBot/i;

const RECIPE_PATH_RE = /^\/recipes\/([a-z0-9][\w-]*)$/i;

/** Dependency-injection proxy for test stubbing (recipe meta lookup). */
export const deps = { getRecipeMeta };

/**
 * Serve a pre-rendered HTML page with Open Graph/Twitter meta tags when a known
 * social/search crawler requests a public recipe URL. Falls through to `next()`
 * for non-crawler UAs, non-recipe paths, non-public recipes, or on lookup errors.
 * Responses are cacheable for 5 minutes with `Vary: User-Agent`.
 */
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

    const baseUrl = (config.PUBLIC_APP_URL || config.APP_URL).replace(/\/+$/, '');
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

    c.header('Cache-Control', 'public, max-age=300');
    c.header('Vary', 'User-Agent');
    return c.html(html);
  } catch (err) {
    log.warn({ slug, err }, 'Crawler rendering failed');
    return next();
  }
}
