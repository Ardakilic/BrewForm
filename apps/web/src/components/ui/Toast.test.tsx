import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { ToastProvider, useToast } from './Toast.tsx';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

function ToastTrigger() {
  const toast = useToast();
  return (
    <div>
      <button type='button' onClick={() => toast.success('common.saved')}>fire-success</button>
      <button type='button' onClick={() => toast.error('common.error')}>fire-error</button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('renders a success toast when toast.success is called', () => {
    render(<ToastTrigger />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('fire-success'));
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders an error toast when toast.error is called', () => {
    render(<ToastTrigger />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('fire-error'));
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('applies success border color via CSS variable', () => {
    render(<ToastTrigger />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('fire-success'));
    const container = screen.getByRole('status');
    const toast = container.querySelector('[style*="--success"]');
    expect(toast).not.toBeNull();
  });

  it('applies error border color via CSS variable', () => {
    render(<ToastTrigger />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('fire-error'));
    const container = screen.getByRole('status');
    const toast = container.querySelector('[style*="--error"]');
    expect(toast).not.toBeNull();
  });

  it('stacks multiple toasts', () => {
    render(<ToastTrigger />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('fire-success'));
    fireEvent.click(screen.getByText('fire-error'));
    fireEvent.click(screen.getByText('fire-success'));
    const container = screen.getByRole('status');
    expect(container.querySelectorAll('.card').length).toBe(3);
  });

  it('auto-dismisses after timeout', () => {
    render(<ToastTrigger />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('fire-success'));
    expect(screen.getByText('✓')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('has role=status and aria-live=polite on the container', () => {
    render(<ToastTrigger />, { wrapper: Wrapper });
    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-live', 'polite');
  });
});
