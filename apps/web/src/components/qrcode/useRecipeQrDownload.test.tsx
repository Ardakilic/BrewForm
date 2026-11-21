import { t } from '@brewform/shared/i18n';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { recipeQrLoader, shouldRevalidateRecipeQr } from '../../routes/resources/qrcode.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { useRecipeQrDownload } from './useRecipeQrDownload.ts';

const mockRecipeSvg = vi.mocked(qrcodeApi.recipeSvg);

/** A minimal consumer of the hook: one button showing the downloading state. */
function Harness({ slug }: { slug: string }) {
  const { download, downloading } = useRecipeQrDownload(slug);
  return (
    <button type="button" onClick={download}>
      {downloading ? 'downloading' : 'download'}
    </button>
  );
}

/** Renders the harness with the real QR resource route inside the app providers. */
function renderHarness(slug = 'cold-brew') {
  return renderWithAppProviders(
    [
      { path: '/', element: <Harness slug={slug} /> },
      {
        path: '/resources/qrcode/recipe/:slug',
        loader: recipeQrLoader,
        shouldRevalidate: shouldRevalidateRecipeQr,
      },
    ],
    { initialEntries: ['/'] },
  );
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;
let clicked: HTMLAnchorElement[];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clicked = [];
  createObjectURL = vi.fn(() => 'blob:qr');
  revokeObjectURL = vi.fn();
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    value: createObjectURL,
    configurable: true,
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    value: revokeObjectURL,
    configurable: true,
  });
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});

afterEach(() => {
  clickSpy.mockRestore();
});

describe('useRecipeQrDownload', () => {
  it('downloads the SVG as brewform-<slug>-qr.svg on success', async () => {
    mockRecipeSvg.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const user = userEvent.setup();
    renderHarness();

    await user.click(await screen.findByRole('button', { name: 'download' }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0].download).toBe('brewform-cold-brew-qr.svg');
    expect(clicked[0].getAttribute('href')).toBe('blob:qr');
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('image/svg+xml');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:qr');
    expect(mockRecipeSvg).toHaveBeenCalledWith('cold-brew', { signal: expect.any(AbortSignal) });
    expect(screen.queryByText(t('qrcode.downloadFailed'))).not.toBeInTheDocument();
  });

  it('shows the downloading state while the SVG loads', async () => {
    let resolveSvg: (svg: string) => void = () => undefined;
    mockRecipeSvg.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveSvg = resolve;
        }),
    );
    const user = userEvent.setup();
    renderHarness();

    await user.click(await screen.findByRole('button', { name: 'download' }));
    expect(await screen.findByRole('button', { name: 'downloading' })).toBeInTheDocument();

    resolveSvg('<svg/>');
    expect(await screen.findByRole('button', { name: 'download' })).toBeInTheDocument();
  });

  it('shows the qrcode.downloadFailed toast and downloads nothing on failure', async () => {
    mockRecipeSvg.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderHarness();

    await user.click(await screen.findByRole('button', { name: 'download' }));

    expect(await screen.findByText(t('qrcode.downloadFailed'))).toBeInTheDocument();
    expect(clicked).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('downloads again on a second click', async () => {
    mockRecipeSvg.mockResolvedValue('<svg/>');
    const user = userEvent.setup();
    renderHarness();

    const button = await screen.findByRole('button', { name: 'download' });
    await user.click(button);
    await waitFor(() => expect(clicked).toHaveLength(1));
    await user.click(await screen.findByRole('button', { name: 'download' }));

    await waitFor(() => expect(clicked).toHaveLength(2));
  });
});
