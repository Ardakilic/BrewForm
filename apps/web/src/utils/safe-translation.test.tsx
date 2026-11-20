/**
 * Tests for the provider-optional i18n hooks.
 *
 * Feature: wave-6-audit-remediation (t6, task 18.13 — `useSafeLocale`)
 */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../contexts/I18nContext.tsx';
import { useSafeLocale, useSafeT } from './safe-translation.ts';

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

/** Wraps a hook in a real I18nProvider. */
function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe('useSafeLocale', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns 'en' outside an I18nProvider", () => {
    const { result } = renderHook(() => useSafeLocale());
    expect(result.current).toBe('en');
  });

  it('returns the provider locale inside an I18nProvider', () => {
    localStorage.setItem('brewform_locale', 'tr');
    const { result } = renderHook(() => useSafeLocale(), { wrapper });
    expect(result.current).toBe('tr');
  });

  it('returns the default provider locale (en) when nothing is stored', () => {
    const { result } = renderHook(() => useSafeLocale(), { wrapper });
    expect(result.current).toBe('en');
  });
});

describe('useSafeT', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to the bundled English string outside a provider', () => {
    const { result } = renderHook(() => useSafeT());
    expect(result.current('chart.duration.hours')).toBe('{n}h');
  });

  it('translates with the provider locale inside a provider', () => {
    localStorage.setItem('brewform_locale', 'tr');
    const { result } = renderHook(() => useSafeT(), { wrapper });
    expect(result.current('chart.duration.hours')).toBe('{n} sa');
  });
});
