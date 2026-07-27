import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageContainer } from './PageContainer.tsx';

describe('PageContainer', () => {
  it('renders children', () => {
    render(<PageContainer>content</PageContainer>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('defaults to the 4xl list/detail shell', () => {
    const { container } = render(<PageContainer>c</PageContainer>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('mx-auto max-w-4xl px-6 py-8');
  });

  it.each(
    [
      ['md', 'max-w-md'],
      ['2xl', 'max-w-2xl'],
      ['4xl', 'max-w-4xl'],
      ['6xl', 'max-w-6xl'],
    ] as const,
  )('applies the %s width tier', (width, expected) => {
    const { container } = render(<PageContainer width={width}>c</PageContainer>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains(expected)).toBe(true);
    expect(wrapper.classList.contains('mx-auto')).toBe(true);
    expect(wrapper.classList.contains('px-6')).toBe(true);
    expect(wrapper.classList.contains('py-8')).toBe(true);
  });

  it('appends extra classes without dropping the shell classes', () => {
    const { container } = render(<PageContainer width='md' className='py-12'>c</PageContainer>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('mx-auto max-w-md px-6 py-8 py-12');
  });
});
