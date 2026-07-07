import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BeanListPage } from './BeanListPage.tsx';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('../../api/index.ts', () => ({
  beanApi: {
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

import { beanApi } from '../../api/index.ts';

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <BeanListPage />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

const mockBeans = [
  {
    id: 'bean-1',
    name: 'Ethiopian Yirgacheffe',
    brand: 'Onyx',
    vendorId: null,
    roaster: null,
    roastLevel: 'Light',
    processing: 'Washed',
    origin: 'Ethiopia',
    userId: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'bean-2',
    name: 'Colombia Geisha',
    brand: null,
    vendorId: null,
    roaster: null,
    roastLevel: 'Medium',
    processing: 'Natural',
    origin: 'Colombia',
    userId: 'user-1',
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    deletedAt: null,
  },
];

/**
 * BeanListPage fetches the user's beans via beanApi.list on mount and renders
 * either a loading state, a list of bean cards, or an empty-state message.
 */
describe('BeanListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  it('renders the bean list with bean names after fetch', async () => {
    vi.mocked(beanApi.list).mockResolvedValue(mockBeans);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ethiopian Yirgacheffe')).toBeInTheDocument();
      expect(screen.getByText('Colombia Geisha')).toBeInTheDocument();
    });
  });

  it('renders the empty state message when no beans exist', async () => {
    vi.mocked(beanApi.list).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No beans yet. Add your coffee beans!')).toBeInTheDocument();
    });
  });

  it('renders the empty state message when the fetch rejects', async () => {
    vi.mocked(beanApi.list).mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No beans yet. Add your coffee beans!')).toBeInTheDocument();
    });
  });

  it('logs mount and unmount', async () => {
    vi.mocked(beanApi.list).mockResolvedValue([]);
    const { unmount } = renderPage();
    await waitFor(() => expect(mockLogger.debug).toHaveBeenCalledWith({}, 'BeanListPage mounted'));
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'BeanListPage unmounted')
    );
  });
});
