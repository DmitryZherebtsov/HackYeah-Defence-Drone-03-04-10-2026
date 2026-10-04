import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  ShieldCheck,
  ChevronRight,
  ShieldAlert,
  LogOut,
  History,
  Sun,
  Moon,
  Plane,
  Radar,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile?: () => void;
  /** Zwinięty do samych ikon (tylko desktop) */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onCloseMobile, collapsed = false, onToggleCollapsed }) => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isVerified = user?.isVerified === true;
  // Elementy ukrywane w trybie zwiniętym (na mobile szuflada jest zawsze pełna)
  const hide = collapsed ? 'lg:hidden' : '';

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${(firstName || '')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase();
  };

  const handleLogout = () => {
    logout();
    if (onCloseMobile) onCloseMobile();
    navigate('/login');
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${isActive
      ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100 font-bold dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800/80'
      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60'
    }`;

  const NavItem: React.FC<{ to: string; label: string; icon: React.ReactNode; iconCls: string; end?: boolean }> = ({ to, label, icon, iconCls, end }) => (
    <NavLink to={to} end={end} onClick={onCloseMobile} className={navLinkClasses} title={collapsed ? label : undefined}>
      <div className="flex items-center gap-3">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${iconCls}`}>{icon}</div>
        <span className={hide}>{label}</span>
      </div>
      <ChevronRight className={`h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${hide}`} />
    </NavLink>
  );

  return (
    <>
      {/* Tło przyciemniające na urządzeniach mobilnych */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 ${collapsed ? 'lg:w-[72px]' : ''} bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-all duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Górna część: Logo i Marka */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className={`h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800/80 gap-3 shrink-0 ${collapsed ? 'lg:px-0 lg:justify-center' : ''}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-md shadow-indigo-500/25 shrink-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className={`flex flex-col flex-1 min-w-0 ${hide}`}>
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                SKK
              </span>
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                System Koordynacji Kryzysowej
              </span>
            </div>
            {onToggleCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                title={collapsed ? 'Rozwiń menu' : 'Zwiń menu'}
              >
                {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </button>
            )}
          </div>

          {/* Lista nawigacyjna */}
          <div className={`p-4 space-y-6 overflow-y-auto flex-1 ${collapsed ? 'lg:px-2' : ''}`}>
            {/* SEKCJA: Operacje dronowe (dla zalogowanych zweryfikowanych) */}
            {user && isVerified && (
              <div className="space-y-1">
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${hide}`}>
                  Operacje Dronowe
                </div>
                <NavItem
                  to="/dashboard/missions"
                  label="Centrum Dowodzenia C2"
                  icon={<Radar className="h-4 w-4" />}
                  iconCls="bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/60"
                />
                <NavItem
                  to="/dashboard/drones"
                  label="Flota Dronów"
                  icon={<Plane className="h-4 w-4" />}
                  iconCls="bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 group-hover:bg-sky-100 dark:group-hover:bg-sky-900/60"
                />
              </div>
            )}

            {/* SEKCJA 3: Administracja (dla roli admin) */}
            {isAdmin && (
              <div className="space-y-1">
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${hide}`}>
                  Administracja
                </div>
                <NavItem
                  to="/dashboard/admin"
                  end
                  label="Weryfikacja Służb"
                  icon={<ShieldCheck className="h-4 w-4" />}
                  iconCls="bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/60"
                />
                <NavItem
                  to="/dashboard/admin/logs"
                  end
                  label="Dziennik i Logi Zdarzeń"
                  icon={<History className="h-4 w-4" />}
                  iconCls="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60"
                />
              </div>
            )}
          </div>
        </div>

        {/* Dolna część sidebaru: Przełącznik Dark Mode oraz Karta Użytkownika */}
        <div className={`p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 shrink-0 space-y-2 ${collapsed ? 'lg:px-2' : ''}`}>
          {/* Przełącznik Motywu */}
          <button
            type="button"
            onClick={toggleTheme}
            title={collapsed ? (isDark ? 'Tryb Ciemny' : 'Tryb Jasny') : undefined}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600 shadow-xs transition ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
          >
            <div className="flex items-center gap-2">
              {isDark ? (
                <Moon className="h-4 w-4 text-indigo-400" />
              ) : (
                <Sun className="h-4 w-4 text-amber-500" />
              )}
              <span className={hide}>{isDark ? 'Tryb Ciemny' : 'Tryb Jasny'}</span>
            </div>
            <div className={`w-8 h-4.5 flex items-center rounded-full p-0.5 transition-colors duration-200 ${isDark ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'} ${hide}`}>
              <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
            </div>
          </button>

          {/* Karta Użytkownika */}
          {user && (
            <div className={`flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs ${collapsed ? 'lg:flex-col lg:p-1.5' : ''}`}>
              <div className="flex items-center gap-2.5 min-w-0" title={collapsed ? `${user.firstName} ${user.lastName} (${user.role})` : undefined}>
                {/* Avatar z inicjałami (np. PA) */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs shadow-xs">
                  {getInitials(user.firstName, user.lastName)}
                </div>

                <div className={`flex flex-col min-w-0 ${hide}`}>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 capitalize truncate">
                    {user.role}
                  </span>
                </div>
              </div>

              {/* Przycisk wylogowania */}
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition shrink-0"
                title="Wyloguj się"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
