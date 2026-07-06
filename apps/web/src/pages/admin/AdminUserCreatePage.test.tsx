import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
        'admin.users.createUser': 'Kullanıcı Oluştur',
        'admin.users.backToUsersArrow': '← Kullanıcılara Dön',
        'admin.users.adminBadge': 'Yönetici',
        'admin.users.banned': 'Yasaklı',
        'auth.email': 'E-posta',
        'auth.username': 'Kullanıcı Adı',
        'auth.password': 'Şifre',
        'settings.displayName': 'Görünen Ad',
        'common.bio': 'Biyografi',
        'common.cancel': 'İptal',
        'common.creating': 'Oluşturuluyor...',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/index.ts', () => ({
  adminApi: { createUser: vi.fn() },
}));

import { AdminUserCreatePage } from './AdminUserCreatePage.tsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminUserCreatePage — tr locale spot-check', () => {
  it('renders the Turkish create-user heading', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/admin/users/new',
          element: <AdminUserCreatePage />,
        },
      ],
      { initialEntries: ['/admin/users/new'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Kullanıcı Oluştur' })).toBeInTheDocument();
  });
});
