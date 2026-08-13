import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrewLogForm, type BrewLogFormValues } from './BrewLogForm.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'brewLog.form.brewedAt': 'Brewed At',
    'brewLog.form.yieldActual': 'Yield (g)',
    'brewLog.form.yieldActual.placeholder': 'e.g. 36',
    'brewLog.form.doseActual': 'Dose (g)',
    'brewLog.form.doseActual.placeholder': 'e.g. 18',
    'brewLog.form.notes': 'Notes',
    'brewLog.form.notes.placeholder': 'Grind setting, taste impressions...',
    'brewLog.form.personalRating': 'Personal Rating',
    'brewLog.form.error.positive': 'Must be a positive number.',
    'brewLog.form.error.ratingRange': 'Rating must be between 1 and 10.',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Helpers ────────────────────────────────────────────────────────────────

const initialValues: BrewLogFormValues = {
  brewedAt: '2026-03-15T09:30:00Z',
  yieldActual: 36,
  doseActual: 18,
  notes: 'Sweet',
  personalRating: 8,
};

function renderForm() {
  const onSubmit = vi.fn<(values: BrewLogFormValues) => Promise<void>>();
  render(<BrewLogForm initialValues={initialValues} onSubmit={onSubmit} submitLabel='Save' />);
  return onSubmit;
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BrewLogForm', () => {
  it('prefills all fields from initialValues', () => {
    renderForm();

    expect((screen.getByLabelText('Yield (g)') as HTMLInputElement).value).toBe('36');
    expect((screen.getByLabelText('Dose (g)') as HTMLInputElement).value).toBe('18');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Sweet');
    expect((screen.getByLabelText('Personal Rating') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('Brewed At *') as HTMLInputElement).value).toMatch(
      /2026-03-15T/,
    );
  });

  it('submits parsed values with brewedAt as an ISO string', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0];
    expect(values.yieldActual).toBe(36);
    expect(values.doseActual).toBe(18);
    expect(values.notes).toBe('Sweet');
    expect(values.personalRating).toBe(8);
    expect(new Date(values.brewedAt).toISOString()).toBe(values.brewedAt);
  });

  it('submits null for cleared optional fields', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Yield (g)'));
    await user.clear(screen.getByLabelText('Notes'));
    await user.clear(screen.getByLabelText('Personal Rating'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const values = onSubmit.mock.calls[0][0];
    expect(values.yieldActual).toBeNull();
    expect(values.notes).toBeNull();
    expect(values.personalRating).toBeNull();
  });

  it('rejects a zero yield with the positive-number error', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Yield (g)'));
    await user.type(screen.getByLabelText('Yield (g)'), '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Must be a positive number.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submission of a rating outside 1-10 (native min/max)', async () => {
    const onSubmit = renderForm();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Personal Rating'));
    await user.type(screen.getByLabelText('Personal Rating'), '11');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires brewedAt', () => {
    renderForm();

    expect(screen.getByLabelText('Brewed At *')).toBeRequired();
  });

  it('resets all fields when initialValues change', async () => {
    const onSubmit = vi.fn<(values: BrewLogFormValues) => Promise<void>>();
    const { rerender } = render(
      <BrewLogForm initialValues={initialValues} onSubmit={onSubmit} submitLabel='Save' />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Notes'), ' and more');

    const next: BrewLogFormValues = {
      brewedAt: '2026-04-01T12:00:00Z',
      yieldActual: 40,
      doseActual: 20,
      notes: 'Bitter',
      personalRating: 5,
    };
    rerender(<BrewLogForm initialValues={next} onSubmit={onSubmit} submitLabel='Save' />);

    expect((screen.getByLabelText('Yield (g)') as HTMLInputElement).value).toBe('40');
    expect((screen.getByLabelText('Dose (g)') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Bitter');
    expect((screen.getByLabelText('Personal Rating') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Brewed At *') as HTMLInputElement).value).toMatch(/2026-04-01T/);
  });
});
