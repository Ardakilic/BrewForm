import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntensityDots } from './IntensityDots';

// ── Requirement 8.4 — IntensityDots ─────────────────────────────────────────

describe('IntensityDots', () => {
  it('always renders exactly 3 dot slots', () => {
    const { container } = render(<IntensityDots intensity={2} />);
    const dots = container.querySelectorAll('span[aria-hidden="true"]');
    expect(dots).toHaveLength(3);
  });

  it('fills 1 dot for intensity=1', () => {
    const { container } = render(<IntensityDots intensity={1} />);
    const dots = Array.from(container.querySelectorAll('span[aria-hidden="true"]')) as HTMLElement[];
    expect(dots[0].style.backgroundColor).toBe('var(--accent-primary)');
    expect(dots[1].style.backgroundColor).toBe('transparent');
    expect(dots[2].style.backgroundColor).toBe('transparent');
  });

  it('fills 2 dots for intensity=2', () => {
    const { container } = render(<IntensityDots intensity={2} />);
    const dots = Array.from(container.querySelectorAll('span[aria-hidden="true"]')) as HTMLElement[];
    expect(dots[0].style.backgroundColor).toBe('var(--accent-primary)');
    expect(dots[1].style.backgroundColor).toBe('var(--accent-primary)');
    expect(dots[2].style.backgroundColor).toBe('transparent');
  });

  it('fills all 3 dots for intensity=3', () => {
    const { container } = render(<IntensityDots intensity={3} />);
    const dots = Array.from(container.querySelectorAll('span[aria-hidden="true"]')) as HTMLElement[];
    expect(dots[0].style.backgroundColor).toBe('var(--accent-primary)');
    expect(dots[1].style.backgroundColor).toBe('var(--accent-primary)');
    expect(dots[2].style.backgroundColor).toBe('var(--accent-primary)');
  });

  it('empty dots have a muted border and transparent background', () => {
    const { container } = render(<IntensityDots intensity={1} />);
    const dots = Array.from(container.querySelectorAll('span[aria-hidden="true"]')) as HTMLElement[];
    // dots[1] and dots[2] are empty
    for (const dot of [dots[1], dots[2]]) {
      expect(dot.style.border).toBe('1px solid var(--text-tertiary)');
      expect(dot.style.backgroundColor).toBe('transparent');
    }
  });

  it('filled dots have no border', () => {
    const { container } = render(<IntensityDots intensity={3} />);
    const dots = Array.from(container.querySelectorAll('span[aria-hidden="true"]')) as HTMLElement[];
    for (const dot of dots) {
      expect(dot.style.border).toBe('');
    }
  });

  it('each dot is 6×6px with border-radius 50%', () => {
    const { container } = render(<IntensityDots intensity={2} />);
    const dots = Array.from(container.querySelectorAll('span[aria-hidden="true"]')) as HTMLElement[];
    for (const dot of dots) {
      expect(dot.style.width).toBe('6px');
      expect(dot.style.height).toBe('6px');
      expect(dot.style.borderRadius).toBe('50%');
    }
  });

  it('dots are arranged horizontally with 2px gap', () => {
    const { container } = render(<IntensityDots intensity={1} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.display).toBe('inline-flex');
    expect(wrapper.style.gap).toBe('2px');
  });

  it('applies optional className to the wrapper', () => {
    const { container } = render(<IntensityDots intensity={1} className='my-custom-class' />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.classList.contains('my-custom-class')).toBe(true);
  });

  it('has an accessible aria-label describing the intensity', () => {
    render(<IntensityDots intensity={2} />);
    expect(screen.getByLabelText('Intensity 2 of 3')).toBeInTheDocument();
  });
});
