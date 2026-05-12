import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// ── No QR code image (removed per refactor) ────────────────────────────────

describe('ShareSection — no QR code image', () => {
  it('does NOT show a QR code image', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(screen.queryByRole('img', { name: /QR code for recipe/i })).toBeNull();
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

  it('shows Reddit share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(
      screen.getByRole('button', { name: 'Share on Reddit' }),
    ).toBeInTheDocument();
  });
});

describe('ShareSection — copy behavior (task 9.2)', () => {
  beforeEach(() => {
    // Mock navigator.clipboard
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
  });

  it('copy button shows "Copied!" for 3 seconds after successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    const copyButton = screen.getByRole('button', { name: /copy recipe url/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy recipe url/i })).toHaveTextContent('recipe.share.copied');
    });
  });

  it('copy button shows error state for 3 seconds on clipboard failure', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    const copyButton = screen.getByRole('button', { name: /copy recipe url/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy recipe url/i })).toHaveTextContent('recipe.share.copyError');
    });
  });
});
