import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootErrorBoundary } from './ErrorBoundary.tsx';

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

vi.mock('../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: 'en',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWithLoader(loader: () => never) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <div data-testid='page-content'>Page</div>,
        loader,
        errorElement: <RootErrorBoundary />,
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('RootErrorBoundary', () => {
  it('renders NotFoundPage for 404 route errors', async () => {
    renderWithLoader(() => {
      throw new Response(null, { status: 404 });
    });

    expect(await screen.findByText('404')).toBeInTheDocument();
    expect(screen.getByText('error.404')).toBeInTheDocument();
  });

  it('renders ServerErrorPage for 500 route errors', async () => {
    renderWithLoader(() => {
      throw new Response(null, { status: 500 });
    });

    expect(await screen.findByText('500')).toBeInTheDocument();
    expect(screen.getByText('error.500')).toBeInTheDocument();
  });

  it('renders ServerErrorPage for 503 route errors', async () => {
    renderWithLoader(() => {
      throw new Response(null, { status: 503 });
    });

    expect(await screen.findByText('500')).toBeInTheDocument();
  });

  it('renders generic fallback with t() strings for non-route errors', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <ThrowError />,
          errorElement: <RootErrorBoundary />,
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('error.boundary.oops')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'common.goHome' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'error.boundary.reload' })).toBeInTheDocument();
  });
});

function ThrowError() {
  throw new Error('boom');
}
