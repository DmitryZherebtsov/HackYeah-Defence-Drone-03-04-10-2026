import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, MapPinned, Plane, Plus, Radar, Users, Wind, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LocationPickerMap } from '../components/LocationPickerMap';
import { apiError, MISSION_STATUS_LABELS, MissionListItem } from '../types/drones';
import { Badge, Toast, btnPrimary, btnSecondary, inputCls, labelCls, useToast } from '../components/drones/DroneUi';

const STEPS = [
  { no: 1, label: 'Flota', desc: 'Parametry dronów' },
  { no: 2, label: 'Pogoda i flota', desc: 'Blokada + dobór' },
  { no: 3, label: 'Wzór A / B', desc: 'Koeficjenty lotu' },
  { no: 4, label: 'Strefa i trasy', desc: 'Podwarstwy, żmija' },
  { no: 5, label: 'Zespół', desc: 'Role operacyjne' },
  { no: 6, label: 'Wylot', desc: 'Transit i telemetria' },
  { no: 7, label: 'Akcje w locie', desc: 'Detekcja, zrzuty' },
  { no: 8, label: 'Raport', desc: 'PDF / Excel' },
];

const CreateMissionModal: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const { toast, show } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [base, setBase] = useState<{ lat: number; lng: number } | null>(null);
  const [baseName, setBaseName] = useState('');
  const [radio, setRadio] = useState(5);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!base) {
      show('error', 'Wskaż na mapie Strefę Zero – bezpieczną krawędź strefy zagrożenia');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/missions', { name, description, base: { ...base, name: baseName || undefined }, radioRangeKm: radio });
      onCreated(res.data.mission.id);
    } catch (err) {
      show('error', apiError(err, 'Nie udało się utworzyć operacji'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1500] bg-slate-950/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <Toast toast={toast} />
      <form onSubmit={submit} className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200/80 shadow-2xl my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Nowa operacja dronowa</h2>
            <p className="text-xs text-slate-500">Krok 2 – początek sytuacji kryzysowej</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Nazwa operacji</label>
            <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Powódź – osiedle nad rzeką" />
          </div>
          <div>
            <label className={labelCls}>Opis sytuacji</label>
            <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Strefa Zero – mobilne centrum dowodzenia (kliknij na mapie)</label>
            <LocationPickerMap lat={base?.lat ?? null} lng={base?.lng ?? null} onChange={(lat, lng) => setBase({ lat, lng })} height="260px" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Opis Strefy Zero</label>
              <input className={inputCls} value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder="np. parking przy wale" />
            </div>
            <div>
              <label className={labelCls}>Zasięg łączności RTK / MESH: {radio} km</label>
              <input type="range" min={1} max={20} step={0.5} value={radio} onChange={(e) => setRadio(Number(e.target.value))} className="w-full accent-indigo-600" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Utwórz i przejdź do planowania
          </button>
        </div>
      </form>
    </div>
  );
};

export const MissionsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const canCreate = user?.role === 'admin' || user?.role === 'koordynator';
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = () =>
      api
        .get('/missions')
        .then((res) => setMissions(res.data.missions || []))
        .catch((err) => show('error', apiError(err, 'Nie udało się pobrać operacji')))
        .finally(() => setLoading(false));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [show]);

  return (
    <div className="space-y-6">
      <Toast toast={toast} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <Radar className="h-4 w-4" />
            <span>Centrum dowodzenia C2</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Operacje Dronowe</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Planowanie i prowadzenie akcji poszukiwawczo-ratowniczych z użyciem floty dronów – od doboru maszyn w bieżącej pogodzie po raport dla służb.
          </p>
        </div>
        {canCreate && (
          <button className={btnPrimary} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nowa operacja
          </button>
        )}
      </div>

      <div className="rounded-3xl bg-white border border-slate-200/80 shadow-xs p-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {STEPS.map((s, i) => (
            <div key={s.no} className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-2xl bg-slate-50 border border-slate-200/80 px-3 py-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-[11px] font-extrabold">{s.no}</span>
                <div>
                  <div className="text-xs font-bold text-slate-800">{s.label}</div>
                  <div className="text-[10px] text-slate-400">{s.desc}</div>
                </div>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300" />}
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : missions.length === 0 ? (
        <div className="rounded-3xl bg-white border border-dashed border-slate-300 p-12 text-center">
          <Plane className="h-10 w-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">Brak operacji. {canCreate ? 'Utwórz pierwszą operację dronową.' : ''}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {missions.map((m) => (
            <Link
              key={m.id}
              to={`/dashboard/missions/${m.id}`}
              className="group rounded-3xl bg-white border border-slate-200/80 shadow-xs p-5 hover:border-indigo-300 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900 group-hover:text-indigo-700 truncate">{m.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{m.description || m.base.name || 'Operacja poszukiwawczo-ratownicza'}</p>
                </div>
                <Badge className={MISSION_STATUS_LABELS[m.status].cls}>{MISSION_STATUS_LABELS[m.status].label}</Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-4">
                {[
                  { icon: <MapPinned className="h-3.5 w-3.5" />, label: 'Strefa', value: m.areaKm2 ? `${m.areaKm2} km²` : '—' },
                  { icon: <Plane className="h-3.5 w-3.5" />, label: 'Drony', value: m.drones || '—' },
                  { icon: <Users className="h-3.5 w-3.5" />, label: 'Odnalezieni', value: m.persons },
                  { icon: <Wind className="h-3.5 w-3.5" />, label: 'Porywy', value: m.weather ? `${m.weather.windGust.toFixed(1)} m/s` : '—' },
                ].map((k) => (
                  <div key={k.label} className="rounded-2xl bg-slate-50 border border-slate-200/80 p-2">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {k.icon} {k.label}
                    </div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{k.value}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 text-[11px] text-slate-400">
                <span>
                  {m.createdBy ? `${m.createdBy.firstName} ${m.createdBy.lastName}` : ''} • {new Date(m.createdAt).toLocaleString('pl-PL')}
                </span>
                <span className="flex items-center gap-1 font-bold text-indigo-600">
                  Otwórz <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && <CreateMissionModal onClose={() => setCreating(false)} onCreated={(id) => navigate(`/dashboard/missions/${id}`)} />}
    </div>
  );
};

export default MissionsPage;
