import { Navigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { PageSkeleton } from '../ui/Skeleton.tsx';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RequireAuth({ children, requireAdmin }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <PageSkeleton />;
  }
  if (!isAuthenticated) return <Navigate to='/login' />;
  if (requireAdmin && !user?.isAdmin) return <Navigate to='/' />;
  return <>{children}</>;
}
