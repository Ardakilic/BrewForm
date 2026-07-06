import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'admin', displayName: 'Admin' },
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
        'admin.title': 'Yönetici Paneli',
        'admin.dashboard': 'Panel',
        'admin.users': 'Kullanıcılar',
        'admin.recipes': 'Tarifler',
        'admin.equipment': 'Ekipman',
        'admin.coffeeVarieties': 'Kahve Çeşitleri',
        'admin.vendors': 'Satıcılar',
        'admin.tasteNotes': 'Tat Notları',
        'admin.compatibilityShort': 'Uyumluluk',
        'admin.badgesShort': 'Rozetler',
        'admin.auditLog': 'Denetim Günlüğü',
        'admin.cache': 'Önbellek',
        'admin.backToSite': '← Siteye Dön',
        'admin.loggedInAs': 'Giriş yapan:',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

import { AdminLayout } from './AdminLayout.tsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminLayout — tr locale spot-check', () => {
  it('renders the Turkish admin title', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/admin',
          element: <AdminLayout />,
          children: [{ path: '*', element: <div /> }],
        },
      ],
      { initialEntries: ['/admin'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByText('Yönetici Paneli')).toBeInTheDocument();
  });
});
