/**
 * BrewForm App Component
 * Main routing and layout
 */

import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useStyletron } from 'baseui';

import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

// Lazy load pages for better performance
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const RecipesPage = lazy(() => import('./pages/recipes/RecipesPage'));
const RecipeDetailPage = lazy(() => import('./pages/recipes/RecipeDetailPage'));
const CreateRecipePage = lazy(() => import('./pages/recipes/CreateRecipePage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/profile/SettingsPage'));
const UserPage = lazy(() => import('./pages/users/UserPage'));
const ComparePage = lazy(() => import('./pages/compare/ComparePage'));
const NotFoundPage = lazy(() => import('./pages/errors/NotFoundPage'));
const ErrorPage = lazy(() => import('./pages/errors/ErrorPage'));

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/DashboardPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AdminRecipesPage = lazy(() => import('./pages/admin/RecipesPage'));
const AdminEquipmentPage = lazy(() => import('./pages/admin/EquipmentPage'));

function App() {
  const [css] = useStyletron();

  return (
    <div
      className={css({
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      <Suspense fallback={<LoadingSpinner fullScreen />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            
            {/* Auth routes */}
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="verify-email" element={<VerifyEmailPage />} />
            
            {/* Recipe routes */}
            <Route path="recipes" element={<RecipesPage />} />
            <Route path="recipes/:slug" element={<RecipeDetailPage />} />
            <Route
              path="recipes/new"
              element={
                <ProtectedRoute>
                  <CreateRecipePage />
                </ProtectedRoute>
              }
            />
            
            {/* User routes */}
            <Route path="@:username" element={<UserPage />} />
            
            {/* Compare route */}
            <Route path="compare/:token" element={<ComparePage />} />
            
            {/* Protected routes */}
            <Route
              path="profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            
            {/* Admin routes */}
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <AdminRoute>
                  <AdminUsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/recipes"
              element={
                <AdminRoute>
                  <AdminRecipesPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/equipment"
              element={
                <AdminRoute>
                  <AdminEquipmentPage />
                </AdminRoute>
              }
            />
            
            {/* Error routes */}
            <Route path="error" element={<ErrorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
