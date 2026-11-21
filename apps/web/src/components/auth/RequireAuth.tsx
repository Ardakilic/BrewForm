import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { loginPathFor } from '../../utils/safe-next.ts';
import { PageSkeleton } from '../ui/Skeleton.tsx';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

/**
 * Render-time guard for routes whose loaders call only public endpoints. Redirects a
 * signed-out user to `/login?next=<encoded pathname+search>` and a non-admin on an admin
 * route to `/`, both with `replace` so Back does not return to the guarded page. Shows a
 * page skeleton while auth state loads.
 */
export function RequireAuth({ children, requireAdmin }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <PageSkeleton />;
  }
  if (!isAuthenticated) {
    return <Navigate to={loginPathFor(location.pathname, location.search)} replace />;
  }
  if (requireAdmin && !user?.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
