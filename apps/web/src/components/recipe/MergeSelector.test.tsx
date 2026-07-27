import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MergeSelector } from './MergeSelector.tsx';

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: () => {},
    availableLocales: ['en', 'tr'],
  }),
}));

const fields = [
  { key: 'brewMethod', labelKey: 'recipe.brewMethod', value1: 'espresso', value2: 'v60' },
  { key: 'groundWeightGrams', labelKey: 'recipe.dose', value1: 18, value2: 15 },
];

describe('MergeSelector', () => {
  it('renders two radio buttons per field', () => {
    render(<MergeSelector fields={fields} onMerge={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('calls onMerge with the selections on button click', () => {
    const onMerge = vi.fn();
    render(<MergeSelector fields={fields} onMerge={onMerge} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]);
    fireEvent.click(radios[3]);
    fireEvent.click(screen.getByText('merge.create'));
    expect(onMerge).toHaveBeenCalledWith({ brewMethod: 'v1', groundWeightGrams: 'v2' });
  });

  it('calls onMerge with an empty object when nothing is selected', () => {
    const onMerge = vi.fn();
    render(<MergeSelector fields={fields} onMerge={onMerge} />);
    fireEvent.click(screen.getByText('merge.create'));
    expect(onMerge).toHaveBeenCalledWith({});
  });
});
