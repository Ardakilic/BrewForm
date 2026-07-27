import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { ConfirmProvider, Modal, useConfirm } from './Modal.tsx';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </I18nProvider>
  );
}

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <p>content</p>
      </Modal>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders children when open is true', () => {
    render(
      <Modal open onClose={() => {}}>
        <p>modal-content</p>
      </Modal>,
    );
    expect(screen.getByText('modal-content')).toBeInTheDocument();
  });

  it('calls onClose on Escape key', () => {
    let closed = false;
    render(
      <Modal
        open
        onClose={() => {
          closed = true;
        }}
      >
        <button type='button'>btn</button>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  it('calls onClose on backdrop click', () => {
    let closed = false;
    render(
      <Modal
        open
        onClose={() => {
          closed = true;
        }}
      >
        <button type='button'>btn</button>
      </Modal>,
    );
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(closed).toBe(true);
  });

  it('does not call onClose when clicking inside the panel', () => {
    let closed = false;
    render(
      <Modal
        open
        onClose={() => {
          closed = true;
        }}
      >
        <button type='button'>inner-btn</button>
      </Modal>,
    );
    fireEvent.click(screen.getByText('inner-btn'));
    expect(closed).toBe(false);
  });

  it('traps focus: Tab from last element wraps to first', () => {
    render(
      <Modal open onClose={() => {}}>
        <button type='button'>first</button>
        <button type='button'>last</button>
      </Modal>,
    );
    const last = screen.getByText('last');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('traps focus: Shift+Tab from first element wraps to last', () => {
    render(
      <Modal open onClose={() => {}}>
        <button type='button'>first</button>
        <button type='button'>last</button>
      </Modal>,
    );
    const first = screen.getByText('first');
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });
});

describe('useConfirm', () => {
  function ConfirmTrigger({ onResult }: { onResult: (v: boolean) => void }) {
    const { confirm } = useConfirm();
    return (
      <button
        type='button'
        onClick={async () => {
          const result = await confirm({
            titleKey: 'common.confirmDelete',
            bodyKey: 'admin.recipes.deleteConfirm',
            danger: true,
          });
          onResult(result);
        }}
      >
        trigger
      </button>
    );
  }

  it('resolves true when confirm button is clicked', async () => {
    let result: boolean | null = null;
    render(
      <ConfirmTrigger
        onResult={(v) => {
          result = v;
        }}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByText('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(result).toBe(true));
  });

  it('resolves false when cancel button is clicked', async () => {
    let result: boolean | null = null;
    render(
      <ConfirmTrigger
        onResult={(v) => {
          result = v;
        }}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByText('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(result).toBe(false));
  });

  it('resolves false on Escape', async () => {
    let result: boolean | null = null;
    render(
      <ConfirmTrigger
        onResult={(v) => {
          result = v;
        }}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByText('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(result).toBe(false));
  });

  it('applies danger styling to confirm button', async () => {
    render(<ConfirmTrigger onResult={() => {}} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const confirmBtn = screen.getByText('Delete');
    expect(confirmBtn.style.background).toBe('var(--error)');
  });
});
