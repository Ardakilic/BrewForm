import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShareSection } from './ShareSection.tsx';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
  I18nProvider: ({ children }: { children: unknown }) => children,
}));

import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);

const defaultTranslation = {
  t: (key: string) => key,
  locale: 'en',
  setLocale: vi.fn(),
  availableLocales: ['en'],
};

// ── Setup ──────────────────────────────────────────────────────────────────

// ShareSection uses window.location.origin — provide a stable value
Object.defineProperty(globalThis, 'location', {
  value: { origin: 'https://brewform.app' },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation as ReturnType<typeof useTranslation>);
});

// ── Visibility gating tests ────────────────────────────────────────────────

describe('ShareSection — visibility gating', () => {
  it('renders null when visibility is "private"', () => {
    const { container } = render(
      <ShareSection slug="my-espresso" title="My Espresso" visibility="private" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders null when visibility is "draft"', () => {
    const { container } = render(
      <ShareSection slug="my-espresso" title="My Espresso" visibility="draft" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when visibility is "public"', () => {
    const { container } = render(
      <ShareSection slug="my-espresso" title="My Espresso" visibility="public" />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('renders when visibility is "unlisted"', () => {
    const { container } = render(
      <ShareSection slug="my-espresso" title="My Espresso" visibility="unlisted" />,
    );
    expect(container.firstChild).not.toBeNull();
  });
});

// ── QR code image ──────────────────────────────────────────────────────────

describe('ShareSection — QR code image', () => {
  it('shows QR code image with src containing slug.svg', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    const img = screen.getByRole('img', { name: /QR code for recipe/i });
    expect(img).toBeInTheDocument();
    expect((img as HTMLImageElement).src).toContain('my-espresso.svg');
  });

  it('does NOT show a select element (no SVG format option)', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(document.querySelector('select')).toBeNull();
  });

  it('does NOT show an SVG format option', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    // No option element with SVG text
    const options = document.querySelectorAll('option');
    const svgOption = Array.from(options).find((o) =>
      o.textContent?.toLowerCase().includes('svg'),
    );
    expect(svgOption).toBeUndefined();
  });
});

// ── Action buttons ─────────────────────────────────────────────────────────

describe('ShareSection — action buttons', () => {
  it('shows Copy URL button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(
      screen.getByRole('button', { name: /copy recipe url/i }),
    ).toBeInTheDocument();
  });

  it('shows Download QR button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(
      screen.getByRole('button', { name: /download qr/i }),
    ).toBeInTheDocument();
  });
});

// ── Social share buttons ───────────────────────────────────────────────────

describe('ShareSection — social share buttons', () => {
  it('shows Twitter/X share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(
      screen.getByRole('button', { name: 'Share on Twitter/X' }),
    ).toBeInTheDocument();
  });

  it('shows Facebook share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(
      screen.getByRole('button', { name: 'Share on Facebook' }),
    ).toBeInTheDocument();
  });

  it('shows WhatsApp share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(
      screen.getByRole('button', { name: 'Share on WhatsApp' }),
    ).toBeInTheDocument();
  });
});
