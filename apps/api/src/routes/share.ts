import { Hono } from 'hono';
import { getRecipeMeta } from '../modules/recipe/service.ts';
import type { AppEnv } from '../types/hono.ts';

const share = new Hono<AppEnv>();

const OG_TEMPLATE = (meta: {
  title: string;
  description: string;
  image: string | null;
  url: string;
  siteName: string;
}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  <meta property="og:title" content="${escapeHtml(meta.title)}">
  <meta property="og:description" content="${escapeHtml(meta.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(meta.url)}">
  <meta property="og:site_name" content="${escapeHtml(meta.siteName)}">
  ${meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(meta.title)}">
  <meta name="twitter:description" content="${escapeHtml(meta.description)}">
  ${meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}">` : ''}
  <script>
    window.location.replace('/recipes/' + ${JSON.stringify(meta.url.split('/').pop())});
  </script>
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(meta.url)}">${escapeHtml(meta.title)}</a>...</p>
</body>
</html>`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

share.get('/:slug', async (c) => {
  const slug = c.req.param('slug')!;
  try {
    const meta = await getRecipeMeta(slug);
    if (meta.visibility !== 'public') {
      return c.html('<!DOCTYPE html><html><head><title>Not Found</title></head><body><h1>404 — Recipe not found</h1></body></html>', 404);
    }

    const baseUrl = Deno.env.get('APP_URL') || `http://localhost:${Deno.env.get('APP_PORT') || 8000}`;
    const description = meta.productName
      ? `${meta.brewMethod || 'Coffee'} recipe using ${meta.productName}`
      : `${meta.brewMethod || 'Coffee'} recipe by ${meta.author?.displayName || meta.author?.username || 'BrewForm user'}`;

    const html = OG_TEMPLATE({
      title: meta.title,
      description,
      image: meta.photoUrl,
      url: `${baseUrl}/share/${slug}`,
      siteName: 'BrewForm',
    });

    return c.html(html);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') {
      return c.html('<!DOCTYPE html><html><head><title>Not Found</title></head><body><h1>404 — Recipe not found</h1></body></html>', 404);
    }
    throw err;
  }
});

export default share;
