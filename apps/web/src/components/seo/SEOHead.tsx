import { useEffect } from 'react';

interface Props {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  /** When true, adds <meta name="robots" content="noindex, nofollow"> */
  noIndex?: boolean;
  /**
   * When provided, inserts/updates a <link rel="canonical" href="..."> element.
   * Pass the full absolute URL of the preferred indexable version of this page.
   */
  canonical?: string;
}

/**
 * Renders nothing; imperatively syncs document title, description,
 * Open Graph / Twitter meta tags, robots noindex, and the canonical
 * link with the given props.
 */
export function SEOHead(
  { title, description, image, url, type = 'website', noIndex, canonical }: Props,
) {
  useEffect(() => {
    document.title = title ? `${title} | BrewForm` : 'BrewForm — Coffee Brewing Recipes';
    setMeta(
      'description',
      description || 'Digitalize, share, and discover coffee brewing recipes and tasting notes.',
    );
    setMeta('og:title', title || 'BrewForm');
    setMeta(
      'og:description',
      description || 'Digitalize, share, and discover coffee brewing recipes and tasting notes.',
    );
    setMeta('og:image', image || '/og-default.png');
    setMeta('og:url', url || globalThis.location.href);
    setMeta('og:type', type);
    setMeta('twitter:card', 'summary_large_image');

    // robots meta — set or remove depending on noIndex flag
    if (noIndex) {
      setMeta('robots', 'noindex, nofollow');
    } else {
      removeMeta('robots');
    }

    // canonical link element
    if (canonical) {
      setCanonical(canonical);
    } else {
      removeCanonical();
    }
  }, [title, description, image, url, type, noIndex, canonical]);

  return null;
}

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[property="${name}"]`) ||
    document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMeta(name: string) {
  const el = document.querySelector(`meta[name="${name}"]`);
  if (el) el.remove();
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function removeCanonical() {
  const el = document.querySelector('link[rel="canonical"]');
  if (el) el.remove();
}
