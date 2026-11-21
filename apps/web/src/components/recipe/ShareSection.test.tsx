import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
  I18nProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('../../api/index.ts', () => ({
  qrcodeApi: { recipeSvg: vi.fn() },
}));

import { qrcodeApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { recipeQrLoader, shouldRevalidateRecipeQr } from '../../routes/resources/qrcode.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { ShareSection } from './ShareSection.tsx';

const mockRecipeSvg = vi.mocked(qrcodeApi.recipeSvg);

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'a11y.share.section': 'Share recipe',
    'a11y.share.copyUrl': 'Copy recipe URL to clipboard',
    'a11y.share.downloadQr': 'Download QR code as SVG',
    'a11y.share.on': 'Share on {platform}',
    'qrcode.downloadFailed': 'Failed to download QR code.',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  t: enT,
  locale: 'en',
  setLocale: vi.fn(),
  availableLocales: ['en'],
};

// ── Setup ──────────────────────────────────────────────────────────────────

/** Share section props for the fixture recipe. */
type Props = Parameters<typeof ShareSection>[0];

/**
 * Renders the share section inside the app providers, next to the real
 * `resources/qrcode/recipe/:slug` resource route its QR download fetcher loads.
 */
function render(ui: React.ReactElement<Props>) {
  return renderWithAppProviders([
    { path: '/', element: ui },
    {
      path: '/resources/qrcode/recipe/:slug',
      loader: recipeQrLoader,
      shouldRevalidate: shouldRevalidateRecipeQr,
    },
  ]);
}

/** The share card, or null when it is hidden. */
const shareCard = () => screen.queryByRole('region', { name: 'Share recipe' });

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation as ReturnType<typeof useTranslation>);
});

// ── Visibility gating tests ────────────────────────────────────────────────

describe('ShareSection — visibility gating', () => {
  it('renders null when visibility is "private"', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="private" />);
    expect(shareCard()).toBeNull();
  });

  it('renders null when visibility is "draft"', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="draft" />);
    expect(shareCard()).toBeNull();
  });

  it('renders when visibility is "public"', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);
    expect(shareCard()).not.toBeNull();
  });

  it('renders when visibility is "unlisted"', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="unlisted" />);
    expect(shareCard()).not.toBeNull();
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

    expect(screen.getByRole('button', { name: /copy recipe url/i })).toBeInTheDocument();
  });

  it('shows Download QR button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(screen.getByRole('button', { name: /download qr/i })).toBeInTheDocument();
  });
});

// ── Social share buttons ───────────────────────────────────────────────────

describe('ShareSection — social share buttons', () => {
  it('shows Twitter/X share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(screen.getByRole('button', { name: 'Share on Twitter/X' })).toBeInTheDocument();
  });

  it('shows Facebook share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(screen.getByRole('button', { name: 'Share on Facebook' })).toBeInTheDocument();
  });

  it('shows WhatsApp share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(screen.getByRole('button', { name: 'Share on WhatsApp' })).toBeInTheDocument();
  });

  it('shows Reddit share button', () => {
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    expect(screen.getByRole('button', { name: 'Share on Reddit' })).toBeInTheDocument();
  });
});

/** Replaces `navigator.clipboard` with a stub exposing `writeText`. */
function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('ShareSection — copy behavior (task 9.2)', () => {
  it('copy button shows "Copied!" for 3 seconds after successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    const copyButton = screen.getByRole('button', { name: /copy recipe url/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy recipe url/i })).toHaveTextContent(
        'recipe.share.copied',
      );
    });
  });

  it('copy button shows error state for 3 seconds on clipboard failure', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard denied'));
    stubClipboard(writeText);

    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    const copyButton = screen.getByRole('button', { name: /copy recipe url/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy recipe url/i })).toHaveTextContent(
        'recipe.share.copyError',
      );
    });
  });
});

describe('ShareSection — QR download', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:qr'),
      configurable: true,
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('downloads the SVG through the QR resource route', async () => {
    mockRecipeSvg.mockResolvedValue('<svg/>');
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    await userEvent.click(screen.getByRole('button', { name: /download qr/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(mockRecipeSvg).toHaveBeenCalledWith('my-espresso', { signal: expect.any(AbortSignal) });
  });

  it('shows an error toast instead of failing silently', async () => {
    mockRecipeSvg.mockRejectedValue(new Error('down'));
    render(<ShareSection slug="my-espresso" title="My Espresso" visibility="public" />);

    await userEvent.click(screen.getByRole('button', { name: /download qr/i }));

    expect(await screen.findByText('Failed to download QR code.')).toBeInTheDocument();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
