import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnitSystem } from './useUnitSystem.ts';

vi.mock('../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

// Re-import the mocked hook so we can control its return value in tests.
import { useAuth } from '../contexts/AuthContext.tsx';

const mockUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUnitSystem', () => {
  it('returns "metric" when user is null (unauthenticated)', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useUnitSystem());
    expect(result.current).toBe('metric');
  });

  it('returns "metric" when user exists but preferences is null', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
        username: 'user',
        displayName: 'User',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
        preferences: null,
      },
      isAuthenticated: true,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useUnitSystem());
    expect(result.current).toBe('metric');
  });

  it('returns "metric" when user exists but preferences is undefined', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
        username: 'user',
        displayName: 'User',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
        preferences: undefined,
      },
      isAuthenticated: true,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useUnitSystem());
    expect(result.current).toBe('metric');
  });

  it('returns "metric" when user has preferences but unitSystem is undefined', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
        username: 'user',
        displayName: 'User',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
        preferences: {},
      },
      isAuthenticated: true,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useUnitSystem());
    expect(result.current).toBe('metric');
  });

  it('returns "imperial" when user has preferences.unitSystem: "imperial"', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
        username: 'user',
        displayName: 'User',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
        preferences: { unitSystem: 'imperial' },
      },
      isAuthenticated: true,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useUnitSystem());
    expect(result.current).toBe('imperial');
  });

  it('returns "metric" when user has preferences.unitSystem: "metric"', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
        username: 'user',
        displayName: 'User',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
        preferences: { unitSystem: 'metric' },
      },
      isAuthenticated: true,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useUnitSystem());
    expect(result.current).toBe('metric');
  });
});
