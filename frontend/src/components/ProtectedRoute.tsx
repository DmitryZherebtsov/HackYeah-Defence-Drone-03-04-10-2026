import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactElement;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Podczas ładowania stanu początkowego wyświetlamy spinner/loader
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
          <p className="text-slate-400 text-sm">Weryfikacja uprawnień sesji...</p>
        </div>
      </div>
    );
  }

  // 1. Jeśli użytkownik jest niezalogowany -> przekierowanie do /login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Jeśli użytkownik nie jest zweryfikowany (isVerified === false) -> przekierowanie do /pending
  if (!user.isVerified) {
    return <Navigate to="/pending" replace />;
  }

  // 3. Jeśli trasa wymaga uprawnień administratora, a użytkownik nie ma roli 'admin'
  if (requireAdmin && user.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md rounded-2xl bg-slate-800/80 p-8 text-center border border-red-500/20 shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Brak uprawnień</h2>
          <p className="text-slate-400 text-sm mb-6">
            Dostęp do tego panelu jest zarezerwowany wyłącznie dla użytkowników z rolą Administratora.
          </p>
          <a
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition"
          >
            Wróć do strony głównej
          </a>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
