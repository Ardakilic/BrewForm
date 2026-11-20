import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from './AppProviders.tsx';
import { useConfirm } from './components/ui/Modal.tsx';
import { useToast } from './components/ui/Toast.tsx';
import { useAuth } from './contexts/AuthContext.tsx';
import { useTranslation } from './contexts/I18nContext.tsx';
import { useTheme } from './contexts/ThemeContext.tsx';
import { ensureMatchMedia, makeAuth, TEST_ADMIN } from './test-utils/render.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

/** Reads every app-wide context; throws if any provider is missing. */
function Probe() {
  useTheme();
  useTranslation();
  useToast();
  useConfirm();
  const { user } = useAuth();
  return <p>probe:{user?.username ?? 'anonymous'}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  ensureMatchMedia();
});

describe('AppProviders', () => {
  it('provides theme, i18n, toast, confirm and auth contexts to its children', () => {
    render(
      <AppProviders auth={makeAuth('admin')}>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByText(`probe:${TEST_ADMIN.username}`)).toBeInTheDocument();
  });

  it('uses the session-restoring AuthProvider when no fixed auth is given', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    try {
      render(
        <AppProviders>
          <Probe />
        </AppProviders>,
      );
      expect(screen.getByText('probe:anonymous')).toBeInTheDocument();
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/users/me'),
        expect.anything(),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('logs mount and unmount at debug level', () => {
    const { unmount } = render(
      <AppProviders auth={makeAuth()}>
        <p>child</p>
      </AppProviders>,
    );
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'AppProviders mounted');
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'AppProviders unmounted');
  });
});
