import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSelector } from './LanguageSelector.tsx';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LanguageSelector', () => {
  const setLocale = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders flag emoji + language name for each locale option', async () => {
    render(
      <LanguageSelector
        locale='en'
        setLocale={setLocale}
        availableLocales={['en', 'tr']}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    expect(await screen.findByRole('option', { name: '🇬🇧 English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '🇹🇷 Türkçe' })).toBeInTheDocument();
  });

  it('calls setLocale when a different language is selected', async () => {
    render(
      <LanguageSelector
        locale='en'
        setLocale={setLocale}
        availableLocales={['en', 'tr']}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    const option = await screen.findByRole('option', { name: '🇹🇷 Türkçe' });
    await userEvent.click(option);

    expect(setLocale).toHaveBeenCalledWith('tr');
  });

  it('renders nothing when availableLocales is empty', () => {
    const { container } = render(
      <LanguageSelector
        locale='en'
        setLocale={setLocale}
        availableLocales={[]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('displays currently active locale in trigger', () => {
    render(
      <LanguageSelector
        locale='tr'
        setLocale={setLocale}
        availableLocales={['en', 'tr']}
      />,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('🇹🇷 Türkçe');
  });
});
