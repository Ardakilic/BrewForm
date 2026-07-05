import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveFilterBadge } from './ActiveFilterBadge.tsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ActiveFilterBadge', () => {
  it('should render label and value', () => {
    render(<ActiveFilterBadge label='Method' value='V60' onRemove={vi.fn()} />);
    expect(screen.getByText('Method')).toBeInTheDocument();
    expect(screen.getByText('V60')).toBeInTheDocument();
  });

  it('should give the remove button an aria-label of "Remove Method filter"', () => {
    render(<ActiveFilterBadge label='Method' value='V60' onRemove={vi.fn()} />);
    expect(screen.getByLabelText('Remove Method filter')).toBeInTheDocument();
  });

  it('should call onRemove when the ✕ button is clicked', async () => {
    const onRemove = vi.fn();
    render(<ActiveFilterBadge label='Method' value='V60' onRemove={onRemove} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Remove Method filter'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
