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
import { I18nextProvider } from 'react-i18next';

import App from './App';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import i18n from './i18n';
import './styles/global.css';

const engine = new Styletron();

/**
 * Inner app wrapper that uses theme context
 */
function ThemedApp() {
  const { theme } = useTheme();

  return (
    <BaseProvider theme={theme}>
      <App />
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
