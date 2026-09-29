import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Role } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';

export function FullPageSpinner() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <span className="spinner" aria-label="Loading" />
    </div>
  );
}

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { me, loading, leaving } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageSpinner />;
  // Just logged out from inside the app: go home, not to the login page.
  if (!me && leaving) return <Navigate to="/" replace />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  // New accounts confirm their email before using the app.
  if (!me.user.emailVerified) return <Navigate to={`/verify-email?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (roles && !roles.includes(me.user.role)) return <Navigate to={homeFor(me.user.role)} replace />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (me) return <Navigate to={me.user.emailVerified ? homeFor(me.user.role) : '/verify-email'} replace />;
  return <>{children}</>;
}
