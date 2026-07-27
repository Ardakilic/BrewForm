import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState } from './ErrorState.tsx';

describe('ErrorState', () => {
  it('renders the message with role=alert', () => {
    render(<ErrorState message='Something went wrong' />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
  });

  it('is themed via the --error-bg and --error CSS variables', () => {
    render(<ErrorState message='boom' />);
    const alert = screen.getByRole('alert');
    expect(alert.style.backgroundColor).toBe('var(--error-bg)');
    expect(alert.style.color).toBe('var(--error)');
  });

  it('uses the standard rounded p-3 text-sm banner classes', () => {
    render(<ErrorState message='boom' />);
    const alert = screen.getByRole('alert');
    expect(alert.classList.contains('rounded')).toBe(true);
    expect(alert.classList.contains('p-3')).toBe(true);
    expect(alert.classList.contains('text-sm')).toBe(true);
  });

  it('renders a single-line message as plain text', () => {
    render(<ErrorState message='boom' />);
    const alert = screen.getByRole('alert');
    expect(alert.querySelector('ul')).toBeNull();
    expect(alert.textContent).toBe('boom');
  });

  it('renders a newline-separated message as a bulleted list', () => {
    const message = 'first failure\nsecond failure';
    render(<ErrorState message={message} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('first failure');
    expect(items[1]).toHaveTextContent('second failure');
  });

  it('skips empty lines in multi-line messages', () => {
    const message = 'a\n\nb\n';
    render(<ErrorState message={message} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('appends extra classes for spacing', () => {
    render(<ErrorState message='boom' className='mb-4' />);
    expect(screen.getByRole('alert').classList.contains('mb-4')).toBe(true);
  });
});
