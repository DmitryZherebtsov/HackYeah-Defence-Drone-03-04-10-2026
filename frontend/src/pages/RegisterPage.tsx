import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Organization, UserRole } from '../types';
import {
  UserPlus,
  Mail,
  Lock,
  Phone,
  Building2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [role, setRole] = useState<UserRole>('czlonek');

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await api.get('/organizations');
        if (response.data.success && Array.isArray(response.data.data)) {
          setOrganizations(response.data.data);
          if (response.data.data.length > 0) {
            setOrganizationId(response.data.data[0].id);
          }
        }
      } catch (error) {
        console.error('Błąd podczas pobierania organizacji:', error);
        setErrorMessage('Nie udało się pobrać listy organizacji. Upewnij się, że backend jest uruchomiony.');
      } finally {
        setIsLoadingOrgs(false);
      }
    };

    fetchOrganizations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!organizationId) {
      setErrorMessage('Wybierz organizację, do której należysz.');
      return;
    }

    setIsSubmitting(true);

    const result = await register({
      firstName,
      lastName,
      email,
      password,
      phone,
      organizationId,
      role,
    });

    setIsSubmitting(false);

    if (result.success) {
      setSuccessMessage(
        result.message ||
          'Konto zostało utworzone! Twoje zgłoszenie oczekuje na weryfikację przez administratora.'
      );
    } else {
      setErrorMessage(result.message || 'Wystąpił błąd podczas rejestracji.');
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#f4f7fb] dark:bg-slate-950 transition-colors">
      <div className="w-full max-w-lg space-y-6">
        <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 transition-colors">
          <div className="text-center mb-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mb-4 shadow-xs">
              <UserPlus className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Dołącz do platformy</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Zarejestruj konto członka organizacji ratunkowej, straży lub samorządu
            </p>
          </div>

          {/* Komunikat o sukcesie */}
          {successMessage ? (
            <div className="rounded-2xl bg-emerald-50 p-6 border border-emerald-200 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-1">Rejestracja zakończona</h3>
                <p className="text-xs text-emerald-800">{successMessage}</p>
              </div>
              <div className="p-3 bg-white rounded-xl text-xs text-slate-600 text-left border border-emerald-100 flex items-start gap-2 shadow-xs">
                <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Administrator otrzymał powiadomienie o Twojej rejestracji. Po zaakceptowaniu konta uzyskasz pełny dostęp do systemu.
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-xs font-bold transition shadow-sm"
              >
                <span>Przejdź do logowania</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="mb-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 border border-red-200 text-red-700 text-xs">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">{errorMessage}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      Imię
                    </label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jan"
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2.5 px-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      Nazwisko
                    </label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Kowalski"
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2.5 px-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition"
                    />
                  </div>
                </div>

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
                      placeholder="jan.kowalski@osp.pl"
                      className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      Hasło
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 6 znaków"
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                      Telefon kontaktowy
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+48 500 100 200"
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Wybór organizacji */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Organizacja / Jednostka
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <select
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                      disabled={isLoadingOrgs}
                      required
                      className="w-full appearance-none rounded-xl bg-slate-50 border border-slate-200 py-2.5 pl-10 pr-8 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs sm:text-sm transition font-medium"
                    >
                      {isLoadingOrgs ? (
                        <option value="">Ładowanie organizacji...</option>
                      ) : organizations.length === 0 ? (
                        <option value="">Brak dostępnych organizacji</option>
                      ) : (
                        organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name} ({org.type.toUpperCase()}) {org.municipality ? `– ${org.municipality.name}` : ''}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                      ▼
                    </div>
                  </div>
                </div>

                {/* Rola w systemie */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Wnioskowana rola
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['czlonek', 'koordynator', 'admin'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`rounded-xl py-2 px-3 text-xs font-bold capitalize border transition ${
                          role === r
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isLoadingOrgs}
                  className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3.5 text-xs sm:text-sm font-bold text-white shadow-sm shadow-indigo-600/25 disabled:opacity-50 transition transform active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      <span>Rejestrowanie...</span>
                    </>
                  ) : (
                    <>
                      <span>Wyślij zgłoszenie rejestracji</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center text-xs text-slate-500">
                Masz już konto?{' '}
                <Link to="/login" className="font-bold text-indigo-600 hover:underline">
                  Zaloguj się
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
