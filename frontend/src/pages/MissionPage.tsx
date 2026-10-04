import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, Radar, Trash2 } from 'lucide-react';
import api from '../services/api';
import { apiError, Mission, MISSION_STATUS_LABELS, ROLE_LABELS } from '../types/drones';
import { Badge, Toast, btnSecondary, formatSim, useToast } from '../components/drones/DroneUi';
import { MissionPlanning } from '../components/drones/MissionPlanning';
import { MissionPreparation } from '../components/drones/MissionPreparation';
import { MissionControl } from '../components/drones/MissionControl';

export type ActFn = (key: string, method: 'post' | 'put' | 'patch', path: string, body?: unknown) => Promise<boolean>;

export interface MissionViewProps {
  mission: Mission;
  act: ActFn;
  busy: string | null;
}

const LIVE_STATUSES = ['przygotowanie', 'aktywna', 'powrot'];

const STAGES = [
  { key: 'planowanie', label: 'Planowanie', steps: 'Kroki 2–5' },
  { key: 'przygotowanie', label: 'Strefa Zero', steps: 'Krok 2' },
  { key: 'aktywna', label: 'Operacja', steps: 'Kroki 6–7' },
  { key: 'zakonczona', label: 'Raport', steps: 'Krok 8' },
];

export const MissionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/missions/${id}`);
      if (!busyRef.current) setMission(res.data.mission);
    } catch (err) {
      show('error', apiError(err, 'Nie udało się pobrać operacji'));
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => {
    load();
  }, [load]);

  // Telemetria w czasie rzeczywistym – odpytywanie serwera C2
  const status = mission?.status;
  useEffect(() => {
    if (!status || !LIVE_STATUSES.includes(status)) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [status, load]);

  const act: ActFn = useCallback(
    async (key, method, path, body) => {
      busyRef.current = key;
      setBusy(key);
      try {
        const res = await api[method](`/missions/${id}${path}`, body);
        if (res.data.mission) setMission(res.data.mission);
        if (res.data.message) show('success', res.data.message);
        return true;
      } catch (err) {
        show('error', apiError(err, 'Operacja nie powiodła się'));
        return false;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [id, show]
  );

  const remove = async () => {
    if (!mission || !window.confirm(`Usunąć operację „${mission.name}”?`)) return;
    try {
      await api.delete(`/missions/${mission.id}`);
      navigate('/dashboard/missions');
    } catch (err) {
      show('error', apiError(err, 'Nie udało się usunąć operacji'));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }
  if (!mission) {
    return (
      <div className="text-center py-24 text-sm text-slate-500">
        Nie znaleziono operacji. <Link to="/dashboard/missions" className="text-indigo-600 font-bold">Wróć do listy</Link>
      </div>
    );
  }

  const stageIndex = mission.status === 'powrot' ? 2 : STAGES.findIndex((s) => s.key === mission.status);
  const statusInfo = MISSION_STATUS_LABELS[mission.status];
  // Ekran operacji w toku – uproszczony nagłówek bez opisu i paska etapów
  const inFlight = mission.status === 'aktywna' || mission.status === 'powrot';

  return (
    <div className={inFlight ? '' : 'space-y-5'}>
      <Toast toast={toast} />
      {/* W trakcie operacji nagłówek jest ukryty – całe miejsce dla obrazu z drona */}
      <div className={`flex flex-wrap items-start justify-between gap-4 ${inFlight ? 'hidden' : ''}`}>
        <div className="min-w-0">
          <Link to="/dashboard/missions" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Operacje dronowe
          </Link>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <Radar className="h-4 w-4" />
            <span>
              Operacja C2 {mission.data.simSeconds > 0 && `• ${formatSim(mission.data.simSeconds)}`} {LIVE_STATUSES.includes(mission.status) && (mission.data.paused ? '• PAUZA' : `• symulacja ×${mission.timeScale}`)}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight truncate">{mission.name}</h1>
          {mission.description && !inFlight && <p className="text-sm text-slate-500 mt-1 max-w-3xl">{mission.description}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge className={statusInfo.cls}>{statusInfo.label}</Badge>
            {mission.permissions.roles.map((r) => (
              <Badge key={r} className="bg-violet-50 text-violet-700 border-violet-200">
                Twoja rola: {ROLE_LABELS[r].label}
              </Badge>
            ))}
            {mission.permissions.roles.length === 0 && (
              <Badge className="bg-slate-100 text-slate-600 border-slate-200">Podgląd – brak przydzielonej roli</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(mission.status === 'aktywna' || mission.status === 'powrot' || mission.status === 'zakonczona') && (
            <Link to={`/dashboard/missions/${mission.id}/report`} className={btnSecondary}>
              <FileText className="h-4 w-4" /> Raport operacji
            </Link>
          )}
          {mission.permissions.isCommander && ['planowanie', 'przygotowanie', 'zakonczona'].includes(mission.status) && (
            <button className={`${btnSecondary} hover:text-red-600`} onClick={remove}>
              <Trash2 className="h-4 w-4" /> Usuń
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-4 gap-2 ${inFlight ? 'hidden' : ''}`}>
        {STAGES.map((s, i) => (
          <div
            key={s.key}
            className={`rounded-2xl border px-3 py-2 ${
              i === stageIndex ? 'bg-indigo-600 border-indigo-600 text-white' : i < stageIndex ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-white border-slate-200/80 text-slate-400'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{s.steps}</div>
            <div className="text-xs sm:text-sm font-extrabold">{s.label}</div>
          </div>
        ))}
      </div>

      {mission.status === 'planowanie' && <MissionPlanning mission={mission} act={act} busy={busy} />}
      {mission.status === 'przygotowanie' && <MissionPreparation mission={mission} act={act} busy={busy} />}
      {['aktywna', 'powrot', 'zakonczona'].includes(mission.status) && <MissionControl mission={mission} act={act} busy={busy} />}
    </div>
  );
};

export default MissionPage;
