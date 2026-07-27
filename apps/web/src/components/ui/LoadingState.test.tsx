import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingState } from './LoadingState.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';

function renderLoading(props: Parameters<typeof LoadingState>[0] = {}) {
  return render(
    <I18nProvider>
      <LoadingState {...props} />
    </I18nProvider>,
  );
}

describe('LoadingState', () => {
  it('renders the default common.loading label', () => {
    renderLoading();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('uses the standard centered py-12 wrapper with secondary text', () => {
    const { container } = renderLoading();
    const wrapper = container.querySelector('.text-center.py-12') as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.style.color).toBe('var(--text-secondary)');
  });

  it('honours a custom message override', () => {
    renderLoading({ message: 'Loading stats...' });
    expect(screen.getByText('Loading stats...')).toBeInTheDocument();
  });

  it('appends extra className to the wrapper', () => {
    const { container } = renderLoading({ className: 'mx-auto max-w-4xl' });
    const wrapper = container.querySelector('.text-center.py-12') as HTMLElement;
    expect(wrapper.classList.contains('mx-auto')).toBe(true);
    expect(wrapper.classList.contains('max-w-4xl')).toBe(true);
  });
});
