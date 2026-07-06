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

vi.mock('../../components/admin/BanDialog.tsx', () => ({
  BanDialog: () => null,
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'admin.users.management': 'Kullanıcı Yönetimi',
        'admin.users.new': '+ Yeni Kullanıcı',
        'admin.users.searchPlaceholder': 'Kullanıcı ara...',
        'admin.users.noSearchResults': 'Aramanızla eşleşen kullanıcı yok.',
        'admin.users.noUsers': 'Kullanıcı bulunamadı.',
        'admin.users.role': 'Rol',
        'admin.users.status': 'Durum',
        'admin.users.joined': 'Katıldı',
        'admin.users.adminBadge': 'Yönetici',
        'admin.users.userRole': 'Kullanıcı',
        'admin.users.banned': 'Yasaklı',
        'admin.users.active': 'Aktif',
        'admin.users.unban': 'Yasağı Kaldır',
        'admin.users.ban': 'Yasakla',
        'admin.users.removeAdmin': 'Yöneticiliği Kaldır',
        'admin.users.makeAdmin': 'Yönetici Yap',
        'admin.users.removeAdminError': 'Yönetici ayrıcalıkları kaldırılamadı.',
        'admin.users.makeAdminError': 'Yönetici ayrıcalıkları verilemedi.',
        'admin.users.loadError': 'Kullanıcılar yüklenemedi.',
        'common.search': 'Ara',
        'common.view': 'Görüntüle',
        'common.edit': 'Düzenle',
        'common.actions': 'Eylemler',
        'common.previous': 'Önceki',
        'common.next': 'İleri',
        'auth.username': 'Kullanıcı Adı',
        'auth.email': 'E-posta',
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
    getUsers: vi.fn(),
    toggleAdmin: vi.fn(),
  },
}));

import { adminApi } from '../../api/index.ts';
import { AdminUsersPage } from './AdminUsersPage.tsx';

const mockAdminApi = vi.mocked(adminApi);

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminApi.getUsers.mockResolvedValue({ users: [], total: 0 });
});

describe('AdminUsersPage — tr locale spot-check', () => {
  it('renders the Turkish user management heading', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/admin/users',
          element: <AdminUsersPage />,
        },
      ],
      { initialEntries: ['/admin/users'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Kullanıcı Yönetimi')).toBeInTheDocument();
    });
  });
});
