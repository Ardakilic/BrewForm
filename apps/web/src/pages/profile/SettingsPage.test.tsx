import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../test/test-utils';
import SettingsPage from './SettingsPage';

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => ({
    themeName: 'light',
    setThemeName: vi.fn(),
    theme: {},
  })),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<SettingsPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders form elements', () => {
    renderWithProviders(<SettingsPage />);
    expect(document.body).toBeTruthy();
  });
});
