import { t } from '@brewform/shared/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../test-utils/render.tsx';
import { RouteErrorState } from './RouteErrorState.tsx';

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

vi.mock('./seo/SEOHead.tsx', () => ({ SEOHead: () => null }));

/** Route component for the not-found case. */
const Page = () => <p>page</p>;
/** Route component shown once the retried loader succeeds. */
const LoadedPage = () => <p>loaded page</p>;

beforeEach(() => {
  localStorage.clear();
});

describe('RouteErrorState', () => {
  it('renders the not-found page for a 404 route error', async () => {
    renderWithAppProviders(
      [
        {
          path: '/',
          loader: () => {
            throw new Response('Not Found', { status: 404 });
          },
          Component: Page,
          errorElement: <RouteErrorState />,
        },
      ],
      { locale: 'en' },
    );

    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
  });

  it('renders an error banner with a Retry that re-runs the loader', async () => {
    let calls = 0;
    renderWithAppProviders(
      [
        {
          path: '/',
          loader: () => {
            calls++;
            if (calls === 1) throw new Error('boom');
            return null;
          },
          Component: LoadedPage,
          errorElement: <RouteErrorState />,
        },
      ],
      { locale: 'en' },
    );

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }));

    await waitFor(() => expect(calls).toBe(2));
  });
});
