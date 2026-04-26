import { Navigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RequireAuth({ children, requireAdmin }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-lg" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (requireAdmin && !user?.isAdmin) return <Navigate to="/" />;
  return <>{children}</>;
}