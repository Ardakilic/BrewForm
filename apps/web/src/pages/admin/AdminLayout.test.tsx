import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('AdminLayout — print', () => {
  it('marks the whole admin sidebar print-hidden, not only its navigation (V2)', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/admin',
          element: <AdminLayout />,
          children: [{ index: true, element: <p>Admin page content</p> }],
        },
      ],
      { initialEntries: ['/admin'] },
    );

    render(<RouterProvider router={router} />);

    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveClass('print-hidden');
    // Title, navigation, "Back to Site" and the signed-in line all sit inside the hidden sidebar.
    for (const element of [
      screen.getByRole('heading', { name: 'Yönetici Paneli' }),
      screen.getByRole('navigation'),
      screen.getByRole('link', { name: '← Siteye Dön' }),
      screen.getByText(/Giriş yapan:/),
    ]) {
      expect(element.closest('.print-hidden')).toBe(sidebar);
    }
    // The admin page content itself still prints.
    expect(screen.getByText('Admin page content').closest('.print-hidden')).toBeNull();
  });
});
