import { useEffect } from 'react';

interface Props {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

export function SEOHead({ title, description, image, url, type = 'website' }: Props) {
  useEffect(() => {
    document.title = title ? `${title} | BrewForm` : 'BrewForm — Coffee Brewing Recipes';
    setMeta('description', description || 'Digitalize, share, and discover coffee brewing recipes and tasting notes.');
    setMeta('og:title', title || 'BrewForm');
    setMeta('og:description', description || 'Digitalize, share, and discover coffee brewing recipes and tasting notes.');
    setMeta('og:image', image || '/og-default.png');
    setMeta('og:url', url || globalThis.location.href);
    setMeta('og:type', type);
    setMeta('twitter:card', 'summary_large_image');
  }, [title, description, image, url, type]);

  return null;
}

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}