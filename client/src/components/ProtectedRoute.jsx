import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Wraps a route to require authentication.
 * Shows loading spinner while checking auth, redirects to home if not logged in.
 * Saves the intended destination in a `returnTo` query param so the sign-in
 * flow can redirect the user back after authentication.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-pov-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    // Encode current path so the user can be sent back after sign-in
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?returnTo=${returnTo}`} replace />;
  }

  return children;
}
