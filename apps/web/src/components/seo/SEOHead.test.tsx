import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SEOHead } from './SEOHead';

// SEOHead manipulates document.head directly via useEffect.
// jsdom provides a real document, so we can assert on head elements.

beforeEach(() => {
  // Clean up any head elements left by previous tests
  document.title = '';
  document.querySelectorAll('meta[name], meta[property], link[rel="canonical"]').forEach((el) =>
    el.remove()
  );
});

describe('SEOHead — title', () => {
  it('sets document.title with the BrewForm suffix', () => {
    render(<SEOHead title='My Espresso' />);
    expect(document.title).toBe('My Espresso | BrewForm');
  });

  it('uses the default title when no title is provided', () => {
    render(<SEOHead />);
    expect(document.title).toBe('BrewForm — Coffee Brewing Recipes');
  });
});

describe('SEOHead — canonical link', () => {
  it('inserts a <link rel="canonical"> when canonical prop is provided', () => {
    render(<SEOHead title='Test' canonical='https://brewform.app/recipes/my-espresso' />);

    const link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://brewform.app/recipes/my-espresso');
  });

  it('updates the canonical href when the prop changes', () => {
    const { rerender } = render(
      <SEOHead title='Test' canonical='https://brewform.app/recipes/old-slug' />,
    );

    rerender(<SEOHead title='Test' canonical='https://brewform.app/recipes/new-slug' />);

    const link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    expect(link?.getAttribute('href')).toBe('https://brewform.app/recipes/new-slug');
  });

  it('removes the canonical link when canonical prop is removed', () => {
    const { rerender } = render(
      <SEOHead title='Test' canonical='https://brewform.app/recipes/my-espresso' />,
    );

    rerender(<SEOHead title='Test' />);

    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('does not insert a canonical link when canonical prop is absent', () => {
    render(<SEOHead title='Test' />);
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('only ever has one canonical link element in the document', () => {
    const { rerender } = render(
      <SEOHead title='Test' canonical='https://brewform.app/recipes/a' />,
    );
    rerender(<SEOHead title='Test' canonical='https://brewform.app/recipes/b' />);

    const links = document.querySelectorAll('link[rel="canonical"]');
    expect(links.length).toBe(1);
  });
});

describe('SEOHead — noindex robots meta', () => {
  it('inserts <meta name="robots" content="noindex, nofollow"> when noIndex is true', () => {
    render(<SEOHead title='Focus Mode' noIndex />);

    const meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('removes the robots meta when noIndex is false', () => {
    const { rerender } = render(<SEOHead title='Test' noIndex />);

    rerender(<SEOHead title='Test' noIndex={false} />);

    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('removes the robots meta when noIndex prop is absent', () => {
    const { rerender } = render(<SEOHead title='Test' noIndex />);

    rerender(<SEOHead title='Test' />);

    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('does not insert a robots meta when noIndex is not set', () => {
    render(<SEOHead title='Test' />);
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});

describe('SEOHead — combined canonical + noindex (focus mode pattern)', () => {
  it('sets both noindex and canonical simultaneously', () => {
    render(
      <SEOHead
        title='My Espresso — Focus Mode'
        noIndex
        canonical='https://brewform.app/recipes/my-espresso'
      />,
    );

    const robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

    expect(robots?.getAttribute('content')).toBe('noindex, nofollow');
    expect(canonical?.getAttribute('href')).toBe('https://brewform.app/recipes/my-espresso');
  });
});

describe('SEOHead — canonical on recipe detail page pattern', () => {
  it('sets canonical without noindex for the recipe detail page', () => {
    render(
      <SEOHead
        title='My Espresso'
        canonical='https://brewform.app/recipes/my-espresso'
      />,
    );

    const robots = document.querySelector('meta[name="robots"]');
    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

    // No robots meta — page should be indexed
    expect(robots).toBeNull();
    // Canonical points to the recipe detail URL
    expect(canonical?.getAttribute('href')).toBe('https://brewform.app/recipes/my-espresso');
  });
});
