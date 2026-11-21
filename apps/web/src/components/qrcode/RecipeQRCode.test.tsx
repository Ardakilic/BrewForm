import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { qrcodeApi } from '../../api/index.ts';
import { recipeQrLoader, shouldRevalidateRecipeQr } from '../../routes/resources/qrcode.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { RecipeQRCode } from './RecipeQRCode.tsx';

/**
 * Renders the QR card inside the shared app providers (toast, confirm, router), next to the
 * real `resources/qrcode/recipe/:slug` resource route its download fetcher loads.
 */
function renderQR(ui: ReactElement) {
  return renderWithAppProviders([
    { path: '/', element: ui },
    {
      path: '/resources/qrcode/recipe/:slug',
      loader: recipeQrLoader,
      shouldRevalidate: shouldRevalidateRecipeQr,
    },
  ]);
}

vi.mock('../../api/index.ts', () => ({
  qrcodeApi: { recipeSvg: vi.fn() },
}));

const mockRecipeSvg = vi.mocked(qrcodeApi.recipeSvg);

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

vi.mock('../../contexts/I18nContext.tsx', async () => {
  const { t: translate } = await import('@brewform/shared/i18n');
  return {
    I18nProvider: ({ children }: { children: ReactNode }) => children,
    useTranslation: () => ({
      t: (key: string) => translate(key, 'en'),
      locale: 'en',
      setLocale: () => undefined,
      availableLocales: ['en', 'tr'],
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * RecipeQRCode — QR-code card with preview image and SVG download
 * button for a recipe's share URL. Hidden for private/draft recipes.
 */
describe('RecipeQRCode', () => {
  it('renders no QR card when visibility is "private"', () => {
    renderQR(<RecipeQRCode slug="my-espresso" visibility="private" />);
    expect(screen.queryByText('QR Code')).not.toBeInTheDocument();
  });

  it('renders no QR card when visibility is "draft"', () => {
    renderQR(<RecipeQRCode slug="my-espresso" visibility="draft" />);
    expect(screen.queryByText('QR Code')).not.toBeInTheDocument();
  });

  it('renders the QR card with title and image when visibility is "public"', async () => {
    renderQR(<RecipeQRCode slug="my-espresso" visibility="public" />);
    expect(await screen.findByText('QR Code')).toBeInTheDocument();
    const img = screen.getByAltText('Recipe QR Code') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('/api/v1/qrcode/recipe/my-espresso.svg');
  });

  it('renders when visibility is "unlisted"', async () => {
    renderQR(<RecipeQRCode slug="my-espresso" visibility="unlisted" />);
    expect(await screen.findByText('QR Code')).toBeInTheDocument();
  });

  it('builds the image src from the slug prop', async () => {
    renderQR(<RecipeQRCode slug="cold-brew-42" visibility="public" />);
    const img = (await screen.findByAltText('Recipe QR Code')) as HTMLImageElement;
    expect(img.src).toContain('/api/v1/qrcode/recipe/cold-brew-42.svg');
  });

  it('shows a "Download QR Code" button that is enabled initially', async () => {
    renderQR(<RecipeQRCode slug="my-espresso" visibility="public" />);
    const button = await screen.findByRole('button', { name: /Download QR Code/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('updates the button label to "Downloading..." while the resource route loads the SVG', async () => {
    let resolveSvg: (svg: string) => void = () => undefined;
    mockRecipeSvg.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveSvg = resolve;
        }),
    );
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:fake'),
      configurable: true,
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    try {
      const user = userEvent.setup();
      renderQR(<RecipeQRCode slug="my-espresso" visibility="public" />);
      await user.click(await screen.findByRole('button', { name: /Download QR Code/i }));
      expect(await screen.findByRole('button', { name: /Downloading/i })).toBeDisabled();
      expect(mockRecipeSvg).toHaveBeenCalledWith('my-espresso', {
        signal: expect.any(AbortSignal),
      });

      resolveSvg('<svg/>');
      await screen.findByRole('button', { name: /Download QR Code/i });
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      clickSpy.mockRestore();
    }
  });

  it('shows the download-failed toast when the SVG cannot be loaded', async () => {
    mockRecipeSvg.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderQR(<RecipeQRCode slug="my-espresso" visibility="public" />);

    await user.click(await screen.findByRole('button', { name: /Download QR Code/i }));

    expect(await screen.findByText('Failed to download QR code.')).toBeInTheDocument();
  });
});
