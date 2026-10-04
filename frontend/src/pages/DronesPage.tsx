import React, { useEffect, useMemo, useState } from 'react';
import {
  BatteryCharging,
  CloudSun,
  Crosshair,
  Eye,
  Flame,
  Loader2,
  Megaphone,
  Package,
  Pencil,
  Plane,
  Plus,
  Radio,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Thermometer,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { apiError, BatteryCurvePoint, Drone, DroneCategory, FleetAnalysisItem, WeatherSnapshot } from '../types/drones';
import { Badge, Toast, WeatherStrip, btnPrimary, btnSecondary, inputCls, labelCls, useToast } from '../components/drones/DroneUi';

const rainLimitForIp = (ip: string): number => {
  const digit = ip?.toUpperCase().match(/^IP[0-6X]([0-9X])$/)?.[1] ?? '0';
  const table: Record<string, number> = { X: 0, '0': 0, '1': 0.5, '2': 1, '3': 2.5, '4': 7.5, '5': 15, '6': 30, '7': 50, '8': 50, '9': 50 };
  return table[digit] ?? 0;
};

const STATUS_BADGE: Record<Drone['status'], { label: string; cls: string }> = {
  dostepny: { label: 'Dostępny', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  w_misji: { label: 'W operacji', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  serwis: { label: 'Serwis', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

/** Mini-wykres krzywej spadku baterii: czas lotu w funkcji temperatury */
const BatteryCurveChart: React.FC<{ curve: BatteryCurvePoint[]; highlightTemp?: number }> = ({ curve, highlightTemp }) => {
  const pts = [...curve].sort((a, b) => a.temp - b.temp);
  if (pts.length === 0) return null;
  const W = 220;
  const H = 70;
  const minT = Math.min(-20, pts[0].temp);
  const maxT = Math.max(40, pts[pts.length - 1].temp);
  const maxM = Math.max(...pts.map((p) => p.minutes)) * 1.15;
  const x = (t: number) => ((t - minT) / (maxT - minT)) * (W - 20) + 10;
  const y = (m: number) => H - 14 - (m / maxM) * (H - 24);
  const line = pts.map((p) => `${x(p.temp)},${y(p.minutes)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px]">
      <line x1={x(0)} x2={x(0)} y1={6} y2={H - 14} stroke="#cbd5e1" strokeDasharray="3 3" />
      <polyline points={line} fill="none" stroke="#6366f1" strokeWidth={2} />
      {pts.map((p) => (
        <g key={p.temp}>
          <circle cx={x(p.temp)} cy={y(p.minutes)} r={3} fill="#6366f1" />
          <text x={x(p.temp)} y={y(p.minutes) - 6} fontSize={9} textAnchor="middle" fill="#64748b">
            {p.minutes}′
          </text>
          <text x={x(p.temp)} y={H - 3} fontSize={9} textAnchor="middle" fill="#94a3b8">
            {p.temp}°
          </text>
        </g>
      ))}
      {highlightTemp !== undefined && (
        <line x1={x(highlightTemp)} x2={x(highlightTemp)} y1={4} y2={H - 14} stroke="#f97316" strokeWidth={1.5} />
      )}
    </svg>
  );
};

type DroneForm = Omit<Drone, 'id' | 'organization' | 'organizationId'>;

const emptyForm = (category: DroneCategory = 'zwiadowczy'): DroneForm => ({
  name: '',
  model: '',
  category,
  status: 'dostepny',
  maxWindSpeed: 12,
  ipRating: 'IP43',
  minTemp: -10,
  maxTemp: 40,
  batteryCurve: [
    { temp: -5, minutes: 25 },
    { temp: 20, minutes: 40 },
  ],
  hasThermal: category === 'zwiadowczy',
  hasRgb: true,
  hasSpeaker: false,
  cameraFovDeg: 60,
  cruiseSpeed: category === 'zwiadowczy' ? 14 : 17,
  maxPayloadKg: category === 'zwiadowczy' ? 0 : 5,
  radioRangeKm: 10,
  weightKg: 2,
  notes: '',
});

const DroneFormModal: React.FC<{
  initial: DroneForm;
  editing: boolean;
  onClose: () => void;
  onSave: (form: DroneForm) => Promise<void>;
}> = ({ initial, editing, onClose, onSave }) => {
  const [form, setForm] = useState<DroneForm>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof DroneForm>(k: K, v: DroneForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof DroneForm) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as any);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1500] bg-slate-950/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="w-full max-w-3xl rounded-3xl bg-white border border-slate-200/80 shadow-2xl my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">{editing ? 'Edycja drona' : 'Nowy dron we flocie'}</h2>
            <p className="text-xs text-slate-500">Kluczowe parametry lotu wykorzystywane przez Wzór A i Wzór B</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Nazwa / znak</label>
              <input required className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Zwiad-07" />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input required className={inputCls} value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="DJI Matrice 30T" />
            </div>
            <div>
              <label className={labelCls}>Kategoria operacyjna</label>
              <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value as DroneCategory)}>
                <option value="zwiadowczy">Zwiadowczy (szukanie i ocena krytyczności)</option>
                <option value="dostawczy">Dostawczy (zrzut ładunku)</option>
              </select>
            </div>
          </div>

          <fieldset className="rounded-2xl border border-slate-200/80 p-4">
            <legend className="px-2 text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5" /> Granice pogodowe
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Maks. porywy (m/s)</label>
                <input type="number" step="0.1" min="1" required className={inputCls} value={form.maxWindSpeed} onChange={num('maxWindSpeed')} />
              </div>
              <div>
                <label className={labelCls}>Klasa szczelności</label>
                <input
                  required
                  pattern="^[Ii][Pp][0-6Xx][0-9Xx]$"
                  className={inputCls}
                  value={form.ipRating}
                  onChange={(e) => set('ipRating', e.target.value.toUpperCase())}
                  placeholder="IP55"
                />
                <p className="text-[10px] text-slate-400 mt-1">Dopuszczalny opad: {rainLimitForIp(form.ipRating)} mm/h</p>
              </div>
              <div>
                <label className={labelCls}>Temp. min (°C)</label>
                <input type="number" required className={inputCls} value={form.minTemp} onChange={num('minTemp')} />
              </div>
              <div>
                <label className={labelCls}>Temp. maks (°C)</label>
                <input type="number" required className={inputCls} value={form.maxTemp} onChange={num('maxTemp')} />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-slate-200/80 p-4">
            <legend className="px-2 text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
              <BatteryCharging className="h-3.5 w-3.5" /> Krzywa spadku baterii
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="space-y-2">
                {form.batteryCurve.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="number"
                      className={inputCls}
                      value={p.temp}
                      onChange={(e) => set('batteryCurve', form.batteryCurve.map((q, j) => (j === i ? { ...q, temp: Number(e.target.value) } : q)))}
                    />
                    <span className="text-xs text-slate-400 shrink-0">°C →</span>
                    <input
                      type="number"
                      min="1"
                      className={inputCls}
                      value={p.minutes}
                      onChange={(e) => set('batteryCurve', form.batteryCurve.map((q, j) => (j === i ? { ...q, minutes: Number(e.target.value) } : q)))}
                    />
                    <span className="text-xs text-slate-400 shrink-0">min</span>
                    <button
                      type="button"
                      disabled={form.batteryCurve.length <= 1}
                      onClick={() => set('batteryCurve', form.batteryCurve.filter((_, j) => j !== i))}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => set('batteryCurve', [...form.batteryCurve, { temp: 30, minutes: form.batteryCurve[form.batteryCurve.length - 1]?.minutes ?? 30 }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Punkt krzywej
                </button>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3">
                <BatteryCurveChart curve={form.batteryCurve} />
                <p className="text-[10px] text-slate-400 text-center">Czas lotu [min] w funkcji temperatury [°C]</p>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-slate-200/80 p-4">
            <legend className="px-2 text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
              <ScanSearch className="h-3.5 w-3.5" /> Wyposażenie i osiągi
            </legend>
            <div className="flex flex-wrap gap-4 mb-4">
              {(
                [
                  ['hasThermal', 'Termowizja FLIR (loty nocne)'],
                  ['hasRgb', 'Kamera dzienna RGB'],
                  ['hasSpeaker', 'Głośnik (wywiad gestami)'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <label className={labelCls}>Prędkość (m/s)</label>
                <input type="number" step="0.1" min="1" required className={inputCls} value={form.cruiseSpeed} onChange={num('cruiseSpeed')} />
              </div>
              <div>
                <label className={labelCls}>Udźwig (kg)</label>
                <input type="number" step="0.1" min="0" className={inputCls} value={form.maxPayloadKg} onChange={num('maxPayloadKg')} />
              </div>
              <div>
                <label className={labelCls}>Zasięg radia (km)</label>
                <input type="number" step="0.1" min="0.5" className={inputCls} value={form.radioRangeKm} onChange={num('radioRangeKm')} />
              </div>
              <div>
                <label className={labelCls}>FOV kamery (°)</label>
                <input type="number" min="10" max="150" className={inputCls} value={form.cameraFovDeg} onChange={num('cameraFovDeg')} />
              </div>
              <div>
                <label className={labelCls}>Masa (kg)</label>
                <input type="number" step="0.01" min="0.1" className={inputCls} value={form.weightKg} onChange={num('weightKg')} />
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Status floty</label>
              <select className={inputCls} value={form.status} disabled={form.status === 'w_misji'} onChange={(e) => set('status', e.target.value as Drone['status'])}>
                <option value="dostepny">Dostępny</option>
                <option value="serwis">Serwis</option>
                {form.status === 'w_misji' && <option value="w_misji">W operacji</option>}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Uwagi</label>
              <input className={inputCls} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Zapisz zmiany' : 'Dodaj do floty'}
          </button>
        </div>
      </form>
    </div>
  );
};

export const DronesPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'koordynator';
  const { toast, show } = useToast();
  const [drones, setDrones] = useState<Drone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | DroneCategory>('all');
  const [editing, setEditing] = useState<Drone | null>(null);
  const [creating, setCreating] = useState(false);
  const [evalPoint, setEvalPoint] = useState({ lat: '50.4380', lng: '16.6548' });
  const [evaluating, setEvaluating] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, FleetAnalysisItem>>({});

  const load = async () => {
    try {
      const res = await api.get('/drones');
      setDrones(res.data.drones || []);
    } catch (err) {
      show('error', apiError(err, 'Nie udało się pobrać floty'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evaluate = async () => {
    setEvaluating(true);
    try {
      const res = await api.get('/drones/evaluate', { params: { lat: evalPoint.lat, lng: evalPoint.lng } });
      setWeather(res.data.weather);
      setEvaluations(Object.fromEntries((res.data.evaluations as FleetAnalysisItem[]).map((e) => [e.droneId, e])));
    } catch (err) {
      show('error', apiError(err, 'Nie udało się ocenić floty'));
    } finally {
      setEvaluating(false);
    }
  };

  const save = async (form: DroneForm) => {
    try {
      if (editing) await api.put(`/drones/${editing.id}`, form);
      else await api.post('/drones', form);
      show('success', editing ? 'Zapisano parametry drona' : 'Dodano drona do floty');
      setEditing(null);
      setCreating(false);
      await load();
    } catch (err) {
      show('error', apiError(err, 'Nie udało się zapisać drona'));
    }
  };

  const remove = async (d: Drone) => {
    if (!window.confirm(`Usunąć drona ${d.name} z floty?`)) return;
    try {
      await api.delete(`/drones/${d.id}`);
      show('success', 'Dron usunięty z floty');
      await load();
    } catch (err) {
      show('error', apiError(err, 'Nie udało się usunąć drona'));
    }
  };

  const visible = useMemo(() => drones.filter((d) => filter === 'all' || d.category === filter), [drones, filter]);
  const stats = useMemo(
    () => ({
      scouts: drones.filter((d) => d.category === 'zwiadowczy').length,
      delivery: drones.filter((d) => d.category === 'dostawczy').length,
      thermal: drones.filter((d) => d.hasThermal).length,
      busy: drones.filter((d) => d.status !== 'dostepny').length,
    }),
    [drones]
  );

  return (
    <div className="space-y-6">
      <Toast toast={toast} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <Plane className="h-4 w-4" />
            <span>Krok 1 • System łączący drony</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Flota Dronów</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Drony zwiadowcze szukają i oceniają krytyczność, drony dostawcze czekają w bazie na konkretne żądanie zrzutu. Dla każdej maszyny system przechowuje
            granice pogodowe, krzywą spadku baterii i wyposażenie.
          </p>
        </div>
        {canManage && (
          <button className={btnPrimary} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Dodaj drona
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Drony zwiadowcze', value: stats.scouts, icon: <Eye className="h-5 w-5" />, cls: 'bg-indigo-50 text-indigo-600' },
          { label: 'Drony dostawcze', value: stats.delivery, icon: <Package className="h-5 w-5" />, cls: 'bg-teal-50 text-teal-600' },
          { label: 'Z termowizją FLIR', value: stats.thermal, icon: <Flame className="h-5 w-5" />, cls: 'bg-orange-50 text-orange-600' },
          { label: 'W operacji / serwisie', value: stats.busy, icon: <ShieldCheck className="h-5 w-5" />, cls: 'bg-amber-50 text-amber-600' },
        ].map((k) => (
          <div key={k.label} className="rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k.label}</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{k.value}</div>
            </div>
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${k.cls}`}>{k.icon}</div>
          </div>
        ))}
      </div>

      <section className="rounded-3xl bg-white border border-slate-200/80 shadow-xs p-5">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex items-start gap-3 mr-auto">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <CloudSun className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Ocena floty w bieżącej pogodzie</h2>
              <p className="text-xs text-slate-500">Wzór B (współczynnik powodzenia lotu) i Wzór A (pokrycie terenu) dla wskazanego punktu</p>
            </div>
          </div>
          <div>
            <label className={labelCls}>Szer. geogr.</label>
            <input className={`${inputCls} w-28`} value={evalPoint.lat} onChange={(e) => setEvalPoint((p) => ({ ...p, lat: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Dł. geogr.</label>
            <input className={`${inputCls} w-28`} value={evalPoint.lng} onChange={(e) => setEvalPoint((p) => ({ ...p, lng: e.target.value }))} />
          </div>
          <button className={btnPrimary} onClick={evaluate} disabled={evaluating}>
            {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Pobierz komunikat meteo
          </button>
        </div>
        {weather ? <WeatherStrip weather={weather} /> : <p className="text-xs text-slate-400">Pobierz pogodę, aby zobaczyć, które drony mogą latać w danych warunkach.</p>}
      </section>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'Wszystkie'],
            ['zwiadowczy', 'Zwiadowcze'],
            ['dostawczy', 'Dostawcze'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${filter === k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((d) => {
            const ev = evaluations[d.id];
            return (
              <article key={d.id} className="rounded-3xl bg-white border border-slate-200/80 shadow-xs p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl shrink-0 ${
                        d.category === 'zwiadowczy' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'
                      }`}
                    >
                      {d.category === 'zwiadowczy' ? <Crosshair className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-slate-900 truncate">{d.name}</h3>
                      <p className="text-xs text-slate-500 truncate">{d.model}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={STATUS_BADGE[d.status].cls}>{STATUS_BADGE[d.status].label}</Badge>
                    <Badge className={d.category === 'zwiadowczy' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}>
                      {d.category}
                    </Badge>
                  </div>
                </div>

                {ev && (
                  <div
                    className={`rounded-2xl border p-3 text-xs ${
                      ev.weather.canFly ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{ev.weather.canFly ? 'Może latać' : 'Zablokowany przez pogodę'}</span>
                      <span className="tabular-nums">B = {ev.weather.coefficient.toFixed(2)}</span>
                    </div>
                    {ev.weather.canFly ? (
                      <div className="mt-1">
                        Czas lotu {ev.capability.effectiveMinutes} min (rezerwa RTH {ev.capability.reserveMinutes} min)
                        {d.category === 'zwiadowczy' ? ` • pokrycie A ≈ ${ev.capability.areaKm2} km²` : ` • bezpieczny udźwig ${ev.capability.effectivePayloadKg} kg`}
                      </div>
                    ) : (
                      <ul className="mt-1 list-disc pl-4">
                        {ev.weather.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-2">
                    <Wind className="h-4 w-4 mx-auto text-sky-600" />
                    <div className="text-sm font-extrabold text-slate-900 mt-1">{d.maxWindSpeed} m/s</div>
                    <div className="text-[10px] text-slate-400 font-semibold">maks. porywy</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-2">
                    <ShieldCheck className="h-4 w-4 mx-auto text-cyan-600" />
                    <div className="text-sm font-extrabold text-slate-900 mt-1">{d.ipRating}</div>
                    <div className="text-[10px] text-slate-400 font-semibold">≤ {rainLimitForIp(d.ipRating)} mm/h</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-2">
                    <Thermometer className="h-4 w-4 mx-auto text-orange-600" />
                    <div className="text-sm font-extrabold text-slate-900 mt-1">
                      {d.minTemp}…{d.maxTemp}°
                    </div>
                    <div className="text-[10px] text-slate-400 font-semibold">zakres temp.</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                    <BatteryCharging className="h-3 w-3" /> Krzywa spadku baterii
                  </div>
                  <BatteryCurveChart curve={d.batteryCurve} highlightTemp={weather?.temperature} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {d.hasThermal && <Badge className="bg-orange-50 text-orange-700 border-orange-200"><Flame className="h-3 w-3" /> FLIR</Badge>}
                  {d.hasRgb && <Badge className="bg-slate-100 text-slate-700 border-slate-200"><Eye className="h-3 w-3" /> RGB</Badge>}
                  {d.hasSpeaker && <Badge className="bg-violet-50 text-violet-700 border-violet-200"><Megaphone className="h-3 w-3" /> Głośnik</Badge>}
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200"><Radio className="h-3 w-3" /> {d.radioRangeKm} km</Badge>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200">{d.cruiseSpeed} m/s</Badge>
                  {d.maxPayloadKg > 0 && <Badge className="bg-teal-50 text-teal-700 border-teal-200"><Package className="h-3 w-3" /> {d.maxPayloadKg} kg</Badge>}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400 truncate">{d.organization?.name ?? 'Flota wspólna'}</span>
                  {canManage && (
                    <div className="flex gap-1">
                      <button className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50" title="Edytuj" onClick={() => setEditing(d)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                        title="Usuń"
                        disabled={d.status === 'w_misji'}
                        onClick={() => remove(d)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {visible.length === 0 && <div className="col-span-full text-center text-sm text-slate-400 py-12">Brak dronów w tej kategorii.</div>}
        </div>
      )}

      {(creating || editing) && (
        <DroneFormModal
          initial={editing ? { ...editing, notes: editing.notes ?? '' } : emptyForm(filter === 'dostawczy' ? 'dostawczy' : 'zwiadowczy')}
          editing={!!editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={save}
        />
      )}
    </div>
  );
};

export default DronesPage;
