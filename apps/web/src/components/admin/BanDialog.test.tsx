import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BanDialog } from './BanDialog.tsx';

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
    t: (k: string) => k,
    locale: 'en',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const defaultProps = {
  user: { id: 'u1', username: 'alice', displayName: 'Alice A' },
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  processing: false,
};

describe('BanDialog', () => {
  it('renders user name (displayName) in title when open', () => {
    render(<BanDialog {...defaultProps} />);
    expect(screen.getByText(/admin\.users\.banDialogTitle: Alice A/)).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText('admin.users.banReasonPlaceholder');
    expect(textarea).toHaveValue('');
  });

  it('renders username in title when displayName is null', () => {
    render(
      <BanDialog
        {...defaultProps}
        user={{ id: 'u1', username: 'bob', displayName: null }}
      />,
    );
    expect(screen.getByText(/admin\.users\.banDialogTitle: bob/)).toBeInTheDocument();
  });

  it('confirm button is disabled when reason is empty', () => {
    render(<BanDialog {...defaultProps} />);
    const confirmButton = screen.getByRole('button', { name: 'admin.users.confirmBan' });
    expect(confirmButton).toBeDisabled();
  });

  it('typing a reason and clicking confirm calls onConfirm with the reason', async () => {
    const user = userEvent.setup();
    render(<BanDialog {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('admin.users.banReasonPlaceholder');
    await user.type(textarea, 'Spam');
    const confirmButton = screen.getByRole('button', { name: 'admin.users.confirmBan' });
    await user.click(confirmButton);
    expect(defaultProps.onConfirm).toHaveBeenCalledWith('Spam');
  });

  it('clicking cancel calls onClose', async () => {
    const user = userEvent.setup();
    render(<BanDialog {...defaultProps} />);
    const cancelButton = screen.getByRole('button', { name: 'common.cancel' });
    await user.click(cancelButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('processing true disables buttons and shows banning label', () => {
    render(<BanDialog {...defaultProps} processing />);
    const confirmButton = screen.getByRole('button', { name: 'admin.users.banning' });
    expect(confirmButton).toBeDisabled();
    const cancelButton = screen.getByRole('button', { name: 'common.cancel' });
    expect(cancelButton).toBeDisabled();
  });

  it('renders nothing when open is false', () => {
    render(<BanDialog {...defaultProps} open={false} />);
    expect(screen.queryByText(/admin\.users\.banDialogTitle/)).not.toBeInTheDocument();
  });

  it('resets the reason when the dialog is closed and reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BanDialog {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('admin.users.banReasonPlaceholder');
    await user.type(textarea, 'Spam');
    expect(textarea).toHaveValue('Spam');

    rerender(<BanDialog {...defaultProps} open={false} />);
    rerender(<BanDialog {...defaultProps} open />);

    expect(screen.getByPlaceholderText('admin.users.banReasonPlaceholder')).toHaveValue('');
  });

  it('resets the reason when the target user changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BanDialog {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('admin.users.banReasonPlaceholder');
    await user.type(textarea, 'Spam');
    expect(textarea).toHaveValue('Spam');

    rerender(
      <BanDialog {...defaultProps} user={{ id: 'u2', username: 'bob', displayName: 'Bob B' }} />,
    );

    expect(screen.getByPlaceholderText('admin.users.banReasonPlaceholder')).toHaveValue('');
  });
});
