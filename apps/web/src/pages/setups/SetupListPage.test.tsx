import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SetupListPage } from './SetupListPage.tsx';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { ToastProvider } from '../../components/ui/Toast.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('../../api/index.ts', () => ({
  setupApi: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  authApi: {
    logout: vi.fn().mockResolvedValue({}),
    registrationStatus: vi.fn().mockResolvedValue({ enabled: true }),
  },
  userApi: {
    me: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  },
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiError: class extends Error {
    code: string;
    status: number;
    details?: Array<{ field: string; message: string }>;
    constructor(
      code: string,
      message: string,
      details?: Array<{ field: string; message: string }>,
      status: number = 500,
    ) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details;
    }
  },
}));

import { setupApi } from '../../api/index.ts';

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <SetupListPage />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

const mockSetups = [
  {
    id: 'setup-1',
    name: 'V60 Setup',
    userId: 'user-1',
    brewerDetails: 'Hario V60',
    grinder: 'Niche Zero',
    portafilterId: null,
    basketId: null,
    puckScreenId: null,
    paperFilterId: null,
    tamperId: null,
    isDefault: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'setup-2',
    name: 'Espresso Setup',
    userId: 'user-1',
    brewerDetails: null,
    grinder: 'Mazzer',
    portafilterId: null,
    basketId: null,
    puckScreenId: null,
    paperFilterId: null,
    tamperId: null,
    isDefault: false,
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    deletedAt: null,
  },
];

/**
 * SetupListPage fetches the user's brewing setups via setupApi.list on mount
 * and renders either a list of setup cards or an empty-state message.
 */
describe('SetupListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  it('renders the setup list with setup names after fetch', async () => {
    vi.mocked(setupApi.list).mockResolvedValue(mockSetups);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('V60 Setup')).toBeInTheDocument();
      expect(screen.getByText('Espresso Setup')).toBeInTheDocument();
    });
  });

  it('renders the empty state message when no setups exist', async () => {
    vi.mocked(setupApi.list).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText('No setups yet. Create your first brewing setup!'),
      ).toBeInTheDocument();
    });
  });

  it('logs mount and unmount', async () => {
    vi.mocked(setupApi.list).mockResolvedValue([]);
    const { unmount } = renderPage();
    await waitFor(() => expect(mockLogger.debug).toHaveBeenCalledWith({}, 'SetupListPage mounted'));
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'SetupListPage unmounted')
    );
  });
});
