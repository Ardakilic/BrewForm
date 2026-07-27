import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState.tsx';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message='Nothing here' />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('uses the standard centered py-12 wrapper with tertiary text', () => {
    const { container } = render(<EmptyState message='Nothing here' />);
    const wrapper = container.querySelector('.text-center.py-12') as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.style.color).toBe('var(--text-tertiary)');
  });

  it('renders the message in a <p>', () => {
    const { container } = render(<EmptyState message='Nothing here' />);
    expect(container.querySelector('p')?.textContent).toBe('Nothing here');
  });

  it('renders an optional action beneath the message', () => {
    render(<EmptyState message='Nothing here' action={<button type='button'>Clear</button>} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('adds mb-2 to the message only when an action is present', () => {
    const { container, rerender } = render(<EmptyState message='m' />);
    expect(container.querySelector('p')?.classList.contains('mb-2')).toBe(false);
    rerender(<EmptyState message='m' action={<button type='button'>a</button>} />);
    expect(container.querySelector('p')?.classList.contains('mb-2')).toBe(true);
  });
});
