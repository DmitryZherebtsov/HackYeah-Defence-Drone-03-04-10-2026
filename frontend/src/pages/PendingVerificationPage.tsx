import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Clock, RefreshCw, LogOut, ShieldAlert, Mail } from 'lucide-react';
import api from '../services/api';

export const PendingVerificationPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setCheckMessage(null);

    try {
      // Chroniony endpoint floty odpowiada 403, dopóki konto nie zostanie zweryfikowane
      const res = await api.get('/drones');
      if (res.status === 200) {
        setCheckMessage('Konto zostało zweryfikowane. Zaloguj się ponownie, aby zaktualizować uprawnienia.');
      }
    } catch {
      setCheckMessage('Konto nadal oczekuje na zatwierdzenie przez administratora.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#f4f7fb] dark:bg-slate-950 transition-colors">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 text-center space-y-6 transition-colors">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shadow-xs">
          <Clock className="h-8 w-8 animate-pulse" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Konto oczekuje na weryfikację</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Witaj <span className="font-bold text-slate-800 dark:text-slate-200">{user?.firstName} {user?.lastName}</span>! Ze względów bezpieczeństwa koordynacji kryzysowej, nowe konta muszą zostać zweryfikowane przez Administratora.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 text-xs text-slate-600 text-left space-y-2">
          <div className="flex items-center gap-2 text-amber-700 font-bold">
            <ShieldAlert className="h-4 w-4" />
            <span>Co się teraz dzieje?</span>
          </div>
          <p className="leading-relaxed">
            Administrator Twojej organizacji lub platformy otrzymał zgłoszenie i zweryfikuje Twoją tożsamość. Po akceptacji uzyskasz pełny dostęp do Centrum Dowodzenia C2 i floty dronów.
          </p>
          <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-slate-500">
            <Mail className="h-3.5 w-3.5" />
            <span>Zalogowany jako: <strong className="text-slate-800">{user?.email}</strong></span>
          </div>
        </div>

        {checkMessage && (
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
            {checkMessage}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-xs font-bold transition shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
            <span>Sprawdź status weryfikacji</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 text-xs font-bold transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Wyloguj się</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingVerificationPage;
