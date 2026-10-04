import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, AlertCircle, ArrowRight, ShieldCheck, ShieldAlert } from 'lucide-react';

export const LoginPage: React.FC = () => {
  // Konto demonstracyjne koordynatora wpisane z góry – wystarczy kliknąć „Zaloguj”
  const [email, setEmail] = useState('koordynator.klodzko@samorzad.pl');
  const [password, setPassword] = useState('koord123');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userObj = JSON.parse(storedUser);
        if (!userObj.isVerified) {
          navigate('/pending');
          return;
        }
        if (userObj.role === 'admin') {
          navigate('/admin');
          return;
        }
      }
      navigate(from, { replace: true });
    } else {
      setErrorMessage(result.message || 'Błędny email lub hasło.');
    }
  };

  const fillCredentials = (testEmail: string, testPass: string) => {
    setEmail(testEmail);
    setPassword(testPass);
    setErrorMessage('');
  };

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#f4f7fb] dark:bg-slate-950 transition-colors">
      <div className="w-full max-w-md space-y-6">
        {/* Karta formularza */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 transition-colors">
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mb-4 shadow-xs">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Logowanie do systemu</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Wprowadź swoje dane, aby uzyskać dostęp do panelu operacyjnego systemu
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 border border-red-200 text-red-700 text-xs">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Adres E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="twoj.email@organizacja.pl"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-3 pl-10 pr-4 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Hasło
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-3 pl-10 pr-4 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3.5 text-xs sm:text-sm font-bold text-white shadow-sm shadow-indigo-600/25 disabled:opacity-50 transition transform active:scale-[0.99]"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>Logowanie...</span>
                </>
              ) : (
                <>
                  <span>Zaloguj się</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Nie masz jeszcze konta?{' '}
            <Link to="/register" className="font-bold text-indigo-600 hover:underline">
              Zarejestruj się
            </Link>
          </div>
        </div>

        {/* Panel szybkiego testowania kont demo */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs text-xs space-y-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Konta testowe (kliknij, aby wypełnić):</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillCredentials('admin@koordynacja.local', 'admin123')}
              className="rounded-xl bg-slate-50 hover:bg-slate-100 p-2.5 text-left border border-slate-200 transition"
            >
              <div className="font-bold text-amber-700">👑 Admin</div>
              <div className="text-slate-500 truncate text-[11px]">admin@koordynacja.local</div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('koordynator.klodzko@samorzad.pl', 'koord123')}
              className="rounded-xl bg-slate-50 hover:bg-slate-100 p-2.5 text-left border border-slate-200 transition"
            >
              <div className="font-bold text-teal-700">🎯 Koordynator</div>
              <div className="text-slate-500 truncate text-[11px]">koordynator.klodzko...</div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('jan.strazak@osp.pl', 'haslo123')}
              className="rounded-xl bg-slate-50 hover:bg-slate-100 p-2.5 text-left border border-slate-200 transition"
            >
              <div className="font-bold text-emerald-700">🚒 Członek (OSP)</div>
              <div className="text-slate-500 truncate text-[11px]">jan.strazak@osp.pl</div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials('anna.nowak@ngo.pl', 'haslo123')}
              className="rounded-xl bg-slate-50 hover:bg-slate-100 p-2.5 text-left border border-slate-200 transition"
            >
              <div className="font-bold text-purple-700">⏳ Niezweryfikowany</div>
              <div className="text-slate-500 truncate text-[11px]">anna.nowak@ngo.pl</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
