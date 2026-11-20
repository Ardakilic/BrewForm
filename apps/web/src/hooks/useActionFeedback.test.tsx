import { t } from '@brewform/shared/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useFetcher } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../test-utils/render.tsx';
import { useActionFeedback } from './useActionFeedback.ts';

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

const onSuccess = vi.fn();
const onError = vi.fn();
let nextResult: { ok: boolean; error?: string } = { ok: true };

/** Submits to the route action and reports feedback through the hook. */
function Harness() {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  useActionFeedback(fetcher, {
    errorKey: 'settings.failedMsg',
    successKey: 'settings.savedMsg',
    onSuccess,
    onError,
  });
  return (
    <button type="button" onClick={() => fetcher.submit({ intent: 'x' }, { method: 'post' })}>
      submit
    </button>
  );
}

/** Renders the harness under a route whose action returns `nextResult`. */
function renderHarness() {
  return renderWithAppProviders(
    [{ path: '/', Component: Harness, action: async () => nextResult }],
    { locale: 'en' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useActionFeedback', () => {
  it('toasts the error key and calls onError once for { ok: false }', async () => {
    nextResult = { ok: false, error: 'nope' };
    renderHarness();

    fireEvent.click(await screen.findByText('submit'));

    expect(await screen.findByText(t('settings.failedMsg'))).toBeInTheDocument();
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('toasts the success key and calls onSuccess once for { ok: true }', async () => {
    nextResult = { ok: true };
    renderHarness();

    fireEvent.click(await screen.findByText('submit'));

    expect(await screen.findByText(t('settings.savedMsg'))).toBeInTheDocument();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });
});
