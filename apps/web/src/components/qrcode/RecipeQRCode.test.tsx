import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeQRCode } from './RecipeQRCode.tsx';

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

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * RecipeQRCode — QR-code card with preview image and SVG download
 * button for a recipe's share URL. Hidden for private/draft recipes.
 */
describe('RecipeQRCode', () => {
  it('renders null when visibility is "private"', () => {
    const { container } = render(<RecipeQRCode slug='my-espresso' visibility='private' />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when visibility is "draft"', () => {
    const { container } = render(<RecipeQRCode slug='my-espresso' visibility='draft' />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the QR card with title and image when visibility is "public"', () => {
    render(<RecipeQRCode slug='my-espresso' visibility='public' />);
    expect(screen.getByText('QR Code')).toBeInTheDocument();
    const img = screen.getByAltText('Recipe QR Code') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('/api/v1/qrcode/recipe/my-espresso.svg');
  });

  it('renders when visibility is "unlisted"', () => {
    render(<RecipeQRCode slug='my-espresso' visibility='unlisted' />);
    expect(screen.getByText('QR Code')).toBeInTheDocument();
  });

  it('builds the image src from the slug prop', () => {
    render(<RecipeQRCode slug='cold-brew-42' visibility='public' />);
    const img = screen.getByAltText('Recipe QR Code') as HTMLImageElement;
    expect(img.src).toContain('/api/v1/qrcode/recipe/cold-brew-42.svg');
  });

  it('shows a "Download QR Code" button that is enabled initially', () => {
    render(<RecipeQRCode slug='my-espresso' visibility='public' />);
    const button = screen.getByRole('button', { name: /Download QR Code/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('updates button label to "Downloading..." while the fetch is in-flight', async () => {
    let resolveFetch: (value: Blob) => void = () => {};
    const blobPromise = new Promise<Blob>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
      Promise.resolve({
        blob: () => blobPromise,
      } as unknown as Response),
    );
    // jsdom: URL.createObjectURL must exist
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });

    try {
      const user = userEvent.setup();
      render(<RecipeQRCode slug='my-espresso' visibility='public' />);
      const button = screen.getByRole('button', { name: /Download QR Code/i });
      await user.click(button);
      expect(await screen.findByRole('button', { name: /Downloading/i })).toBeDisabled();
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/qrcode/recipe/my-espresso.svg');

      // Resolve to settle pending state and avoid dangling promise
      resolveFetch(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
      await screen.findByRole('button', { name: /Download QR Code/i });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
