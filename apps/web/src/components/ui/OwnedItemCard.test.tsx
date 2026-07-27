import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnedItemCard } from './OwnedItemCard.tsx';

describe('OwnedItemCard', () => {
  it('renders the title', () => {
    render(<OwnedItemCard title='My Beans' onDelete={() => {}} deleteLabel='Delete' />);
    expect(screen.getByText('My Beans')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <OwnedItemCard
        title='Ethiopia Yirgacheffe'
        subtitle={<p>Acme Coffee</p>}
        onDelete={() => {}}
        deleteLabel='Delete'
      />,
    );
    expect(screen.getByText('Acme Coffee')).toBeInTheDocument();
  });

  it('renders meta content when provided', () => {
    render(
      <OwnedItemCard
        title='Test'
        meta={<span>Washed</span>}
        onDelete={() => {}}
        deleteLabel='Delete'
      />,
    );
    expect(screen.getByText('Washed')).toBeInTheDocument();
  });

  it('does not render meta container when meta is absent', () => {
    const { container } = render(
      <OwnedItemCard title='Test' onDelete={() => {}} deleteLabel='Delete' />,
    );
    expect(container.querySelector('.flex.gap-2')).toBeNull();
  });

  it('calls onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    let deleted = false;
    render(<OwnedItemCard title='Test' onDelete={() => deleted = true} deleteLabel='Remove' />);
    await user.click(screen.getByText('Remove'));
    expect(deleted).toBe(true);
  });

  it('renders delete button with error color', () => {
    render(<OwnedItemCard title='Test' onDelete={() => {}} deleteLabel='Delete' />);
    const btn = screen.getByText('Delete');
    expect(btn.style.color).toBe('var(--error)');
  });
});
