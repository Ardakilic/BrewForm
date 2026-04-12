/**
 * BrewForm Web Application
 * Main entry point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Client as Styletron } from 'styletron-engine-monolithic';
import { Provider as StyletronProvider } from 'styletron-react';
import { BaseProvider } from 'baseui';
import { SnackbarProvider } from 'baseui/snackbar';
import { I18nextProvider } from 'react-i18next';

import App from './App.tsx';
import { ThemeProvider, useTheme } from './contexts/ThemeContext.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import i18n from './i18n/index.ts';
import './styles/global.css';

const engine = new Styletron();

/**
 * Inner app wrapper that uses theme context and applies background to document
 */
function ThemedApp() {
  const { theme } = useTheme();

  // Apply theme background color to document body
  React.useEffect(() => {
    document.body.style.backgroundColor = theme.colors.backgroundPrimary;
    document.body.style.color = theme.colors.contentPrimary;
    document.documentElement.style.backgroundColor = theme.colors.backgroundPrimary;
  }, [theme.colors.backgroundPrimary, theme.colors.contentPrimary]);

  return (
    <BaseProvider theme={theme}>
      <SnackbarProvider
        placement='topRight'
        overrides={{
          Root: { style: { zIndex: 9999, marginTop: '70px' } },
          PlacementContainer: { style: { zIndex: 9999 } },
          Content: {
            style: {
              backgroundColor: theme.colors.backgroundSecondary,
              color: theme.colors.contentPrimary,
            },
          },
          Message: { style: { color: theme.colors.contentPrimary } },
        }}
      >
        <App />
      </SnackbarProvider>
    </BaseProvider>
  );
}

/**
 * Root application with all providers
 */
function Root() {
  return (
    <React.StrictMode>
      <HelmetProvider>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter>
            <StyletronProvider value={engine}>
              <ThemeProvider>
                <AuthProvider>
                  <ThemedApp />
                </AuthProvider>
              </ThemeProvider>
            </StyletronProvider>
          </BrowserRouter>
        </I18nextProvider>
      </HelmetProvider>
    </React.StrictMode>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<Root />);
}
