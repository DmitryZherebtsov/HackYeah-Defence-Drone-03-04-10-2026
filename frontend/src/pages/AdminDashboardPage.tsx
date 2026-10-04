import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Building,
  Mail,
  Phone,
  X,
  Plus,
  Pencil,
  Trash2,
  Users,
  Building2,
} from 'lucide-react';

type AdminTab = 'verification' | 'workers' | 'organizations';

interface OrganizationItem {
  id: string;
  name: string;
  type: 'samorzad' | 'sluzby' | 'ngo';
  municipalityId?: string;
  municipality?: {
    id: string;
    name: string;
  };
  users?: UserItem[];
  createdAt?: string;
}

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'admin' | 'koordynator' | 'czlonek' | string;
  organizationId: string;
  isVerified: boolean;
  organization?: {
    id: string;
    name: string;
    type: 'samorzad' | 'sluzby' | 'ngo';
    municipality?: {
      id: string;
      name: string;
    };
  };
  createdAt: string;
}

interface MunicipalityItem {
  id: string;
  name: string;
}

export const AdminDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('verification');

  // Dane z API
  const [pendingUsers, setPendingUsers] = useState<UserItem[]>([]);
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [municipalities, setMunicipalities] = useState<MunicipalityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // --- Filtry dla WERYFIKACJI ---
  const [pendingSearch, setPendingSearch] = useState('');

  // --- Filtry dla PRACOWNIKÓW ---
  const [userSearch, setUserSearch] = useState('');
  const [userOrgFilter, setUserOrgFilter] = useState<string>('all');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all'); // all, verified, pending
  const [userSort, setUserSort] = useState<'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'>('date-desc');

  // --- Filtry dla ORGANIZACJI ---
  const [orgSearch, setOrgSearch] = useState('');
  const [orgTypeFilter, setOrgTypeFilter] = useState<string>('all');
  const [orgSort, setOrgSort] = useState<'name-asc' | 'name-desc' | 'users-desc' | 'date-desc'>('name-asc');

  // --- Modale Pracowników ---
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [userFormFirstName, setUserFormFirstName] = useState('');
  const [userFormLastName, setUserFormLastName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userFormPhone, setUserFormPhone] = useState('');
  const [userFormRole, setUserFormRole] = useState<'admin' | 'koordynator' | 'czlonek'>('czlonek');
  const [userFormOrgId, setUserFormOrgId] = useState('');
  const [userFormVerified, setUserFormVerified] = useState(true);
  const [isSubmittingUserForm, setIsSubmittingUserForm] = useState(false);

  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [assigningOrgUser, setAssigningOrgUser] = useState<UserItem | null>(null);
  const [targetOrgIdForAssign, setTargetOrgIdForAssign] = useState('');

  // --- Modale Organizacji ---
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [orgFormName, setOrgFormName] = useState('');
  const [orgFormType, setOrgFormType] = useState<'samorzad' | 'sluzby' | 'ngo'>('sluzby');
  const [orgFormMunicipalityId, setOrgFormMunicipalityId] = useState('');
  const [isSubmittingOrgForm, setIsSubmittingOrgForm] = useState(false);

  const [editingOrg, setEditingOrg] = useState<OrganizationItem | null>(null);
  const [viewingOrgWorkers, setViewingOrgWorkers] = useState<OrganizationItem | null>(null);

  // Dialog potwierdzenia usunięcia
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    type: 'user' | 'org' | 'reject';
    id: string;
    title: string;
    description: string;
  } | null>(null);

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
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  };

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const [pendingRes, usersRes, orgsRes, munisRes] = await Promise.all([
        api.get('/admin/users/pending'),
        api.get('/admin/users'),
        api.get('/admin/organizations'),
        api.get('/admin/municipalities').catch(() => ({ data: { data: [] } })),
      ]);

      if (pendingRes.data.success && Array.isArray(pendingRes.data.data)) {
        setPendingUsers(pendingRes.data.data);
      }
      if (usersRes.data.success && Array.isArray(usersRes.data.data)) {
        setAllUsers(usersRes.data.data);
      }
      if (orgsRes.data.success && Array.isArray(orgsRes.data.data)) {
        setOrganizations(orgsRes.data.data);
      }
      if (munisRes.data.success && Array.isArray(munisRes.data.data)) {
        setMunicipalities(munisRes.data.data);
      }
    } catch (error: any) {
      console.error('Błąd pobierania danych panelu administratora:', error);
      showToast(
        error.response?.data?.message || 'Nie udało się pobrać danych panelu administratora.',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // --- AKCJE WERYFIKACJI ---
  const handleVerify = async (user: UserItem) => {
    setActionLoadingId(user.id);
    try {
      const res = await api.patch(`/admin/users/${user.id}/verify`);
      if (res.data.success) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== user.id));
        setAllUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isVerified: true } : u))
        );
        showToast(`Użytkownik ${user.firstName} ${user.lastName} został pomyślnie zweryfikowany!`);
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || 'Wystąpił błąd podczas weryfikacji konta.',
        'error'
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmReject = async (userId: string) => {
    setActionLoadingId(userId);
    try {
      const res = await api.delete(`/admin/users/${userId}/reject`);
      if (res.data.success) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
        setAllUsers((prev) => prev.filter((u) => u.id !== userId));
        showToast('Wniosek rejestracyjny został odrzucony.');
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || 'Wystąpił błąd podczas odrzucania wniosku.',
        'error'
      );
    } finally {
      setActionLoadingId(null);
      setDeleteConfirmItem(null);
    }
  };

  // --- AKCJE PRACOWNIKÓW (USERS) ---
  const openCreateUserModal = () => {
    setUserFormFirstName('');
    setUserFormLastName('');
    setUserFormEmail('');
    setUserFormPassword('');
    setUserFormPhone('');
    setUserFormRole('czlonek');
    setUserFormOrgId(organizations[0]?.id || '');
    setUserFormVerified(true);
    setShowCreateUserModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormFirstName || !userFormLastName || !userFormEmail || !userFormPassword || !userFormOrgId) {
      showToast('Wypełnij wszystkie wymagane pola.', 'error');
      return;
    }

    setIsSubmittingUserForm(true);
    try {
      const res = await api.post('/admin/users', {
        firstName: userFormFirstName,
        lastName: userFormLastName,
        email: userFormEmail,
        password: userFormPassword,
        phone: userFormPhone || '-',
        role: userFormRole,
        organizationId: userFormOrgId,
        isVerified: userFormVerified,
      });

      if (res.data.success && res.data.data) {
        setAllUsers((prev) => [res.data.data, ...prev]);
        if (!userFormVerified) {
          setPendingUsers((prev) => [res.data.data, ...prev]);
        }
        showToast('Pracownik został pomyślnie utworzony!');
        setShowCreateUserModal(false);
        fetchAdminData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Nie udało się utworzyć pracownika.', 'error');
    } finally {
      setIsSubmittingUserForm(false);
    }
  };

  const openEditUserModal = (user: UserItem) => {
    setEditingUser(user);
    setUserFormFirstName(user.firstName);
    setUserFormLastName(user.lastName);
    setUserFormEmail(user.email);
    setUserFormPassword('');
    setUserFormPhone(user.phone || '');
    setUserFormRole(user.role as any);
    setUserFormOrgId(user.organizationId || organizations[0]?.id || '');
    setUserFormVerified(user.isVerified);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmittingUserForm(true);
    try {
      const payload: any = {
        firstName: userFormFirstName,
        lastName: userFormLastName,
        email: userFormEmail,
        phone: userFormPhone,
        role: userFormRole,
        organizationId: userFormOrgId,
        isVerified: userFormVerified,
      };
      if (userFormPassword.trim()) {
        payload.password = userFormPassword.trim();
      }

      const res = await api.put(`/admin/users/${editingUser.id}`, payload);
      if (res.data.success && res.data.data) {
        setAllUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? res.data.data : u))
        );
        if (userFormVerified) {
          setPendingUsers((prev) => prev.filter((u) => u.id !== editingUser.id));
        }
        showToast('Dane pracownika zostały zaktualizowane!');
        setEditingUser(null);
        fetchAdminData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Nie udało się zaktualizować pracownika.', 'error');
    } finally {
      setIsSubmittingUserForm(false);
    }
  };

  const openAssignOrgModal = (user: UserItem) => {
    setAssigningOrgUser(user);
    setTargetOrgIdForAssign(user.organizationId || organizations[0]?.id || '');
  };

  const handleAssignOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningOrgUser || !targetOrgIdForAssign) return;

    try {
      const res = await api.patch(`/admin/users/${assigningOrgUser.id}/assign-organization`, {
        organizationId: targetOrgIdForAssign,
      });

      if (res.data.success && res.data.data) {
        setAllUsers((prev) =>
          prev.map((u) => (u.id === assigningOrgUser.id ? res.data.data : u))
        );
        setPendingUsers((prev) =>
          prev.map((u) => (u.id === assigningOrgUser.id ? res.data.data : u))
        );
        showToast(res.data.message || 'Pracownik został pomyślnie przepisany do organizacji.');
        setAssigningOrgUser(null);
        fetchAdminData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Nie udało się przypisać organizacji.', 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await api.delete(`/admin/users/${userId}`);
      if (res.data.success) {
        setAllUsers((prev) => prev.filter((u) => u.id !== userId));
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
        showToast('Pracownik został usunięty z systemu.');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Nie udało się usunąć pracownika.', 'error');
    } finally {
      setDeleteConfirmItem(null);
    }
  };

  // --- AKCJE ORGANIZACJI (ORGANIZATIONS) ---
  const openCreateOrgModal = () => {
    setOrgFormName('');
    setOrgFormType('sluzby');
    setOrgFormMunicipalityId(municipalities[0]?.id || '');
    setShowCreateOrgModal(true);
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgFormName.trim()) {
      showToast('Wpisz nazwę organizacji.', 'error');
      return;
    }

    setIsSubmittingOrgForm(true);
    try {
      const res = await api.post('/admin/organizations', {
        name: orgFormName.trim(),
        type: orgFormType,
        municipalityId: orgFormMunicipalityId || undefined,
      });

      if (res.data.success && res.data.data) {
        setOrganizations((prev) => [...prev, res.data.data]);
        showToast(`Organizacja "${res.data.data.name}" została utworzona!`);
        setShowCreateOrgModal(false);
        fetchAdminData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Nie udało się utworzyć organizacji.', 'error');
    } finally {
      setIsSubmittingOrgForm(false);
    }
  };

  const openEditOrgModal = (org: OrganizationItem) => {
    setEditingOrg(org);
    setOrgFormName(org.name);
    setOrgFormType(org.type);
    setOrgFormMunicipalityId(org.municipalityId || municipalities[0]?.id || '');
  };

  const handleSaveEditOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg || !orgFormName.trim()) return;

    setIsSubmittingOrgForm(true);
    try {
      const res = await api.put(`/admin/organizations/${editingOrg.id}`, {
        name: orgFormName.trim(),
        type: orgFormType,
        municipalityId: orgFormMunicipalityId,
      });

      if (res.data.success && res.data.data) {
        setOrganizations((prev) =>
          prev.map((o) => (o.id === editingOrg.id ? res.data.data : o))
        );
        showToast('Dane organizacji zostały zaktualizowane!');
        setEditingOrg(null);
        fetchAdminData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Nie udało się zaktualizować organizacji.', 'error');
    } finally {
      setIsSubmittingOrgForm(false);
    }
  };

  const handleDeleteOrg = async (orgId: string) => {
    try {
      const res = await api.delete(`/admin/organizations/${orgId}`);
      if (res.data.success) {
        setOrganizations((prev) => prev.filter((o) => o.id !== orgId));
        showToast('Organizacja została usunięta.');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Nie udało się usunąć organizacji.', 'error');
    } finally {
      setDeleteConfirmItem(null);
    }
  };

  // --- FILTROWANIE I SORTOWANIE ---

  // 1. Oczekujący
  const filteredPendingUsers = useMemo(() => {
    return pendingUsers.filter((u) => {
      const matchText = `${u.firstName} ${u.lastName} ${u.email} ${u.organization?.name || ''}`.toLowerCase();
      return matchText.includes(pendingSearch.toLowerCase().trim());
    });
  }, [pendingUsers, pendingSearch]);

  // 2. Wszyscy pracownicy
  const filteredWorkers = useMemo(() => {
    return allUsers
      .filter((u) => {
        // Wyszukiwarka
        if (userSearch.trim()) {
          const matchText = `${u.firstName} ${u.lastName} ${u.email} ${u.phone} ${u.organization?.name || ''}`.toLowerCase();
          if (!matchText.includes(userSearch.toLowerCase().trim())) return false;
        }
        // Organizacja
        if (userOrgFilter !== 'all' && u.organizationId !== userOrgFilter) {
          return false;
        }
        // Rola
        if (userRoleFilter !== 'all' && u.role !== userRoleFilter) {
          return false;
        }
        // Status weryfikacji
        if (userStatusFilter === 'verified' && !u.isVerified) return false;
        if (userStatusFilter === 'pending' && u.isVerified) return false;

        return true;
      })
      .sort((a, b) => {
        if (userSort === 'name-asc') {
          return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'pl');
        }
        if (userSort === 'name-desc') {
          return `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`, 'pl');
        }
        if (userSort === 'date-asc') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [allUsers, userSearch, userOrgFilter, userRoleFilter, userStatusFilter, userSort]);

  // 3. Organizacje
  const filteredOrganizations = useMemo(() => {
    return organizations
      .filter((org) => {
        // Wyszukiwarka
        if (orgSearch.trim()) {
          const matchText = `${org.name} ${org.municipality?.name || ''} ${org.type}`.toLowerCase();
          if (!matchText.includes(orgSearch.toLowerCase().trim())) return false;
        }
        // Typ
        if (orgTypeFilter !== 'all' && org.type !== orgTypeFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (orgSort === 'name-asc') {
          return a.name.localeCompare(b.name, 'pl');
        }
        if (orgSort === 'name-desc') {
          return b.name.localeCompare(a.name, 'pl');
        }
        if (orgSort === 'users-desc') {
          return (b.users?.length || 0) - (a.users?.length || 0);
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [organizations, orgSearch, orgTypeFilter, orgSort]);

  const getOrgTypeBadge = (type: string) => {
    switch (type) {
      case 'sluzby':
        return { label: 'Służby Ratunkowe', bg: 'bg-red-50 text-red-700 border-red-200' };
      case 'samorzad':
        return { label: 'Samorząd / Urząd', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'ngo':
        return { label: 'Fundacja / NGO', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      default:
        return { label: type, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return { label: 'Administrator', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'koordynator':
        return { label: 'Koordynator', bg: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'czlonek':
        return { label: 'Pracownik / Członek', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
      default:
        return { label: role, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
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
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75 transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Nagłówek Panelu Administratora */}
      <div className="rounded-3xl bg-slate-900 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2 border border-indigo-500/30">
              <ShieldCheck className="h-4 w-4" />
              <span>Panel Zarządzania Sztabem</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Weryfikacja Służb & Zarządzanie Organizacjami
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-xl">
              Zarządzaj strukturą jednostek, twórz organizacje, rejestruj pracowników i weryfikuj konta służb ratunkowych.
            </p>
          </div>
        </div>
      </div>

      {/* Nawigacja po Zakładkach (Tabs) */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/70 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('verification')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'verification'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Weryfikacja Wniosków</span>
          {pendingUsers.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('workers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'workers'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Pracownicy & Użytkownicy ({allUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('organizations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'organizations'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Organizacje & Jednostki ({organizations.length})</span>
        </button>
      </div>

      {isLoading && (
        <div className="py-16 text-center text-slate-400">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mb-2"></div>
          <p className="text-xs">Ładowanie danych panelu...</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ZAKŁADKA: WERYFIKACJA WNIOSKÓW                                        */}
      {/* ========================================================================= */}
      {!isLoading && activeTab === 'verification' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                placeholder="Szukaj po nazwisku, emailu, organizacji..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <span className="text-xs text-slate-500 font-semibold">
              Oczekujące na zatwierdzenie: <strong>{filteredPendingUsers.length}</strong>
            </span>
          </div>

          {filteredPendingUsers.length === 0 ? (
            <div className="rounded-3xl bg-white p-12 text-center border border-slate-200 shadow-xs space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">Brak oczekujących wniosków</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Wszystkie konta zostały zweryfikowane. Nowe zgłoszenia pojawią się w tym miejscu automatycznie po rejestracji.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPendingUsers.map((user) => {
                const orgTypeBadge = getOrgTypeBadge(user.organization?.type || 'sluzby');
                const roleBadge = getRoleBadge(user.role);

                return (
                  <article
                    key={user.id}
                    className="rounded-3xl bg-white border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {user.firstName} {user.lastName}
                          </h3>
                          <span className={`inline-block mt-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-lg border ${roleBadge.bg}`}>
                            {roleBadge.label}
                          </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Oczekuje</span>
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-semibold text-[11px]">Organizacja:</span>
                          <span className="font-bold text-slate-900">{user.organization?.name || 'Brak'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-semibold text-[11px]">Typ jednostki:</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${orgTypeBadge.bg}`}>
                            {orgTypeBadge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 pt-1 border-t border-slate-200/60">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{user.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openAssignOrgModal(user)}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1"
                        >
                          <Building className="h-3.5 w-3.5" />
                          <span>Zmień org.</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setDeleteConfirmItem({
                              type: 'reject',
                              id: user.id,
                              title: `Odrzucić wniosek ${user.firstName} ${user.lastName}?`,
                              description: 'Konto użytkownika zostanie usunięte z kolejki oczekujących.',
                            })
                          }
                          className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          <span>Odrzuć</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleVerify(user)}
                        disabled={actionLoadingId === user.id}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/25 transition cursor-pointer disabled:opacity-50"
                      >
                        {actionLoadingId === user.id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <>
                            <UserCheck className="h-4 w-4" />
                            <span>Zatwierdź i Aktywuj konto</span>
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ZAKŁADKA: PRACOWNICY & UŻYTKOWNICY (CRUD & FILTRY)                     */}
      {/* ========================================================================= */}
      {!isLoading && activeTab === 'workers' && (
        <div className="space-y-5">
          {/* Belka filtrów i akcji */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Szukaj po nazwisku, emailu, telefonie..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={openCreateUserModal}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="h-4 w-4" />
                <span>+ Dodaj nowego pracownika</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Organizacja:
                </label>
                <select
                  value={userOrgFilter}
                  onChange={(e) => setUserOrgFilter(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-2.5 font-semibold text-slate-800"
                >
                  <option value="all">Wszystkie organizacje</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Rola:
                </label>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-2.5 font-semibold text-slate-800"
                >
                  <option value="all">Wszystkie role</option>
                  <option value="admin">Administrator</option>
                  <option value="koordynator">Koordynator</option>
                  <option value="czlonek">Pracownik / Członek</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Status konta:
                </label>
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-2.5 font-semibold text-slate-800"
                >
                  <option value="all">Wszystkie statusy</option>
                  <option value="verified">Zweryfikowani (Aktywni)</option>
                  <option value="pending">Oczekujący na weryfikację</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Sortowanie:
                </label>
                <select
                  value={userSort}
                  onChange={(e) => setUserSort(e.target.value as any)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-2.5 font-semibold text-slate-800"
                >
                  <option value="date-desc">Najnowsi pierwsi</option>
                  <option value="date-asc">Najstarsi pierwsi</option>
                  <option value="name-asc">Nazwisko (A-Z)</option>
                  <option value="name-desc">Nazwisko (Z-A)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabela / Karty Pracowników */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3.5 px-4">Pracownik</th>
                    <th className="py-3.5 px-4">Organizacja</th>
                    <th className="py-3.5 px-4">Rola</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Kontakt</th>
                    <th className="py-3.5 px-4 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWorkers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Nie znaleziono pracowników spełniających kryteria.
                      </td>
                    </tr>
                  ) : (
                    filteredWorkers.map((u) => {
                      const roleBadge = getRoleBadge(u.role);
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">
                              {u.firstName} {u.lastName}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Rejestracja: {formatDate(u.createdAt)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <Building className="h-3.5 w-3.5 text-indigo-600" />
                              <span>{u.organization?.name || 'Brak'}</span>
                            </div>
                            {u.organization?.municipality?.name && (
                              <span className="text-[10px] text-slate-400 block">
                                Gmina: {u.organization.municipality.name}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${roleBadge.bg}`}>
                              {roleBadge.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {u.isVerified ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Aktywny</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                                <Clock className="h-3 w-3" />
                                <span>Oczekujący</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            <div className="flex items-center gap-1 font-mono text-[11px]">
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span>{u.email}</span>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 mt-0.5">
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{u.phone}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openAssignOrgModal(u)}
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition"
                                title="Przepisz do innej organizacji"
                              >
                                <Building className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditUserModal(u)}
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition"
                                title="Edytuj dane pracownika"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmItem({
                                    type: 'user',
                                    id: u.id,
                                    title: `Usunąć pracownika ${u.firstName} ${u.lastName}?`,
                                    description: 'To konto zostanie bezpowrotnie usunięte z systemu.',
                                  })
                                }
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                                title="Usuń konto"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ZAKŁADKA: ORGANIZACJE & JEDNOSTKI (CRUD & FILTRY)                      */}
      {/* ========================================================================= */}
      {!isLoading && activeTab === 'organizations' && (
        <div className="space-y-5">
          {/* Belka filtrów i dodawania */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  placeholder="Szukaj po nazwie jednostki, gminie..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={openCreateOrgModal}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="h-4 w-4" />
                <span>+ Utwórz nową organizację</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Typ jednostki:
                </label>
                <select
                  value={orgTypeFilter}
                  onChange={(e) => setOrgTypeFilter(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-2.5 font-semibold text-slate-800"
                >
                  <option value="all">Wszystkie typy</option>
                  <option value="sluzby">Służby Ratunkowe (PSP/OSP/Policja)</option>
                  <option value="samorzad">Samorząd / Urząd Gminy / Sztab</option>
                  <option value="ngo">Fundacje i NGO</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Sortowanie:
                </label>
                <select
                  value={orgSort}
                  onChange={(e) => setOrgSort(e.target.value as any)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-2.5 font-semibold text-slate-800"
                >
                  <option value="name-asc">Nazwa alfabetycznie (A-Z)</option>
                  <option value="name-desc">Nazwa alfabetycznie (Z-A)</option>
                  <option value="users-desc">Najwięcej pracowników</option>
                  <option value="date-desc">Ostatnio dodane</option>
                </select>
              </div>
            </div>
          </div>

          {/* Siatka Organizacji */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrganizations.length === 0 ? (
              <div className="col-span-full rounded-3xl bg-white p-12 text-center border border-slate-200 text-slate-400">
                Brak organizacji spełniających kryteria.
              </div>
            ) : (
              filteredOrganizations.map((org) => {
                const orgTypeBadge = getOrgTypeBadge(org.type);
                const userCount = org.users?.length || 0;

                return (
                  <article
                    key={org.id}
                    className="rounded-3xl bg-white border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border mb-1 ${orgTypeBadge.bg}`}>
                            {orgTypeBadge.label}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-slate-900">
                            {org.name}
                          </h3>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="text-slate-400 font-semibold">Gmina / Region:</span>
                          <span className="font-bold text-slate-800">
                            {org.municipality?.name || 'Ogólnokrajowa'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="text-slate-400 font-semibold">Liczba pracowników:</span>
                          <button
                            type="button"
                            onClick={() => setViewingOrgWorkers(org)}
                            className="font-bold text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <Users className="h-3.5 w-3.5" />
                            <span>{userCount} osób (podgląd)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditOrgModal(org)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edytuj</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeleteConfirmItem({
                            type: 'org',
                            id: org.id,
                            title: `Usunąć organizację "${org.name}"?`,
                            description: 'Usunięcie organizacji spowoduje odpięcie przypisanych pracowników.',
                          })
                        }
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Usuń</span>
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALE DIALOGOWE                                                          */}
      {/* ========================================================================= */}

      {/* 1. Modal Tworzenia / Edycji Pracownika */}
      {(showCreateUserModal || editingUser) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-600 font-bold">
                <Users className="h-5 w-5" />
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingUser ? 'Edytuj Pracownika' : 'Dodaj Nowego Pracownika'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateUserModal(false);
                  setEditingUser(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={editingUser ? handleSaveEditUser : handleCreateUser} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Imię
                  </label>
                  <input
                    type="text"
                    required
                    value={userFormFirstName}
                    onChange={(e) => setUserFormFirstName(e.target.value)}
                    placeholder="np. Jan"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Nazwisko
                  </label>
                  <input
                    type="text"
                    required
                    value={userFormLastName}
                    onChange={(e) => setUserFormLastName(e.target.value)}
                    placeholder="np. Kowalski"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Adres e-mail
                </label>
                <input
                  type="email"
                  required
                  value={userFormEmail}
                  onChange={(e) => setUserFormEmail(e.target.value)}
                  placeholder="jan.kowalski@osp.pl"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Hasło {editingUser && '(pozostaw puste, aby nie zmieniać)'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  minLength={6}
                  value={userFormPassword}
                  onChange={(e) => setUserFormPassword(e.target.value)}
                  placeholder={editingUser ? '••••••••' : 'Min. 6 znaków'}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Telefon
                  </label>
                  <input
                    type="text"
                    value={userFormPhone}
                    onChange={(e) => setUserFormPhone(e.target.value)}
                    placeholder="+48 600 000 000"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Rola w systemie
                  </label>
                  <select
                    value={userFormRole}
                    onChange={(e) => setUserFormRole(e.target.value as any)}
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs font-semibold text-slate-800"
                  >
                    <option value="czlonek">Pracownik / Członek</option>
                    <option value="koordynator">Koordynator</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Przypisana Organizacja / Jednostka
                </label>
                <select
                  required
                  value={userFormOrgId}
                  onChange={(e) => setUserFormOrgId(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs font-semibold text-slate-800"
                >
                  <option value="">Wybierz organizację...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="userVerifiedCheck"
                  checked={userFormVerified}
                  onChange={(e) => setUserFormVerified(e.target.checked)}
                  className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <label htmlFor="userVerifiedCheck" className="text-xs font-semibold text-slate-700">
                  Konto natychmiast zweryfikowane i aktywne
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateUserModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUserForm}
                  className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition disabled:opacity-50"
                >
                  {isSubmittingUserForm ? 'Zapisywanie...' : editingUser ? 'Zapisz zmiany' : 'Utwórz pracownika'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal Szybkiego Przypisania Organizacji */}
      {assigningOrgUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Przepisz Pracownika do Organizacji
              </h3>
              <button
                type="button"
                onClick={() => setAssigningOrgUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Wybierz nową organizację dla:{' '}
              <strong className="text-slate-900">
                {assigningOrgUser.firstName} {assigningOrgUser.lastName}
              </strong>
            </p>

            <form onSubmit={handleAssignOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Docelowa Organizacja:
                </label>
                <select
                  value={targetOrgIdForAssign}
                  onChange={(e) => setTargetOrgIdForAssign(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2.5 px-3 text-xs font-semibold text-slate-900"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssigningOrgUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25"
                >
                  Zatwierdź przypisanie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Tworzenia / Edycji Organizacji */}
      {(showCreateOrgModal || editingOrg) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-600 font-bold">
                <Building2 className="h-5 w-5" />
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingOrg ? 'Edytuj Organizację' : 'Utwórz Nową Organizację'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateOrgModal(false);
                  setEditingOrg(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={editingOrg ? handleSaveEditOrg : handleCreateOrg} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Nazwa Organizacji / Jednostki
                </label>
                <input
                  type="text"
                  required
                  value={orgFormName}
                  onChange={(e) => setOrgFormName(e.target.value)}
                  placeholder="np. OSP Kłodzko, Sztab Kryzysowy Dolny Śląsk"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2.5 px-3 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Typ jednostki
                </label>
                <select
                  value={orgFormType}
                  onChange={(e) => setOrgFormType(e.target.value as any)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs font-semibold text-slate-800"
                >
                  <option value="sluzby">Służby Ratunkowe (PSP/OSP/Policja/Pogotowie)</option>
                  <option value="samorzad">Samorząd / Urząd Gminy</option>
                  <option value="ngo">Fundacja / NGO</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Gmina / Lokalizacja
                </label>
                <select
                  value={orgFormMunicipalityId}
                  onChange={(e) => setOrgFormMunicipalityId(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 py-2 px-3 text-xs font-semibold text-slate-800"
                >
                  <option value="">Wybierz gminę (lub domyślna)...</option>
                  {municipalities.map((muni) => (
                    <option key={muni.id} value={muni.id}>
                      {muni.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOrgModal(false);
                    setEditingOrg(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOrgForm}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 disabled:opacity-50"
                >
                  {isSubmittingOrgForm ? 'Zapisywanie...' : editingOrg ? 'Zapisz zmiany' : 'Utwórz organizację'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal Podglądu Pracowników Organizacji */}
      {viewingOrgWorkers && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pracownicy organizacji: {viewingOrgWorkers.name}
                </h3>
                <span className="text-xs text-slate-500 font-semibold">
                  Łącznie: {viewingOrgWorkers.users?.length || 0} osób
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingOrgWorkers(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
              {(!viewingOrgWorkers.users || viewingOrgWorkers.users.length === 0) ? (
                <p className="text-slate-400 italic text-center py-6">
                  Brak przypisanych pracowników do tej organizacji.
                </p>
              ) : (
                viewingOrgWorkers.users.map((worker) => (
                  <div
                    key={worker.id}
                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {worker.firstName} {worker.lastName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{worker.email}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {worker.role}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingOrgWorkers(null)}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Potwierdzenia Usunięcia */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-scale-up text-center">
            <div className="h-12 w-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h4 className="text-base font-extrabold text-slate-900">{deleteConfirmItem.title}</h4>
              <p className="text-xs text-slate-500 mt-1">{deleteConfirmItem.description}</p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirmItem.type === 'reject') {
                    handleConfirmReject(deleteConfirmItem.id);
                  } else if (deleteConfirmItem.type === 'user') {
                    handleDeleteUser(deleteConfirmItem.id);
                  } else if (deleteConfirmItem.type === 'org') {
                    handleDeleteOrg(deleteConfirmItem.id);
                  }
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/25"
              >
                Potwierdź usunięcie
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
