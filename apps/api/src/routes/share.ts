import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { escapeHtml, escapeHtmlAttr } from '@brewform/shared/utils';
import { getRecipeMeta } from '../modules/recipe/service.ts';
import { config } from '../config/index.ts';
import type { AppEnv } from '../types/hono.ts';

const share = new Hono<AppEnv>();

export const deps = { getRecipeMeta };

export const RECIPE_NOT_FOUND_HTML =
  '<!DOCTYPE html><html><head><title>Not Found</title></head><body><h1>404 — Recipe not found</h1></body></html>';

export const OG_TEMPLATE = (meta: {
  title: string;
  description: string;
  image: string | null;
  url: string;
  siteName: string;
  slug: string;
}) => {
  const safeSlug = JSON.stringify(meta.slug).replace(/<\//g, '<\\/');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  <meta property="og:title" content="${escapeHtml(meta.title)}">
  <meta property="og:description" content="${escapeHtml(meta.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtmlAttr(meta.url)}">
  <meta property="og:site_name" content="${escapeHtml(meta.siteName)}">
  ${meta.image ? `<meta property="og:image" content="${escapeHtmlAttr(meta.image)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(meta.title)}">
  <meta name="twitter:description" content="${escapeHtml(meta.description)}">
  ${meta.image ? `<meta name="twitter:image" content="${escapeHtmlAttr(meta.image)}">` : ''}
  <script>
    window.location.replace('/recipes/' + ${safeSlug});
  </script>
</head>
<body>
  <p>Redirecting to <a href="${escapeHtmlAttr(meta.url)}">${escapeHtml(meta.title)}</a>...</p>
</body>
</html>`;
};

share.get(
  '/:slug',
  describeRoute({
    tags: ['Share'],
    summary: 'Get a recipe share/OG preview page',
    description:
      'Returns a server-rendered HTML page with Open Graph/Twitter meta tags for a public recipe, ' +
      'redirecting browsers to the recipe page. Responds with HTML, not a JSON envelope.',
    parameters: [
      { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Share preview HTML page',
        content: { 'text/html': {} },
      },
      404: {
        description: 'Recipe not found or not public',
        content: { 'text/html': {} },
      },
    },
  }),
  async (c) => {
    const slug = c.req.param('slug')!;
    try {
      const meta = await deps.getRecipeMeta(slug);
      if (meta.visibility !== 'public') {
        return c.html(RECIPE_NOT_FOUND_HTML, 404);
      }

      const baseUrl = config.PUBLIC_APP_URL || config.APP_URL;
      const description = meta.productName
        ? `${meta.brewMethod || 'Coffee'} recipe using ${meta.productName}`
        : `${meta.brewMethod || 'Coffee'} recipe by ${
          meta.author?.displayName || meta.author?.username || 'BrewForm user'
        }`;

      const html = OG_TEMPLATE({
        title: meta.title,
        description,
        image: meta.photoUrl,
        url: `${baseUrl}/share/${slug}`,
        siteName: 'BrewForm',
        slug,
      });

      return c.html(html);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') {
        return c.html(RECIPE_NOT_FOUND_HTML, 404);
      }
      throw err;
    }
  },
);

export default share;
