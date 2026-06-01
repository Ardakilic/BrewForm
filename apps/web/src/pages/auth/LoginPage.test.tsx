import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LoginPage } from './LoginPage.tsx';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';

vi.mock('../../api/index', () => ({
  authApi: {
    login: vi.fn(),
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

import { authApi } from '../../api/index.ts';

async function renderLoginPage() {
  const result = render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });
  return result;
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the login form with email, password, and submit button', async () => {
    await renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('should render the remember me checkbox unchecked by default', async () => {
    await renderLoginPage();
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('should render forgot password link', async () => {
    await renderLoginPage();
    expect(screen.getByText(/forgot password\?/i)).toBeInTheDocument();
  });

  it('should render sign up link', async () => {
    await renderLoginPage();
    expect(screen.getByText(/sign up/i)).toBeInTheDocument();
  });

  it('should toggle remember me checkbox on click', async () => {
    await renderLoginPage();
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('should toggle checkbox via label click', async () => {
    await renderLoginPage();
    const label = screen.getByText(/remember me/i);
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i });
    await userEvent.click(label);
    expect(checkbox).toBeChecked();
  });

  it('should call login with rememberMe: true when checkbox is checked', async () => {
    const loginMock = vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '1',
        email: 'test@test.com',
        username: 'testuser',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: false,
      },
    });

    await renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('checkbox', { name: /remember me/i }));
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'password123',
        rememberMe: true,
      });
    });
  });

  it('should pass rememberMe flag to the API so the server controls cookie lifetime', async () => {
    const loginMock = vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '1',
        email: 'test@test.com',
        username: 'testuser',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: false,
      },
    });

    await renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('checkbox', { name: /remember me/i }));
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: true }),
      );
    });
  });

  it('should call login with rememberMe: false when checkbox is not checked', async () => {
    const loginMock = vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '2',
        email: 'other@test.com',
        username: 'other',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: false,
      },
    });

    await renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'other@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password456');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: 'other@test.com',
        password: 'password456',
        rememberMe: false,
      });
    });
  });

  it('should pass rememberMe: false to the API when checkbox is unchecked', async () => {
    const loginMock = vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '2',
        email: 'other@test.com',
        username: 'other',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: false,
      },
    });

    await renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'other@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password456');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: false }),
      );
    });
  });

  it('should display error message on login failure', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error('Invalid email or password'));
    await renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('should disable button and show loading text while logging in', async () => {
    vi.mocked(authApi.login).mockReturnValue(new Promise(() => {}));

    await renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
  });

  it('should require email field', async () => {
    await renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeRequired();
  });

  it('should require password field', async () => {
    await renderLoginPage();
    expect(screen.getByLabelText(/password/i)).toBeRequired();
  });

  it('should display structured error message from ApiError on login failure', async () => {
    const { ApiError: MockApiError } = await import('../../api/index.ts');
    vi.mocked(authApi.login).mockRejectedValue(
      new MockApiError('VALIDATION_ERROR', 'Validation failed', [
        { field: 'email', message: 'Invalid format' },
      ], 400),
    );
    await renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'bad@test');
    await userEvent.type(screen.getByLabelText(/password/i), 'pass');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });
  });
});
