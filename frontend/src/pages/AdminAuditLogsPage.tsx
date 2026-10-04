import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  History,
  Search,
  RotateCcw,
  User,
  ShieldCheck,
  AlertTriangle,
  Building,
  ArrowUpDown,
  CheckCircle2,
  X,
  Eye,
  Clock,
  FileText,
  Plane,
  Navigation,
  ChevronLeft,
  ChevronRight,
  AlertOctagon,
  Sparkles,
  MapPin,
  Phone,
  Mail,
  Check,
  SlidersHorizontal,
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  details: string;
  previousState?: any;
  newState?: any;
  isReverted: boolean;
  revertedAt?: string | null;
  revertedByUserId?: string | null;
  revertedByUserName?: string | null;
  createdAt: string;
}

interface AvailableUser {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  role: string;
  isVerified?: boolean;
  organizationId?: string;
  organizationName?: string;
  organizationType?: string;
  municipalityName?: string;
  createdAt?: string;
}

interface Metrics {
  totalLogs: number;
  count24h: number;
  revertedCount: number;
  activeMissionsCount: number;
}

export const AdminAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [availableOrganizations, setAvailableOrganizations] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    totalLogs: 0,
    count24h: 0,
    revertedCount: 0,
    activeMissionsCount: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeframe, setTimeframe] = useState<'all' | '24h' | '48h' | '7d' | '30d' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'userName' | 'action'>('date');
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modal wyboru Użytkownika
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalSearch, setUserModalSearch] = useState('');
  const [userModalRoleFilter, setUserModalRoleFilter] = useState('all');
  const [userModalOrgFilter, setUserModalOrgFilter] = useState('all');

  // Modal szczegółów / diff
  const [inspectingLog, setInspectingLog] = useState<AuditLogItem | null>(null);

  // Modal potwierdzenia Rollback
  const [revertingLog, setRevertingLog] = useState<AuditLogItem | null>(null);
  const [isSubmittingRevert, setIsSubmittingRevert] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    id: number;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ id, type, message });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 4500);
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params: any = {
        page: currentPage,
        limit: 25,
        sortBy,
        sortOrder,
      };

      if (selectedUserId !== 'all') params.userId = selectedUserId;
      if (actionFilter !== 'all') params.action = actionFilter;
      if (orgFilter !== 'all') params.organization = orgFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const now = new Date();
      if (timeframe === '24h') {
        params.startDate = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      } else if (timeframe === '48h') {
        params.startDate = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      } else if (timeframe === '7d') {
        params.startDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      } else if (timeframe === '30d') {
        params.startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      } else if (timeframe === 'custom') {
        if (customStartDate) params.startDate = new Date(customStartDate).toISOString();
        if (customEndDate) params.endDate = new Date(customEndDate).toISOString();
      }

      const res = await api.get('/admin/logs', { params });
      if (res.data.success) {
        setLogs(res.data.data || []);
        setTotalPages(res.data.totalPages || 1);
        setTotalCount(res.data.count || 0);
        if (res.data.availableUsers) setAvailableUsers(res.data.availableUsers);
        if (res.data.availableOrganizations) setAvailableOrganizations(res.data.availableOrganizations);
        if (res.data.metrics) setMetrics(res.data.metrics);
      }
    } catch (err: any) {
      console.error('Błąd pobierania logów audytowych:', err);
      showToast(err.response?.data?.message || 'Nie udało się pobrać historii zdarzeń.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [
    currentPage,
    selectedUserId,
    actionFilter,
    orgFilter,
    timeframe,
    customStartDate,
    customEndDate,
    sortBy,
    sortOrder,
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchLogs();
  };

  const resetFilters = () => {
    setSelectedUserId('all');
    setActionFilter('all');
    setOrgFilter('all');
    setSearchQuery('');
    setTimeframe('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSortBy('date');
    setSortOrder('DESC');
    setCurrentPage(1);
  };

  const handleConfirmRevert = async () => {
    if (!revertingLog) return;
    setIsSubmittingRevert(true);
    try {
      const res = await api.post(`/admin/logs/${revertingLog.id}/revert`);
      if (res.data.success) {
        showToast(res.data.message || 'Zmiana została pomyślnie wycofana!');
        setRevertingLog(null);
        fetchLogs();
      }
    } catch (err: any) {
      console.error('Błąd wycofywania zmiany:', err);
      showToast(err.response?.data?.message || 'Nie udało się wycofać wskazanej zmiany.', 'error');
    } finally {
      setIsSubmittingRevert(false);
    }
  };

  const selectedUserObject = useMemo(() => {
    if (selectedUserId === 'all') return null;
    return availableUsers.find((u) => u.id === selectedUserId) || null;
  }, [selectedUserId, availableUsers]);

  // Filtrowani użytkownicy w modalu
  const filteredModalUsers = useMemo(() => {
    return availableUsers.filter((u) => {
      const q = userModalSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q) ||
        u.organizationName?.toLowerCase().includes(q) ||
        u.organizationType?.toLowerCase().includes(q) ||
        u.municipalityName?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q);

      const matchesRole = userModalRoleFilter === 'all' || u.role === userModalRoleFilter;
      const matchesOrg = userModalOrgFilter === 'all' || u.organizationName === userModalOrgFilter;

      return matchesSearch && matchesRole && matchesOrg;
    });
  }, [availableUsers, userModalSearch, userModalRoleFilter, userModalOrgFilter]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'drone_created':
        return {
          label: 'Dodanie drona',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
          icon: <Plane className="h-3.5 w-3.5" />,
        };
      case 'drone_updated':
        return {
          label: 'Aktualizacja drona',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          dot: 'bg-blue-500',
          icon: <FileText className="h-3.5 w-3.5" />,
        };
      case 'mission_created':
        return {
          label: 'Utworzenie operacji',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          dot: 'bg-indigo-500',
          icon: <Navigation className="h-3.5 w-3.5" />,
        };
      case 'user_updated':
        return {
          label: 'Aktualizacja użytkownika',
          bg: 'bg-sky-50 text-sky-700 border-sky-200',
          dot: 'bg-sky-500',
          icon: <User className="h-3.5 w-3.5" />,
        };
      case 'user_deleted':
        return {
          label: 'Usunięcie użytkownika',
          bg: 'bg-red-50 text-red-700 border-red-200 font-extrabold',
          dot: 'bg-red-500',
          icon: <AlertOctagon className="h-3.5 w-3.5 text-red-600" />,
        };
      case 'user_verified':
        return {
          label: 'Weryfikacja służb',
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          icon: <ShieldCheck className="h-3.5 w-3.5" />,
        };
      case 'user_rejected':
        return {
          label: 'Odrzucenie rejestracji',
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
          icon: <AlertOctagon className="h-3.5 w-3.5" />,
        };
      case 'revert_action':
        return {
          label: 'Wycofanie zmiany (Rollback)',
          bg: 'bg-red-50 text-red-700 border-red-200',
          dot: 'bg-red-500',
          icon: <RotateCcw className="h-3.5 w-3.5" />,
        };
      default:
        return {
          label: action,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-500',
          icon: <History className="h-3.5 w-3.5" />,
        };
    }
  };

  const getEntityTypeLabel = (entityType: string) => {
    switch (entityType) {
      case 'user':
        return 'Użytkownik';
      case 'organization':
        return 'Organizacja';
      case 'drone':
        return 'Dron';
      case 'mission':
        return 'Operacja';
      default:
        return entityType;
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Brak daty';
    const d = new Date(isoString);
    return `${d.toLocaleDateString('pl-PL')} ${d.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-short">
          <div
            className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border text-sm font-semibold text-white ${
              toast.type === 'success'
                ? 'bg-emerald-600 border-emerald-500 shadow-emerald-600/30'
                : 'bg-red-600 border-red-500 shadow-red-600/30'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75 transition cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: Wyszukiwarka i Wybór Użytkownika */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 sm:p-7 space-y-5 animate-scale-up max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    Wybierz Użytkownika do Analizy Logów
                  </h3>
                  <p className="text-xs text-slate-500">
                    Wyszukaj po nazwisku, emailu, telefonie, jednostce/fundacji, roli lub dacie rejestracji
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pasek filtrów w modalu użytkownika */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 shrink-0">
              <div className="sm:col-span-6 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={userModalSearch}
                  onChange={(e) => setUserModalSearch(e.target.value)}
                  placeholder="Szukaj użytkownika, emaila, jednostki..."
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={userModalRoleFilter}
                  onChange={(e) => setUserModalRoleFilter(e.target.value)}
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 px-3 text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">Wszystkie role</option>
                  <option value="admin">Administrator</option>
                  <option value="koordynator">Koordynator</option>
                  <option value="czlonek">Członek / Ratownik</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <select
                  value={userModalOrgFilter}
                  onChange={(e) => setUserModalOrgFilter(e.target.value)}
                  className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 px-3 text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">Wszystkie jednostki</option>
                  {availableOrganizations.map((org) => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lista użytkowników */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[220px]">
              {/* Opcja: Wszyscy użytkownicy */}
              <div
                onClick={() => {
                  setSelectedUserId('all');
                  setIsUserModalOpen(false);
                  setCurrentPage(1);
                }}
                className={`p-3.5 rounded-2xl border transition duration-150 flex items-center justify-between cursor-pointer ${
                  selectedUserId === 'all'
                    ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-500/20'
                    : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200 text-slate-700 font-bold text-xs">
                    👥
                  </div>
                  <div>
                    <strong className="text-xs sm:text-sm text-slate-900 block font-extrabold">
                      Wszyscy użytkownicy (Brak filtra użytkownika)
                    </strong>
                    <span className="text-[11px] text-slate-500">Wyświetl historię operacji każdego użytkownika w systemie</span>
                  </div>
                </div>
                {selectedUserId === 'all' && <Check className="h-5 w-5 text-indigo-600" />}
              </div>

              {filteredModalUsers.map((u) => {
                const isSelected = selectedUserId === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setIsUserModalOpen(false);
                      setCurrentPage(1);
                    }}
                    className={`p-3.5 rounded-2xl border transition duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs shrink-0">
                        {u.firstName?.[0] || 'U'}
                        {u.lastName?.[0] || ''}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                            {u.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                            {u.role}
                          </span>
                          {u.isVerified && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Zweryfikowany</span>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span>{u.email}</span>
                          </span>
                          {u.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{u.phone}</span>
                            </span>
                          )}
                          {u.organizationName && (
                            <span className="flex items-center gap-1 font-semibold text-slate-700">
                              <Building className="h-3 w-3 text-slate-400" />
                              <span>{u.organizationName}</span>
                            </span>
                          )}
                          {u.municipalityName && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <MapPin className="h-3 w-3" />
                              <span>{u.municipalityName}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <span className="text-[10px] font-mono text-slate-400">
                        Dodano: {formatDate(u.createdAt).split(' ')[0]}
                      </span>
                      <button
                        type="button"
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700'
                        }`}
                      >
                        {isSelected ? 'Wybrany' : 'Wybierz'}
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredModalUsers.length === 0 && (
                <div className="py-10 text-center text-slate-400 space-y-1">
                  <User className="h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-xs font-bold">Nie znaleziono użytkowników spełniających kryteria</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
              <span className="text-xs text-slate-400 font-semibold">
                Dostępnych użytkowników: {filteredModalUsers.length} z {availableUsers.length}
              </span>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Szczegółów / Diff Porównania */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 sm:p-7 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  Szczegóły Wpisu & Porównanie Stanów (Diff)
                </h3>
              </div>
              <button
                onClick={() => setInspectingLog(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 font-semibold block">Typ operacji:</span>
                <span className="font-bold text-slate-800">{getActionBadge(inspectingLog.action).label}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Data wykonania:</span>
                <span className="font-mono font-bold text-slate-800">{formatDate(inspectingLog.createdAt)}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Użytkownik (Autor):</span>
                <span className="font-bold text-slate-800">
                  {inspectingLog.userName || 'System'} ({inspectingLog.userEmail || 'brak'})
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Jednostka / Organizacja:</span>
                <span className="font-bold text-slate-800">{inspectingLog.organizationName || 'Brak'}</span>
              </div>
              {inspectingLog.entityType && (
                <div className="sm:col-span-2 pt-1 border-t border-slate-200/60">
                  <span className="text-slate-400 font-semibold block">Dotyczy obiektu:</span>
                  <span className="font-extrabold text-indigo-700">
                    {getEntityTypeLabel(inspectingLog.entityType)}
                  </span>
                  <span className="ml-1 font-mono text-[11px] text-slate-400">({inspectingLog.entityId})</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Opis operacji:</span>
              <p className="text-xs sm:text-sm bg-indigo-50/60 border border-indigo-100 text-indigo-950 p-3 rounded-2xl font-medium">
                {inspectingLog.details}
              </p>
            </div>

            {/* Wizualizacja Diff */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Porównanie Danych (State Snapshot):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-rose-600 block flex items-center gap-1">
                    <span>🔴 Stan przed zmianą:</span>
                  </span>
                  <pre className="bg-rose-50/50 border border-rose-200 text-rose-950 p-3 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-56">
                    {inspectingLog.previousState
                      ? JSON.stringify(inspectingLog.previousState, null, 2)
                      : 'Brak danych poprzednich (np. nowy obiekt)'}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-emerald-600 block flex items-center gap-1">
                    <span>🟢 Stan po zmianie:</span>
                  </span>
                  <pre className="bg-emerald-50/50 border border-emerald-200 text-emerald-950 p-3 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-56">
                    {inspectingLog.newState
                      ? JSON.stringify(inspectingLog.newState, null, 2)
                      : 'Brak nowych danych (np. usunięcie obiektu)'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                {inspectingLog.isReverted ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Ta zmiana została już odwołana ({formatDate(inspectingLog.revertedAt || '')})</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRevertingLog(inspectingLog);
                      setInspectingLog(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Odwołaj tę zmianę (Rollback)</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInspectingLog(null)}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Potwierdzenia Rollback */}
      {revertingLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-600 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Potwierdź Odwołanie Zmiany</h3>
                <p className="text-xs text-slate-500">Rollback przywróci poprzednie parametry w systemie</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs text-slate-700">
              <div>
                <span className="font-semibold text-slate-500">Akcja do cofnięcia: </span>
                <strong className="text-slate-900">{getActionBadge(revertingLog.action).label}</strong>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Szczegóły: </span>
                <span>{revertingLog.details}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Operacja zostanie zarejestrowana w Dzienniku Audytowym jako nowe zdarzenie cofnięcia (Revert Action).
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRevertingLog(null)}
                disabled={isSubmittingRevert}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmRevert}
                disabled={isSubmittingRevert}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/25 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmittingRevert ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Cofanie...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    <span>Zatwierdź i Odwołaj Zmianę</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Nagłówek i Metryki */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <History className="h-4 w-4" />
            <span>Panel Administratora • Pełna Historia i Śledzenie Operacji</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Dziennik Zdarzeń i Logi Audytowe
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Śledź wszystkie zmiany w dronach, operacjach dronowych, użytkownikach i organizacjach oraz cofaj dowolne operacje
          </p>
        </div>
      </div>

      {/* 2. Karty Statystyk Audytowych */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">
            <History className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Wszystkie wpisy
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">{metrics.totalLogs}</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Ostatnie 24 godziny
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">{metrics.count24h}</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shrink-0">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Wycofane zmiany
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">{metrics.revertedCount}</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600 shrink-0">
            <Navigation className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Aktywne operacje
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">{metrics.activeMissionsCount}</span>
          </div>
        </div>
      </div>

      {/* 3. Panel Kojarzenia: Wybór Użytkownika przez Zaawansowane Okno Popup */}
      <section className="rounded-3xl bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 p-6 sm:p-7 text-white shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                Kojarzenie Operacji: Wybór Użytkownika
              </h2>
              <p className="text-xs text-indigo-200/80">
                Kliknij poniżej, aby otworzyć zaawansowaną wyszukiwarkę ze wszystkimi parametrami
              </p>
            </div>
          </div>

          {selectedUserId !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setSelectedUserId('all');
                setCurrentPage(1);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer self-start sm:self-auto border border-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Resetuj powiązanie podmiotów</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Karta Wyboru Użytkownika */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>Użytkownik (Kto wykonał akcję)</span>
              </label>
              {selectedUserId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedUserId('all')}
                  className="text-[11px] text-indigo-300 hover:text-white underline cursor-pointer"
                >
                  Wyczyść wybór
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsUserModalOpen(true)}
              className="w-full text-left p-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 transition group cursor-pointer"
            >
              {selectedUserObject ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white font-bold text-xs shrink-0 shadow-sm">
                      {selectedUserObject.firstName?.[0] || 'U'}
                      {selectedUserObject.lastName?.[0] || ''}
                    </div>
                    <div className="min-w-0">
                      <strong className="text-sm font-extrabold text-white block truncate">
                        {selectedUserObject.name}
                      </strong>
                      <span className="text-xs text-indigo-200 block truncate">
                        {selectedUserObject.email} • {selectedUserObject.organizationName || 'Brak organizacji'} ({selectedUserObject.role})
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-300 group-hover:text-white shrink-0 bg-white/10 px-3 py-1.5 rounded-xl">
                    Zmień użytkownika ➔
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 text-indigo-200">
                  <div className="flex items-center gap-2.5">
                    <SlidersHorizontal className="h-4 w-4 text-indigo-300" />
                    <span className="text-xs sm:text-sm font-bold text-white">
                      👥 Wszyscy użytkownicy (Kliknij, aby wybrać i wyszukać)
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-indigo-300 bg-white/10 px-3 py-1.5 rounded-xl group-hover:bg-white/20 transition">
                    Otwórz okno wyboru
                  </span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Aktywne podsumowanie wybranego powiązania */}
        <div className="pt-2 text-xs text-indigo-200 flex flex-wrap items-center gap-2">
          <span className="font-semibold">Aktywny tryb analizy:</span>
          {selectedUserId === 'all' ? (
            <span className="px-3 py-1 rounded-xl bg-white/10 text-white font-bold border border-white/10">
              🌐 Wszystkie operacje w całym systemie
            </span>
          ) : (
            <span className="px-3 py-1 rounded-xl bg-indigo-500/30 text-indigo-100 font-bold border border-indigo-400/30">
              👤 Wszystkie akcje wykonane przez: {selectedUserObject?.name}
            </span>
          )}
        </div>
      </section>

      {/* 4. Pasek Wyszukiwania i Zaawansowanych Filtrów */}
      <section className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Wyszukiwarka pełnotekstowa */}
          <div className="lg:col-span-4 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj po nazwisku, emailu, opisie..."
              className="w-full rounded-2xl bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          {/* Typ akcji */}
          <div className="lg:col-span-3">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 px-3 text-xs text-slate-800 font-semibold focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="all">Wszystkie typy operacji</option>
              <option value="drone_created">🟢 Dodanie drona</option>
              <option value="drone_updated">🔵 Aktualizacja drona</option>
              <option value="mission_created">🟣 Utworzenie operacji</option>
              <option value="user_verified">🛡️ Weryfikacja służb</option>
              <option value="user_rejected">🔴 Odrzucenie konta</option>
              <option value="user_updated">✏️ Aktualizacja użytkownika</option>
              <option value="user_deleted">🚨 Usunięcie użytkownika</option>
              <option value="revert_action">↩️ Wycofanie zmiany (Rollback)</option>
            </select>
          </div>

          {/* Organizacja */}
          <div className="lg:col-span-3">
            <select
              value={orgFilter}
              onChange={(e) => {
                setOrgFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-2xl bg-slate-50 border border-slate-200 py-2.5 px-3 text-xs text-slate-800 font-semibold focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="all">Wszystkie organizacje</option>
              {availableOrganizations.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
          </div>

          {/* Przycisk Szukaj & Reset */}
          <div className="lg:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              Szukaj
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              title="Resetuj wszystkie filtry"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Pasek przedziałów czasowych i sortowania */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-semibold mr-1">Okres:</span>
            {(['all', '24h', '48h', '7d', '30d', 'custom'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  setTimeframe(tf);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                  timeframe === tf
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tf === 'all'
                  ? 'Wszystko'
                  : tf === '24h'
                  ? '24h'
                  : tf === '48h'
                  ? '48h'
                  : tf === '7d'
                  ? '7 dni'
                  : tf === '30d'
                  ? '30 dni'
                  : 'Własny zakres'}
              </button>
            ))}

            {timeframe === 'custom' && (
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-xl border border-slate-200 px-2 py-1 text-xs bg-slate-50"
                />
                <span>-</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-xl border border-slate-200 px-2 py-1 text-xs bg-slate-50"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">Sortowanie:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-xl bg-slate-100 border border-slate-200 py-1.5 px-2.5 font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="date">Data zdarzenia</option>
              <option value="userName">Użytkownik (Autor)</option>
              <option value="action">Typ operacji</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder((cur) => (cur === 'DESC' ? 'ASC' : 'DESC'))}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              title={sortOrder === 'DESC' ? 'Sortuj rosnąco' : 'Sortuj malejąco'}
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 5. Lista / Tabela Logów Audytowych */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <span className="text-sm font-bold text-slate-900">
            Zarejestrowane operacje ({totalCount})
          </span>
          <span className="text-xs text-slate-500">
            Strona {currentPage} z {totalPages}
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mb-2"></div>
            <p className="text-xs">Ładowanie historii zdarzeń...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
            <History className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">Brak zarejestrowanych operacji</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Brak wpisów spełniających wybrane kryteria wyszukiwania lub powiązania podmiotów. Spróbuj zresetować filtry.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const badge = getActionBadge(log.action);

              return (
                <div
                  key={log.id}
                  className={`rounded-3xl bg-white p-5 sm:p-6 border transition duration-200 shadow-xs hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    log.isReverted
                      ? 'border-slate-200 opacity-75 bg-slate-50/50'
                      : 'border-slate-200/90 hover:border-indigo-300'
                  }`}
                >
                  {/* Lewa strona: Badge akcji, Tytuł, Opis i Autor */}
                  <div className="space-y-2.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold border uppercase tracking-wider ${badge.bg}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${badge.dot}`}></span>
                        <span>{badge.label}</span>
                      </span>

                      {log.isReverted && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                          <RotateCcw className="h-3 w-3" />
                          <span>Wycofana zmiana</span>
                        </span>
                      )}

                      <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDate(log.createdAt)}</span>
                      </span>
                    </div>

                    <div>
                      <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                        {log.details}
                      </p>
                    </div>

                    {/* Autor i Organizacja */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(log.userId || 'all')}
                        className="flex items-center gap-1.5 hover:text-indigo-700 font-medium transition cursor-pointer"
                        title="Filtruj historię tego użytkownika"
                      >
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          <strong>{log.userName || 'Użytkownik'}</strong>
                          {log.userEmail && <span className="text-slate-400 ml-1">({log.userEmail})</span>}
                        </span>
                      </button>

                      {log.organizationName && (
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Building className="h-3.5 w-3.5 text-slate-400" />
                          <span>{log.organizationName}</span>
                        </span>
                      )}

                      {log.isReverted && log.revertedByUserName && (
                        <span className="text-xs text-amber-700 italic">
                          (Wycofano przez: {log.revertedByUserName})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Prawa strona: Przyciski Akcji (Diff & Rollback) */}
                  <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => setInspectingLog(log)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/90 text-slate-700 text-xs font-bold transition cursor-pointer"
                      title="Podgląd szczegółów i porównanie poprzedniego stanu z nowym"
                    >
                      <Eye className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Szczegóły / Diff</span>
                    </button>

                    {!log.isReverted && (
                      <button
                        type="button"
                        onClick={() => setRevertingLog(log)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition cursor-pointer active:scale-95"
                        title="Odwołaj i wycofaj zmianę dokonaną w tym wpisie"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Odwołaj zmianę</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paginacja */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Poprzednia</span>
            </button>

            <span className="text-xs font-semibold text-slate-600">
              Strona {currentPage} z {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 cursor-pointer"
            >
              <span>Następna</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
