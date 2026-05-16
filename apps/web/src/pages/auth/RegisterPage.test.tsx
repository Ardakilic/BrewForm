import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RegisterPage } from './RegisterPage';
import { AuthProvider } from '../../contexts/AuthContext';
import { I18nProvider } from '../../contexts/I18nContext';
import { authApi } from '../../api/index';

vi.mock('../../api/index', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), upload: vi.fn() },
  ApiError: class extends Error { code = ''; status = 500; },
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(() => null),
  setAccessToken: vi.fn(),
  authApi: {
    registrationStatus: vi.fn(),
  },
}));

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state while checking registration status', () => {
    vi.mocked(authApi.registrationStatus).mockReturnValue(new Promise(() => {}));
    renderRegisterPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should show registration form when enabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
  });

  it('should show closed message when registration is disabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: false });
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByText(/registration.*disabled/i)).toBeInTheDocument();
    });
  });

  it('should show login link when registration is disabled', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: false });
    renderRegisterPage();
    await waitFor(() => {
      const loginLink = screen.getByRole('link', { name: /log in/i });
      expect(loginLink).toBeInTheDocument();
      expect(loginLink.getAttribute('href')).toBe('/login');
    });
  });

  it('should fall back to showing form when status check fails', async () => {
    vi.mocked(authApi.registrationStatus).mockRejectedValue(new Error('Network error'));
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
  });
});
