import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        'admin.users.banDialogTitle': 'Kullanıcıyı Yasakla',
        'admin.users.banReason': 'Yasaklama Sebebi',
        'admin.users.banReasonPlaceholder': 'Sebep girin...',
        'admin.users.confirmBan': 'Yasakla',
        'admin.users.banning': 'Yasaklanıyor...',
        'common.cancel': 'İptal',
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
    banUser: vi.fn(),
    unbanUser: vi.fn(),
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

describe('AdminUsersPage — ban/unban flow', () => {
  const mockUsers = [
    {
      id: 'u1',
      username: 'alice',
      email: 'alice@test.com',
      displayName: null,
      avatarUrl: null,
      isAdmin: false,
      isBanned: false,
      createdAt: '2024-01-01T00:00:00Z',
    },
  ];

  function renderPage() {
    const router = createMemoryRouter(
      [{ path: '/admin/users', element: <AdminUsersPage /> }],
      { initialEntries: ['/admin/users'] },
    );
    return render(<RouterProvider router={router} />);
  }

  it('opens ban dialog when ban button is clicked', async () => {
    mockAdminApi.getUsers.mockResolvedValue({ users: mockUsers, total: 1 });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Yasakla'));

    await waitFor(() => {
      expect(
        screen.getByText('Kullanıcıyı Yasakla: alice'),
      ).toBeInTheDocument();
    });
  });

  it('calls unbanUser when unban button is clicked on a banned user', async () => {
    const bannedUser = { ...mockUsers[0], isBanned: true };
    mockAdminApi.getUsers.mockResolvedValue({ users: [bannedUser], total: 1 });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Yasağı Kaldır'));

    await waitFor(() => {
      expect(mockAdminApi.unbanUser).toHaveBeenCalledWith('u1');
    });
  });
});
