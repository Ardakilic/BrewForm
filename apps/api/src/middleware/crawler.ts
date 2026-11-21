import { escapeHtml, escapeHtmlAttr } from '@brewform/shared/utils';
import type { Context, Next } from 'hono';
import { config } from '../config/index.ts';
import { getRecipeMeta } from '../modules/recipe/service.ts';
import { createLogger } from '../utils/logger/index.ts';
import { NOINDEX_NOFOLLOW, ROBOTS_TAG_HEADER } from '../utils/response/index.ts';

const log = createLogger('crawler');

const CRAWLER_UA =
  /Twitterbot|facebookexternalhit|WhatsApp|Discordbot|Slackbot|LinkedInBot|Googlebot|bingbot|Pinterestbot|TelegramBot/i;

const RECIPE_PATH_RE = /^\/recipes\/([a-z0-9][\w-]*)$/i;

/** Dependency-injection proxy for test stubbing (recipe meta lookup). */
export const deps = { getRecipeMeta };

/** Why a crawler request for a recipe path fell through without OG HTML. */
type FallThroughReason = 'missing' | 'non-public' | 'error';

/**
 * Run the next handler, then mark its response `X-Robots-Tag: noindex, nofollow`
 * (capability `recipe-visibility`). Missing, non-public and failed lookups get the
 * same header, so it is no existence oracle.
 *
 * @param c - The request context.
 * @param next - The next handler.
 * @param slug - The requested recipe slug (logged).
 * @param reason - Why the request falls through.
 */
async function fallThroughNoIndex(
  c: Context,
  next: Next,
  slug: string,
  reason: FallThroughReason,
): Promise<void> {
  log.debug({ slug, reason }, 'Crawler fall-through marked noindex');
  await next();
  c.res.headers.set(ROBOTS_TAG_HEADER, NOINDEX_NOFOLLOW);
}

/**
 * Serve a pre-rendered HTML page with Open Graph/Twitter meta tags when a known
 * social/search crawler requests a public recipe URL. Falls through to `next()`
 * for non-crawler UAs, non-recipe paths, non-public recipes, or on lookup errors.
 * A fall-through on a recipe path (missing, not public, or the lookup failed) is
 * marked `X-Robots-Tag: noindex, nofollow` after the next handler ran
 * (capability `recipe-visibility`). Responses are cacheable for 5 minutes with
 * `Vary: User-Agent`.
 */
export async function crawlerMiddleware(c: Context, next: Next) {
  const ua = c.req.header('user-agent') ?? '';
  if (!CRAWLER_UA.test(ua)) return next();

  const url = new URL(c.req.url);
  const recipeMatch = url.pathname.match(RECIPE_PATH_RE);

  if (!recipeMatch) return next();

  const slug = recipeMatch[1];

  let meta: Awaited<ReturnType<typeof deps.getRecipeMeta>> | null;
  try {
    meta = await deps.getRecipeMeta(slug);
  } catch (err) {
    const missing = err instanceof Error && err.message === 'RECIPE_NOT_FOUND';
    if (!missing) log.warn({ slug, err }, 'Crawler rendering failed');
    return fallThroughNoIndex(c, next, slug, missing ? 'missing' : 'error');
  }
  if (!meta) return fallThroughNoIndex(c, next, slug, 'missing');
  if (meta.visibility !== 'public') return fallThroughNoIndex(c, next, slug, 'non-public');

  try {
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

    c.header('Cache-Control', 'public, max-age=300');
    c.header('Vary', 'User-Agent');
    return c.html(html);
  } catch (err) {
    log.warn({ slug, err }, 'Crawler rendering failed');
    return next();
  }
}
