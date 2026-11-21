import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { StatCards } from './StatCards.tsx';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderCards(props: React.ComponentProps<typeof StatCards>, locale: 'en' | 'tr' = 'en') {
  localStorage.setItem('brewform_locale', locale);
  return render(
    <I18nProvider>
      <StatCards {...props} />
    </I18nProvider>,
  );
}

/**
 * StatCards — horizontal strip of brew-stat cards (dose, yield, time,
 * ratio, temperature, TDS/extraction yield) built by `buildStatCards`
 * and formatted for the given unit system. Labels come from the i18n
 * bundle (`recipe.stat.dose` → "DOSE", etc.).
 */
describe('StatCards', () => {
  it('renders the five base card labels when all values are present (metric)', () => {
    renderCards({
      version: {
        groundWeightGrams: 18,
        extractionVolumeMl: 250,
        extractionTimeSeconds: 30,
        brewRatio: 14,
        temperatureCelsius: 93,
        tds: null,
      },
      unitSystem: 'metric',
    });
    expect(screen.getByText('DOSE')).toBeInTheDocument();
    expect(screen.getByText('YIELD')).toBeInTheDocument();
    expect(screen.getByText('TIME')).toBeInTheDocument();
    expect(screen.getByText('RATIO')).toBeInTheDocument();
    expect(screen.getByText('TEMP')).toBeInTheDocument();
  });

  it('displays the dose value formatted in grams (metric)', () => {
    renderCards({
      version: {
        groundWeightGrams: 18,
        extractionVolumeMl: null,
        extractionTimeSeconds: null,
        brewRatio: null,
        temperatureCelsius: null,
        tds: null,
      },
      unitSystem: 'metric',
    });
    expect(screen.getByText('18.0 g')).toBeInTheDocument();
  });

  it('displays the yield value formatted in ml (metric)', () => {
    renderCards({
      version: {
        groundWeightGrams: null,
        extractionVolumeMl: 250,
        extractionTimeSeconds: null,
        brewRatio: null,
        temperatureCelsius: null,
        tds: null,
      },
      unitSystem: 'metric',
    });
    expect(screen.getByText('250 ml')).toBeInTheDocument();
  });

  it('displays the time value with an "s" suffix', () => {
    renderCards({
      version: {
        groundWeightGrams: null,
        extractionVolumeMl: null,
        extractionTimeSeconds: 27,
        brewRatio: null,
        temperatureCelsius: null,
        tds: null,
      },
    });
    expect(screen.getByText('27s')).toBeInTheDocument();
  });

  it('displays the ratio value as 1:N', () => {
    renderCards({
      version: {
        groundWeightGrams: null,
        extractionVolumeMl: null,
        extractionTimeSeconds: null,
        brewRatio: 15,
        temperatureCelsius: null,
        tds: null,
      },
    });
    expect(screen.getByText('1:15')).toBeInTheDocument();
  });

  it('displays the temperature in celsius (metric)', () => {
    renderCards({
      version: {
        groundWeightGrams: null,
        extractionVolumeMl: null,
        extractionTimeSeconds: null,
        brewRatio: null,
        temperatureCelsius: 92,
        tds: null,
      },
      unitSystem: 'metric',
    });
    expect(screen.getByText('92.0°C')).toBeInTheDocument();
  });

  it('shows em-dash placeholders when version is null', () => {
    renderCards({ version: null, unitSystem: 'metric' });
    expect(screen.getByText('—g')).toBeInTheDocument();
    expect(screen.getByText('—ml')).toBeInTheDocument();
    expect(screen.getByText('—s')).toBeInTheDocument();
    expect(screen.getByText('1:—')).toBeInTheDocument();
    expect(screen.getByText('—°C')).toBeInTheDocument();
  });

  it('appends an extraction-yield card when tds, volume, and dose are all present', () => {
    renderCards({
      version: {
        groundWeightGrams: 18,
        extractionVolumeMl: 250,
        extractionTimeSeconds: 30,
        brewRatio: 14,
        temperatureCelsius: 93,
        tds: '1.4',
      },
      unitSystem: 'metric',
    });
    // The "EY" label is the i18n translation of recipe.stat.extractionYield
    expect(screen.getByText('EY')).toBeInTheDocument();
    // extraction yield = tds * yield / dose = 1.4 * 250 / 18 ≈ 19.4%
    expect(screen.getByText('19.4%')).toBeInTheDocument();
  });

  it('does NOT append an extraction-yield card when tds is missing', () => {
    renderCards({
      version: {
        groundWeightGrams: 18,
        extractionVolumeMl: 250,
        extractionTimeSeconds: 30,
        brewRatio: 14,
        temperatureCelsius: 93,
        tds: null,
      },
    });
    expect(screen.queryByText('EY')).not.toBeInTheDocument();
  });

  it('formats dose in ounces when unitSystem is imperial', () => {
    renderCards({
      version: {
        groundWeightGrams: 18,
        extractionVolumeMl: null,
        extractionTimeSeconds: null,
        brewRatio: null,
        temperatureCelsius: null,
        tds: null,
      },
      unitSystem: 'imperial',
    });
    // 18g ≈ 0.6 oz (formatWeight uses a space)
    expect(screen.getByText('0.6 oz')).toBeInTheDocument();
  });
});

describe('StatCards — locale-aware values (wave-6 t6)', () => {
  const longBrew = {
    groundWeightGrams: 100,
    extractionVolumeMl: 500,
    extractionTimeSeconds: 43200,
    brewRatio: 2.2222223,
    temperatureCelsius: 20,
    tds: null,
  };

  it('shows 12h and 1:2.2 in en (never 43200s or the unrounded ratio)', () => {
    renderCards({ version: longBrew, unitSystem: 'metric' }, 'en');
    expect(screen.getByText('12h')).toBeInTheDocument();
    expect(screen.getByText('1:2.2')).toBeInTheDocument();
    expect(screen.queryByText('43200s')).not.toBeInTheDocument();
    expect(screen.queryByText(/2\.2222/)).not.toBeInTheDocument();
  });

  it('shows 12 sa and 1:2,2 in tr', () => {
    renderCards({ version: longBrew, unitSystem: 'metric' }, 'tr');
    expect(screen.getByText('12 sa')).toBeInTheDocument();
    expect(screen.getByText('1:2,2')).toBeInTheDocument();
  });
});
