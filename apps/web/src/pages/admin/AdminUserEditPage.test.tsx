import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

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

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'current-admin', username: 'admin', displayName: 'Admin' },
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
        'admin.users.editUserTitle': 'Kullanıcıyı Düzenle:',
        'admin.users.backToUser': '← Kullanıcıya Dön',
        'admin.users.passwordHint': 'Mevcut şifreyi korumak için şifreyi boş bırakın.',
        'admin.users.adminBadge': 'Yönetici',
        'admin.users.banned': 'Yasaklı',
        'admin.users.notFoundTitle': 'Kullanıcı Bulunamadı',
        'admin.users.notFoundMessage': 'İstenen kullanıcı bulunamadı.',
        'admin.users.backToUsers': 'Kullanıcılara Dön',
        'admin.users.loadDetailError': 'Kullanıcı detayları yüklenemedi.',
        'auth.email': 'E-posta',
        'auth.username': 'Kullanıcı Adı',
        'auth.resetPassword.newPassword': 'Yeni Şifre',
        'auth.password': 'Şifre',
        'settings.displayName': 'Görünen Ad',
        'common.bio': 'Biyografi',
        'common.saveChanges': 'Değişiklikleri Kaydet',
        'common.saving': 'Kaydediliyor...',
        'common.cancel': 'İptal',
        'admin.users.passwordPlaceholder': 'Mevcutu korumak için boş bırakın',
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
    updateUser: vi.fn(),
  },
}));

import { adminApi } from '../../api/index.ts';
import { AdminUserEditPage } from './AdminUserEditPage.tsx';

const mockAdminApi = vi.mocked(adminApi);

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminApi.getUserDetail.mockResolvedValue({
    id: 'user-to-edit',
    email: 'edit@example.com',
    username: 'edituser',
    displayName: 'Edit User',
    avatarUrl: null,
    isAdmin: false,
    isBanned: false,
    createdAt: '2024-01-01T00:00:00Z',
    bio: '',
    updatedAt: '2024-01-01T00:00:00Z',
  });
});

describe('AdminUserEditPage — tr locale spot-check', () => {
  it('renders the Turkish edit-user title', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/admin/users/:id/edit',
          element: <AdminUserEditPage />,
        },
      ],
      { initialEntries: ['/admin/users/user-to-edit/edit'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText(/Kullanıcıyı Düzenle/)).toBeInTheDocument();
    });
  });
});
