import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudRain, Droplets, Moon, Sun, Thermometer, Wind, XCircle } from 'lucide-react';
import { windFromLabel, type WeatherSnapshot } from '../../types/drones';

export type ToastState = { type: 'success' | 'error'; message: string } | null;

export const useToast = () => {
  const [toast, setToast] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const show = useCallback((type: 'success' | 'error', message: string) => setToast({ type, message }), []);
  return { toast, show };
};

export const Toast: React.FC<{ toast: ToastState }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div
      className={`no-print fixed bottom-6 right-6 z-[2000] max-w-sm flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-xl text-sm font-semibold ${
        toast.type === 'success' ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800' : 'bg-red-50/95 border-red-200 text-red-800'
      }`}
    >
      {toast.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
      <span>{toast.message}</span>
    </div>
  );
};

export const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${className}`}>{children}</span>
);

export const BatteryBar: React.FC<{ value: number; compact?: boolean }> = ({ value, compact }) => {
  const v = Math.max(0, Math.min(100, value));
  const color = v > 50 ? 'bg-emerald-500' : v > 25 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className={`flex-1 rounded-full bg-slate-200 overflow-hidden ${compact ? 'h-1.5' : 'h-2'}`}>
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-[11px] font-bold text-slate-600 tabular-nums w-9 text-right">{Math.round(v)}%</span>
    </div>
  );
};

export const SectionCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, icon, subtitle, actions, className = '', children }) => (
  <section className={`rounded-3xl bg-white border border-slate-200/80 shadow-xs p-5 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        {icon && <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">{icon}</div>}
        <div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children}
  </section>
);

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm shadow-indigo-600/25 transition active:scale-95';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 text-slate-700 text-xs font-bold transition active:scale-95';
export const btnDanger =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm transition active:scale-95';
export const btnSuccess =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm transition active:scale-95';
export const inputCls =
  'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400';
export const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1';

export const WEATHER_SOURCE_LABELS: Record<WeatherSnapshot['source'], string> = {
  'open-meteo': 'Open-Meteo (na żywo)',
  symulacja: 'Dane zastępcze (brak łączności)',
  reczna: 'Symulacja koordynatora',
};

export const WeatherStrip: React.FC<{ weather: WeatherSnapshot | null; compact?: boolean }> = ({ weather, compact }) => {
  if (!weather) return <div className="text-xs text-slate-400">Brak danych pogodowych – uruchom analizę.</div>;
  const items = [
    { icon: <Thermometer className="h-4 w-4" />, label: 'Temperatura', value: `${weather.temperature.toFixed(1)}°C`, cls: 'text-orange-600 bg-orange-50' },
    {
      icon: <Wind className="h-4 w-4" style={weather.windDirection !== undefined ? { transform: `rotate(${weather.windDirection + 90}deg)` } : undefined} />,
      label: weather.windDirection !== undefined ? `Wiatr ${windFromLabel(weather.windDirection)}` : 'Wiatr',
      value: `${weather.windSpeed.toFixed(1)} m/s`,
      cls: 'text-sky-600 bg-sky-50',
    },
    { icon: <Wind className="h-4 w-4" />, label: 'Porywy', value: `${weather.windGust.toFixed(1)} m/s`, cls: 'text-indigo-600 bg-indigo-50' },
    {
      icon: weather.precipitation > 0 ? <CloudRain className="h-4 w-4" /> : <Droplets className="h-4 w-4" />,
      label: 'Opad',
      value: `${weather.precipitation.toFixed(1)} mm/h`,
      cls: 'text-cyan-600 bg-cyan-50',
    },
    {
      icon: weather.isDay ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      label: 'Pora',
      value: weather.isDay ? 'Dzień' : 'Noc',
      cls: weather.isDay ? 'text-amber-600 bg-amber-50' : 'text-violet-600 bg-violet-50',
    },
  ];
  return (
    <div>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-5'}`}>
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-2.5 min-w-0">
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${it.cls}`}>{it.icon}</div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{it.label}</div>
              <div className="text-sm font-extrabold text-slate-900 tabular-nums truncate">{it.value}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-slate-400">
        Źródło: {WEATHER_SOURCE_LABELS[weather.source]} • {new Date(weather.fetchedAt).toLocaleTimeString('pl-PL')}
      </div>
    </div>
  );
};

export const formatSim = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `T+${h}h ${String(m % 60).padStart(2, '0')}m` : `T+${m}m`;
};
