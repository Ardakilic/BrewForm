import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RegisterPage } from './RegisterPage.tsx';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { authApi } from '../../api/index.ts';

vi.mock('../../api/index', () => ({
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
  authApi: {
    register: vi.fn(),
    registrationStatus: vi.fn(),
    logout: vi.fn().mockResolvedValue({}),
  },
  userApi: {
    me: vi.fn().mockRejectedValue(new Error('Not authenticated')),
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

  it('should display structured error message from ApiError on registration failure', async () => {
    vi.mocked(authApi.registrationStatus).mockResolvedValue({ enabled: true });
    const { ApiError: MockApiError } = await import('../../api/index.ts');
    vi.mocked(authApi.register).mockRejectedValue(
      new MockApiError('VALIDATION_ERROR', 'Validation failed', [
        { field: 'email', message: 'Already taken' },
      ], 400),
    );
    renderRegisterPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'taken@test.com');
    await userEvent.type(screen.getByPlaceholderText('coffee_lover'), 'testuser');
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'Passw0rd!');
    const passwordInputs = screen.getAllByPlaceholderText(/at least 8 characters/i);
    await userEvent.type(passwordInputs[0], 'Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });
  });
});
