import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import { router } from './router';

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}