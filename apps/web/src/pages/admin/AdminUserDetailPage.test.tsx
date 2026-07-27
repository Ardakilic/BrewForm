import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ToastProvider } from '../../components/ui/Toast.tsx';

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

vi.mock('../../components/ui/Skeleton.tsx', () => ({
  Skeleton: () => <div data-testid='skeleton' />,
}));

vi.mock('../../components/admin/BanDialog.tsx', () => ({
  BanDialog: () => null,
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'current-user', username: 'admin', displayName: 'Admin' },
    isLoading: false,
    isAuthenticated: true,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearSessionError: vi.fn(),
  }),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'admin.users.notFoundTitle': 'Kullanıcı Bulunamadı',
        'admin.users.notFoundMessage': 'İstenen kullanıcı bulunamadı.',
        'admin.users.backToUsers': 'Kullanıcılara Dön',
        'admin.users.loadFailedTitle': 'Yükleme Başarısız',
        'admin.users.loadFailedMessage': 'Kullanıcı detayları yüklenirken bir hata oluştu.',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/index.ts', () => ({
  adminApi: {
    getUserDetail: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

import { adminApi } from '../../api/index.ts';
import { AdminUserDetailPage } from './AdminUserDetailPage.tsx';

const mockAdminApi = vi.mocked(adminApi);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminUserDetailPage — tr locale spot-check', () => {
  it('renders the Turkish not-found title when API returns 404', async () => {
    const err = Object.assign(new Error('Not found'), { response: { status: 404 } });
    mockAdminApi.getUserDetail.mockRejectedValue(err);

    const router = createMemoryRouter(
      [
        {
          path: '/admin/users/:id',
          element: (
            <ToastProvider>
              <AdminUserDetailPage />
            </ToastProvider>
          ),
        },
      ],
      { initialEntries: ['/admin/users/missing-id'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Kullanıcı Bulunamadı')).toBeInTheDocument();
    });
  });
});
