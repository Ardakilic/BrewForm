import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './Field.tsx';

describe('Field', () => {
  it('renders the label and children', () => {
    render(
      <Field label='Name'>
        <input type='text' />
      </Field>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('associates the label with the wrapped control implicitly', () => {
    render(
      <Field label='Name'>
        <input type='text' />
      </Field>,
    );
    expect(screen.getByLabelText('Name')).toBeInstanceOf(HTMLInputElement);
  });

  it('appends the required marker when required', () => {
    render(
      <Field label='Name' required>
        <input type='text' />
      </Field>,
    );
    expect(screen.getByLabelText('Name *')).toBeInTheDocument();
  });

  it('supports explicit htmlFor/id association', () => {
    render(
      <Field label='Email' htmlFor='email'>
        <input id='email' type='email' />
      </Field>,
    );
    const label = screen.getByText('Email').closest('label');
    expect(label?.htmlFor).toBe('email');
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement);
  });

  it('renders error text with the error color', () => {
    const { container } = render(
      <Field label='Email' error='Invalid email'>
        <input type='email' />
      </Field>,
    );
    const error = screen.getByText('Invalid email');
    expect(error.style.color).toBe('var(--error)');
    expect(error.className).toContain('text-xs');
    expect(error.className).toContain('mt-1');
    expect(container.querySelector('label')?.textContent).toContain('Invalid email');
  });

  it('renders help text with tertiary color', () => {
    render(
      <Field label='Password' help='At least 8 characters'>
        <input type='password' />
      </Field>,
    );
    const help = screen.getByText('At least 8 characters');
    expect(help.style.color).toBe('var(--text-tertiary)');
    expect(help.className).toContain('text-xs');
  });

  it('renders no error/help nodes when the props are absent', () => {
    const { container } = render(
      <Field label='Name'>
        <input type='text' />
      </Field>,
    );
    expect(container.querySelectorAll('label > span').length).toBe(1);
  });
});
