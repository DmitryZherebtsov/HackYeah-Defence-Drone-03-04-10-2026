import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  CloudLightning,
  Crosshair,
  FileText,
  Flag,
  History,
  LifeBuoy,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Users,
  Video,
  WifiOff,
  Wrench,
} from 'lucide-react';
import type { MissionViewProps } from '../../pages/MissionPage';
import {
  CRITICALITY_STYLES,
  DELIVERY_STATUS_LABELS,
  Detection,
  Mission,
  MissionRole,
  PAYLOAD_LABELS,
  PHASE_LABELS,
} from '../../types/drones';
import { MissionMap, MapDrawMode } from './MissionMap';
import { DetectionPhoto, DroneCameraFeed } from './DroneCamera';
import { Badge, BatteryBar, SectionCard, btnDanger, btnPrimary, btnSecondary, btnSuccess, formatSim, inputCls, labelCls } from './DroneUi';

type Tab = MissionRole | 'timeline';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'dowodca', label: 'Drony', icon: <Flag className="h-3.5 w-3.5" /> },
  { key: 'weryfikator', label: 'Weryfikacja', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { key: 'ratownik', label: 'Ratownicy', icon: <LifeBuoy className="h-3.5 w-3.5" /> },
  { key: 'logistyk', label: 'Ładunki', icon: <Package className="h-3.5 w-3.5" /> },
  { key: 'technik', label: 'Baterie', icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: 'timeline', label: 'Dziennik', icon: <History className="h-3.5 w-3.5" /> },
];

const canAct = (m: Mission, role: MissionRole) => m.permissions.isCommander || m.permissions.roles.includes(role);

const NoRole: React.FC<{ role: string }> = ({ role }) => (
  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3 text-[11px] text-slate-500">Podgląd – akcje dostępne dla roli: {role}.</div>
);

/** Symulowany podgląd z kamery drona (IR / RGB) do oceny przez Weryfikatora AI */
const DronePreview: React.FC<{ det: Detection }> = ({ det }) => {
  const ir = det.source === 'termowizja';
  const blobs = Array.from({ length: Math.min(det.persons, 5) }, (_, i) => ({ x: 70 + i * 34 + (i % 2) * 8, y: 62 + (i % 2) * 18 }));
  return (
    <svg viewBox="0 0 280 140" className="w-full h-32 rounded-xl">
      <defs>
        <radialGradient id={`hot-${det.id}`}>
          <stop offset="0%" stopColor={ir ? '#fff7ae' : '#f1f5f9'} />
          <stop offset="40%" stopColor={ir ? '#fb923c' : '#94a3b8'} />
          <stop offset="100%" stopColor={ir ? '#7c2d12' : '#475569'} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`bg-${det.id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={ir ? '#1e1b4b' : '#1e3a5f'} />
          <stop offset="100%" stopColor={ir ? '#312e81' : '#0f766e'} />
        </linearGradient>
      </defs>
      <rect width="280" height="140" fill={`url(#bg-${det.id})`} />
      {Array.from({ length: 7 }).map((_, i) => (
        <path key={i} d={`M0 ${20 + i * 18} Q 70 ${12 + i * 18} 140 ${22 + i * 18} T 280 ${18 + i * 18}`} stroke={ir ? '#4338ca' : '#38bdf8'} strokeOpacity="0.25" fill="none" />
      ))}
      {det.position === 'na_dachu' && <polygon points="40,110 120,70 200,110" fill={ir ? '#3730a3' : '#78716c'} opacity="0.8" />}
      {blobs.map((b, i) => (
        <ellipse key={i} cx={b.x} cy={b.y} rx={13} ry={20} fill={`url(#hot-${det.id})`} />
      ))}
      <rect x="54" y="36" width={Math.max(60, det.persons * 36)} height="62" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="8" y="14" fill="#e2e8f0" fontSize="9" fontFamily="monospace">
        {ir ? 'FLIR IR' : 'RGB + OpenCV'} • {det.droneName} • conf {Math.round(det.confidence * 100)}%
      </text>
      <text x="8" y="132" fill="#e2e8f0" fontSize="9" fontFamily="monospace">
        {det.lat.toFixed(5)} {det.lng.toFixed(5)} • symulacja
      </text>
    </svg>
  );
};

const CommanderPanel: React.FC<
  MissionViewProps & { priorityMode: boolean; setPriorityMode: (v: boolean) => void; cameraId: string | null; onCamera: (id: string) => void }
> = ({ mission, act, busy, priorityMode, setPriorityMode, cameraId, onCamera }) => {
  const d = mission.data;
  const allowed = canAct(mission, 'dowodca');
  const active = mission.status === 'aktywna';
  const [wx, setWx] = useState({ windSpeed: '13', windGust: '19', precipitation: '12' });
  const pending = d.recommendations.filter((r) => r.status === 'oczekuje');
  const weather = d.weatherOverride ?? d.weather;

  return (
    <div className="space-y-3">
      {!allowed && <NoRole role="Dowódca" />}
      {pending.map((r) => (
        <div key={r.id} className="rounded-2xl bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2 font-extrabold text-red-800 text-sm">
            <AlertOctagon className="h-4 w-4" /> {r.title}
          </div>
          <p className="text-xs text-red-700 mt-1">{r.details}</p>
          {allowed && (
            <div className="flex gap-2 mt-3">
              <button className={btnDanger} disabled={busy === r.id} onClick={() => act(r.id, 'post', `/recommendations/${r.id}`, { approve: true })}>
                Zatwierdź uziemienie floty
              </button>
              <button className={btnSecondary} disabled={busy === r.id} onClick={() => act(r.id, 'post', `/recommendations/${r.id}`, { approve: false })}>
                Odrzuć
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2">Dron</th>
              <th className="px-3 py-2">Co robi</th>
              <th className="px-3 py-2">Bateria</th>
            </tr>
          </thead>
          <tbody>
            {d.drones.map((x) => {
              const sector = d.sectors.find((s) => s.id === x.sectorId);
              const progress = sector ? Math.round(((x.sectorDone ? sector.waypoints.length : Math.min(x.scanIndex, sector.waypoints.length)) / sector.waypoints.length) * 100) : null;
              const atPerson = !!x.procedure || x.phase === 'monitorowanie';
              return (
                <tr
                  key={x.droneId}
                  onClick={() => onCamera(x.droneId)}
                  title="Pokaż kamerę drona"
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${cameraId === x.droneId ? 'bg-yellow-50' : ''}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      {sector && <span className="h-2 w-2 rounded-full" style={{ background: sector.color }} />}
                      {x.name}
                      {x.linkLost && <WifiOff className="h-3.5 w-3.5 text-red-600" />}
                      {cameraId === x.droneId && <Video className="h-3.5 w-3.5 text-yellow-600" />}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className={`font-semibold ${atPerson ? 'text-amber-700' : x.linkLost ? 'text-red-700' : 'text-slate-700'}`}>
                      {x.linkLost ? 'Brak łączności – szuka offline' : x.activity ?? PHASE_LABELS[x.phase]}
                    </div>
                    {progress !== null && x.category === 'zwiadowczy' && <div className="text-[10px] text-slate-400">sektor {progress}%</div>}
                  </td>
                  <td className="px-3 py-2 w-24">
                    <BatteryBar value={x.linkLost ? x.reportedBattery : x.battery} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {weather && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-slate-50 border border-slate-200/80 px-3 py-2 text-[11px] text-slate-600">
          <CloudLightning className="h-3.5 w-3.5 text-sky-600" />
          <span>{weather.temperature.toFixed(0)}°C</span>
          <span>
            wiatr {weather.windSpeed.toFixed(0)} m/s (porywy {weather.windGust.toFixed(0)})
          </span>
          <span>opad {weather.precipitation.toFixed(1)} mm/h</span>
          <span>{weather.isDay ? 'dzień' : 'noc'}</span>
          {d.weatherOverride && <span className="font-bold text-amber-700">symulacja pogody</span>}
        </div>
      )}

      {allowed && active && (
        <div className="flex flex-wrap gap-2">
          <button className={priorityMode ? btnPrimary : btnSecondary} onClick={() => setPriorityMode(!priorityMode)}>
            <Crosshair className="h-4 w-4" /> {priorityMode ? 'Kliknij punkt na mapie… (anuluj)' : 'Wskaż priorytet na mapie'}
          </button>
          <button
            className={btnDanger}
            disabled={busy === 'end'}
            onClick={() => {
              const reason = window.prompt('Zakończyć operację i wezwać wszystkie drony do bazy? Podaj powód (opcjonalnie):', '');
              if (reason !== null) act('end', 'post', '/end', { reason });
            }}
          >
            Zakończ operację
          </button>
        </div>
      )}

      {allowed && active && (
        <details className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
          <summary className="text-[11px] font-bold text-slate-500 cursor-pointer">Ćwiczenie: symuluj nagłą zmianę pogody</summary>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {(
              [
                ['windSpeed', 'Wiatr m/s'],
                ['windGust', 'Porywy m/s'],
                ['precipitation', 'Opad mm/h'],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input className={inputCls} value={wx[k]} placeholder="bez zmian" onChange={(e) => setWx((w) => ({ ...w, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button className={btnDanger} disabled={busy === 'wx'} onClick={() => act('wx', 'post', '/weather-override', wx)}>
              Zastosuj
            </button>
            {d.weatherOverride && (
              <button className={btnSecondary} disabled={busy === 'wx'} onClick={() => act('wx', 'post', '/weather-override', { clear: true })}>
                Wróć do pogody na żywo
              </button>
            )}
          </div>
        </details>
      )}
    </div>
  );
};

const VerifierPanel: React.FC<MissionViewProps> = ({ mission, act, busy }) => {
  const d = mission.data;
  const allowed = canAct(mission, 'weryfikator');
  const [persons, setPersons] = useState<Record<string, string>>({});
  const queue = d.detections
    .filter((x) => x.status === 'wstepny' && x.criticality !== 'niski')
    .sort((a, b) => (a.criticality === 'krytyczny' ? -1 : 1) - (b.criticality === 'krytyczny' ? -1 : 1) || b.pk - a.pk);
  const low = d.detections.filter((x) => x.status === 'wstepny' && x.criticality === 'niski');
  const authorizations = d.deliveries.filter((x) => x.status === 'oczekuje_autoryzacji');
  const confirmed = d.detections.filter((x) => x.status === 'potwierdzony' && x.rescueStatus !== 'ewakuowano');

  return (
    <div className="space-y-4">
      {!allowed && <NoRole role="Weryfikator AI" />}
      {authorizations.map((dlv) => {
        const det = d.detections.find((x) => x.id === dlv.detectionId);
        return (
          <div key={dlv.id} className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
            <div className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
              <Package className="h-4 w-4" /> Żądanie dostawy: {PAYLOAD_LABELS[dlv.payloadType]} × {dlv.quantity}
            </div>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Gest rozpoznany przez {det?.droneName}: {det?.gesture === 'lekarz' ? 'dwie ręce – potrzebny lekarz' : 'jedna ręka – woda i jedzenie'} ({det?.persons} os.)
            </p>
            {allowed && (
              <div className="flex gap-2 mt-2">
                <button className={btnSuccess} disabled={busy === dlv.id} onClick={() => act(dlv.id, 'post', `/deliveries/${dlv.id}/authorize`, { approve: true })}>
                  Autoryzuj wysłanie drona
                </button>
                <button className={btnSecondary} disabled={busy === dlv.id} onClick={() => act(dlv.id, 'post', `/deliveries/${dlv.id}/authorize`, { approve: false })}>
                  Odrzuć
                </button>
              </div>
            )}
          </div>
        );
      })}

      {queue.length === 0 && authorizations.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">Brak alertów do weryfikacji.</div>
      )}

      {queue.map((det) => (
        <div key={det.id} className="rounded-2xl border border-slate-200/80 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge className={CRITICALITY_STYLES[det.criticality].cls}>
              {CRITICALITY_STYLES[det.criticality].label} • PK {det.pk}
            </Badge>
            <span className="text-[10px] text-slate-400">{new Date(det.detectedAt).toLocaleTimeString('pl-PL')}</span>
          </div>
          {det.assessment ? <DetectionPhoto det={det} deliveries={d.deliveries} compact /> : <DronePreview det={det} />}
          <div className="text-[11px] text-slate-600">
            {det.persons} os. {det.position.replace(/_/g, ' ')} • nurt {det.currentSpeedMs} m/s
            {det.assessment?.freeboardM != null && ` • do zalania ${Math.round(det.assessment.freeboardM * 100)} cm`}
            {det.assessment?.minutesToFlood != null && <b className="text-red-700"> • zalanie ~{det.assessment.minutesToFlood} min</b>}
            {det.assessment && det.assessment.sweepRiskPct >= 50 && <b className="text-red-700"> • ryzyko porwania {det.assessment.sweepRiskPct}%</b>}
            {det.medicalNeed && <b className="text-red-700"> • potrzebna pomoc medyczna</b>}
          </div>
          {det.collapseRisk && <div className="text-[11px] font-bold text-red-700">⚠ Ryzyko zawalenia budynku</div>}
          {allowed && (
            <div className="flex items-end gap-2">
              <div className="w-20">
                <label className={labelCls}>Osób</label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  value={persons[det.id] ?? String(det.persons)}
                  onChange={(e) => setPersons((p) => ({ ...p, [det.id]: e.target.value }))}
                />
              </div>
              <button
                className={btnSuccess}
                disabled={busy === det.id}
                onClick={() => act(det.id, 'post', `/detections/${det.id}/verify`, { decision: 'potwierdz', persons: Number(persons[det.id] ?? det.persons) })}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Potwierdź
              </button>
              <button className={btnSecondary} disabled={busy === det.id} onClick={() => act(det.id, 'post', `/detections/${det.id}/verify`, { decision: 'odrzuc' })}>
                <ThumbsDown className="h-3.5 w-3.5" /> Fałszywy alarm
              </button>
            </div>
          )}
        </div>
      ))}

      {allowed && confirmed.length > 0 && mission.status === 'aktywna' && (
        <details className="rounded-2xl border border-slate-200/80 p-3">
          <summary className="text-xs font-bold text-slate-600 cursor-pointer">Zleć dodatkową dostawę</summary>
          <div className="space-y-2 mt-2">
            {confirmed.map((det) => (
              <div key={det.id} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-bold text-slate-700 mr-auto">
                  {det.persons} os. • {det.lat.toFixed(4)}, {det.lng.toFixed(4)}
                </span>
                {(['kamizelki', 'apteczka', 'woda_jedzenie'] as const).map((p) => (
                  <button key={p} className={btnSecondary} disabled={busy === `${det.id}-${p}`} onClick={() => act(`${det.id}-${p}`, 'post', `/detections/${det.id}/deliveries`, { payloadType: p })}>
                    {PAYLOAD_LABELS[p]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      {low.length > 0 && <p className="text-[11px] text-slate-400">+ {low.length} zgłoszeń o niskim zagrożeniu – bez weryfikacji, widoczne dla ratowników.</p>}
    </div>
  );
};

const TechnicianPanel: React.FC<MissionViewProps> = ({ mission, act, busy }) => {
  const d = mission.data;
  const allowed = canAct(mission, 'technik');
  const waiting = d.drones.filter((x) => x.phase === 'wymiana_baterii' || (x.phase === 'uziemiony' && !x.groundedByWeather));
  const atBase = d.drones.filter((x) => ['gotowy', 'czuwanie', 'baza'].includes(x.phase));
  return (
    <div className="space-y-4">
      {!allowed && <NoRole role="Technik Lądowiska" />}
      <div className="text-xs font-extrabold text-slate-800">Oczekują na wymianę akumulatora ({waiting.length})</div>
      {waiting.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">Brak dronów na lądowisku.</div>}
      {waiting.map((x) => (
        <div key={x.droneId} className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-3">
          <BatteryCharging className="h-6 w-6 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900">{x.name}</div>
            <BatteryBar value={x.battery} compact />
          </div>
          {allowed && (
            <button className={btnSuccess} disabled={busy === `bat-${x.droneId}`} onClick={() => act(`bat-${x.droneId}`, 'post', `/drones/${x.droneId}/battery-swap`)}>
              Wymień akumulator
            </button>
          )}
        </div>
      ))}
      {atBase.length > 0 && <p className="text-[11px] text-slate-400">W bazie: {atBase.map((x) => `${x.name} ${Math.round(x.battery)}%`).join(', ')}</p>}
    </div>
  );
};

const LogisticsPanel: React.FC<MissionViewProps> = ({ mission, act, busy }) => {
  const d = mission.data;
  const allowed = canAct(mission, 'logistyk');
  const toLoad = d.deliveries.filter((x) => x.status === 'oczekuje_zaladunku');
  const others = d.deliveries.filter((x) => x.status !== 'oczekuje_zaladunku').slice().reverse();
  const fleet = d.drones.filter((x) => x.category === 'dostawczy');
  return (
    <div className="space-y-4">
      {!allowed && <NoRole role="Logistyk Zrzutu" />}
      <div className="text-xs font-extrabold text-slate-800">Do załadunku ({toLoad.length})</div>
      {toLoad.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">Brak autoryzowanych żądań.</div>}
      {toLoad.map((x) => (
        <div key={x.id} className="rounded-2xl bg-teal-50 border border-teal-200 p-3 flex items-center gap-3">
          <Package className="h-6 w-6 text-teal-600 shrink-0" />
          <div className="flex-1 text-xs">
            <div className="font-bold text-slate-900">
              {PAYLOAD_LABELS[x.payloadType]} × {x.quantity} ({x.weightKg} kg)
            </div>
            <div className="text-[10px] text-slate-500">Autoryzował: {x.authorizedBy}</div>
          </div>
          {allowed && (
            <button className={btnSuccess} disabled={busy === x.id} onClick={() => act(x.id, 'post', `/deliveries/${x.id}/load`)}>
              <PackageCheck className="h-3.5 w-3.5" /> Podczepiono
            </button>
          )}
        </div>
      ))}
      <p className="text-[11px] text-slate-400">Drony transportowe: {fleet.map((x) => `${x.name} – ${PHASE_LABELS[x.phase].toLowerCase()}`).join(', ') || 'brak'}</p>
      {others.length > 0 && <div className="text-xs font-extrabold text-slate-800 pt-1">Historia zrzutów</div>}
      <div className="space-y-1.5">
        {others.map((x) => (
          <div key={x.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 px-3 py-2 text-[11px]">
            <span className="font-semibold text-slate-700">
              {PAYLOAD_LABELS[x.payloadType]} × {x.quantity} {x.automatic && <span className="text-red-600">(auto – krytyczny)</span>}
            </span>
            <span className="text-slate-500">
              {DELIVERY_STATUS_LABELS[x.status]} {x.droneName ? `• ${x.droneName}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RescuePanel: React.FC<MissionViewProps & { onFocus: (id: string) => void }> = ({ mission, act, busy, onFocus }) => {
  const d = mission.data;
  const allowed = canAct(mission, 'ratownik');
  const pins = d.detections
    .filter((x) => x.status !== 'odrzucony')
    .sort((a, b) => {
      const pr = (x: Detection) => (x.rescueStatus === 'ewakuowano' ? 9 : x.criticality === 'krytyczny' ? 1 : x.criticality === 'umiarkowany' ? 2 : 3);
      return pr(a) - pr(b) || b.pk - a.pk;
    });
  return (
    <div className="space-y-3">
      {!allowed && <NoRole role="Mobilny Zespół Ratowniczy" />}
      {pins.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">Brak odnalezionych osób.</div>}
      {pins.map((det) => {
        const priority = det.criticality === 'krytyczny' ? 1 : det.criticality === 'umiarkowany' ? 2 : 3;
        const drops = d.deliveries.filter((x) => x.detectionId === det.id && x.status === 'zrzucono');
        return (
          <div key={det.id} className={`rounded-2xl border p-3 ${det.rescueStatus === 'ewakuowano' ? 'opacity-60 border-slate-200/80' : 'border-slate-200/80'}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white text-sm font-extrabold" style={{ background: CRITICALITY_STYLES[det.criticality].color }}>
                P{priority}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900">
                  {det.persons} os. • {CRITICALITY_STYLES[det.criticality].label} (PK {det.pk})
                </div>
                <button className="text-[11px] text-indigo-600 font-semibold flex items-center gap-1" onClick={() => onFocus(det.id)}>
                  <MapPin className="h-3 w-3" /> {det.lat.toFixed(5)}, {det.lng.toFixed(5)}
                </button>
              </div>
              <Badge
                className={
                  det.status === 'potwierdzony' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                }
              >
                {det.status === 'potwierdzony' ? 'Zwalidowana' : 'Wstępna'}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">
              {det.position.replace(/_/g, ' ')}
              {det.assessment?.freeboardM != null && ` • do zalania ${Math.round(det.assessment.freeboardM * 100)} cm`}
              {det.assessment?.minutesToFlood != null && ` • zalanie ~${det.assessment.minutesToFlood} min`}
              {det.medicalNeed && ' • POTRZEBNA POMOC MEDYCZNA'}
              {drops.length > 0 && ` • zrzucono: ${drops.map((x) => PAYLOAD_LABELS[x.payloadType].toLowerCase()).join(', ')}`}
            </div>
            {det.assessment && (
              <details className="mt-1.5">
                <summary className="text-[11px] text-indigo-600 font-semibold cursor-pointer">Zdjęcie z drona</summary>
                <div className="mt-1.5">
                  <DetectionPhoto det={det} deliveries={d.deliveries} />
                </div>
              </details>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                {det.rescueStatus === 'oczekuje' ? 'Oczekuje na zespół' : det.rescueStatus === 'w_drodze' ? `W drodze: ${det.rescueTeam}` : `Ewakuowano (${det.rescueTeam})`}
              </Badge>
              {allowed && det.rescueStatus === 'oczekuje' && (
                <button className={btnPrimary} disabled={busy === `r-${det.id}`} onClick={() => act(`r-${det.id}`, 'post', `/detections/${det.id}/rescue`, { status: 'w_drodze' })}>
                  Wyruszamy
                </button>
              )}
              {allowed && det.rescueStatus === 'w_drodze' && (
                <button className={btnSuccess} disabled={busy === `r-${det.id}`} onClick={() => act(`r-${det.id}`, 'post', `/detections/${det.id}/rescue`, { status: 'ewakuowano' })}>
                  Ewakuowano
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const LEVEL_CLS: Record<string, string> = {
  info: 'border-slate-200 text-slate-600',
  sukces: 'border-emerald-300 text-emerald-700',
  ostrzezenie: 'border-amber-300 text-amber-700',
  krytyczny: 'border-red-400 text-red-700',
};

const Timeline: React.FC<{ mission: Mission }> = ({ mission }) => (
  <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
    {mission.data.events
      .slice()
      .reverse()
      .map((e) => (
        <div key={e.id} className={`border-l-4 pl-3 py-1 ${LEVEL_CLS[e.level]}`}>
          <div className="text-[10px] font-bold text-slate-400">
            {formatSim(e.simSeconds)} • {new Date(e.at).toLocaleTimeString('pl-PL')} • {e.category}
          </div>
          <div className="text-xs">{e.message}</div>
        </div>
      ))}
  </div>
);

const DroneCameraPanel: React.FC<
  MissionViewProps & {
    cameraId: string | null;
    setCameraId: (id: string | null) => void;
    autoFollow: boolean;
    setAutoFollow: (v: boolean) => void;
    /** Okno nałożone na obraz (mapa / zadania) */
    overlay?: React.ReactNode;
    overlayInset?: string;
  }
> = ({ mission, act, busy, cameraId, setCameraId, autoFollow, setAutoFollow, overlay, overlayInset }) => {
  const d = mission.data;
  const drone = d.drones.find((x) => x.droneId === cameraId) ?? null;
  const [irOverride, setIrOverride] = useState<boolean | null>(null);
  useEffect(() => setIrOverride(null), [cameraId]);
  const irMode = irOverride ?? drone?.hasThermal ?? false;
  const canPause = canAct(mission, 'dowodca') && ['przygotowanie', 'aktywna', 'powrot'].includes(mission.status);
  const paused = !!d.paused;

  // Spacja – pauza / wznowienie (poza polami formularzy)
  useEffect(() => {
    if (!canPause) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.code !== 'Space' || e.repeat || (t && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName) || t.isContentEditable))) return;
      e.preventDefault();
      if (busy !== 'pause') act('pause', 'post', '/pause', { paused: !paused });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPause, paused, busy, act]);

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Video className="h-4 w-4 text-indigo-600 mr-1" />
        {d.drones.map((x) => {
          const atPerson = !!x.procedure || x.phase === 'monitorowanie';
          return (
            <button
              key={x.droneId}
              onClick={() => setCameraId(x.droneId)}
              title={x.activity ?? PHASE_LABELS[x.phase]}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                cameraId === x.droneId ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${x.linkLost ? 'bg-slate-400' : atPerson ? 'bg-yellow-400' : x.category === 'zwiadowczy' ? 'bg-indigo-500' : 'bg-teal-500'}`}
                style={atPerson ? { animation: 'cam-blink 1s infinite' } : undefined}
              />
              {x.name}
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500" title="Przełącz automatycznie na drona, który znalazł osobę">
            <input type="checkbox" className="accent-indigo-600" checked={autoFollow} onChange={(e) => setAutoFollow(e.target.checked)} />
            Pokazuj drona przy osobie
          </label>
          {drone?.hasThermal && (
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-bold" title="Obraz z kamery">
              {[
                { v: true, label: 'Termowizja' },
                { v: false, label: 'Zwykły' },
              ].map((o) => (
                <button key={o.label} onClick={() => setIrOverride(o.v)} className={`px-2.5 py-1.5 ${irMode === o.v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {canPause && (
            <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden text-[11px] font-bold bg-white" title="Tempo symulacji: ×1 – czas rzeczywisty">
              <span className="px-2 text-slate-400">Tempo</span>
              {[1, 5, 20].map((s) => (
                <button
                  key={s}
                  disabled={busy === 'speed'}
                  onClick={() => act('speed', 'post', '/speed', { timeScale: s })}
                  className={`px-2.5 py-1.5 ${mission.timeScale === s ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  ×{s}
                </button>
              ))}
            </div>
          )}
          {canPause && (
            <button
              className={
                paused
                  ? btnSuccess
                  : 'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition active:scale-95'
              }
              disabled={busy === 'pause'}
              title="Spacja"
              onClick={() => act('pause', 'post', '/pause', { paused: !paused })}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? 'Wznów' : 'Pauza'}
            </button>
          )}
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        {drone ? (
          <DroneCameraFeed data={d} drone={drone} irOverride={irOverride} fill insetRight={overlayInset} />
        ) : (
          <div className="h-full rounded-2xl bg-slate-900 flex items-center justify-center text-xs text-slate-400">Wybierz drona, aby zobaczyć obraz z jego kamery.</div>
        )}
        {overlay}
      </div>
    </div>
  );
};

type PipView = 'mapa' | 'zadania';
type PipSize = 'maly' | 'duzy' | 'ukryty';

export const MissionControl: React.FC<MissionViewProps> = (props) => {
  const { mission, act } = props;
  const d = mission.data;
  const firstRole = (mission.permissions.roles[0] as Tab | undefined) ?? 'dowodca';
  const [tab, setTab] = useState<Tab>(firstRole);
  const [priorityMode, setPriorityMode] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [cameraId, setCameraId] = useState<string | null>(() => d.drones.find((x) => x.category === 'zwiadowczy')?.droneId ?? d.drones[0]?.droneId ?? null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [pipView, setPipView] = useState<PipView>('mapa');
  const [pipSize, setPipSize] = useState<PipSize>('maly');

  const showPip = (view: PipView) => {
    setPipView(view);
    setPipSize((s) => (s === 'ukryty' ? 'maly' : s));
  };

  // Wskazanie priorytetu wymaga mapy – okno przełącza się na nią samo
  useEffect(() => {
    if (priorityMode) showPip('mapa');
  }, [priorityMode]);

  // Gdy dron znajdzie osobę, podgląd przełącza się na niego (o ile bieżący dron nie prowadzi własnej procedury)
  useEffect(() => {
    if (!autoFollow) return;
    const current = d.drones.find((x) => x.droneId === cameraId);
    if (current?.procedure) return;
    const atPerson = d.drones.find((x) => x.procedure);
    if (atPerson && atPerson.droneId !== cameraId) setCameraId(atPerson.droneId);
  }, [d.drones, autoFollow, cameraId]);

  const kpi = useMemo(() => {
    const found = d.detections.filter((x) => x.status !== 'odrzucony');
    return {
      airborne: d.drones.filter((x) => ['przelot', 'skanowanie', 'weryfikacja_celu', 'analiza', 'wywiad', 'monitorowanie', 'dostawa', 'sprawdzanie_sygnalu', 'powrot'].includes(x.phase)).length,
      persons: found.reduce((s, x) => s + x.persons, 0),
      critical: found.filter((x) => x.criticality === 'krytyczny' && x.rescueStatus !== 'ewakuowano').length,
      toVerify: d.detections.filter((x) => x.status === 'wstepny' && x.criticality !== 'niski').length + d.deliveries.filter((x) => x.status === 'oczekuje_autoryzacji').length,
      lost: d.drones.filter((x) => x.linkLost).length,
    };
  }, [d]);

  const badges: Partial<Record<Tab, number>> = {
    weryfikator: kpi.toVerify,
    technik: d.drones.filter((x) => x.phase === 'wymiana_baterii').length,
    logistyk: d.deliveries.filter((x) => x.status === 'oczekuje_zaladunku').length,
    ratownik: d.detections.filter((x) => x.status === 'potwierdzony' && x.rescueStatus === 'oczekuje').length,
    dowodca: d.recommendations.filter((r) => r.status === 'oczekuje').length,
  };
  const badgeTotal = Object.values(badges).reduce((s, v) => s + (v ?? 0), 0);

  const mode: MapDrawMode = priorityMode ? 'priority' : null;
  const inFlight = mission.status !== 'zakonczona';

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <label className="flex items-center gap-1.5 font-semibold">
        <input type="checkbox" className="accent-indigo-600" checked={showWaypoints} onChange={(e) => setShowWaypoints(e.target.checked)} /> Trasy
      </label>
      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-indigo-600" /> zwiadowczy</span>
      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> transportowy</span>
      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> osoby</span>
      {priorityMode && <span className="font-bold text-indigo-600">Kliknij punkt w strefie</span>}
    </div>
  );

  const missionMap = (height: string) => (
    <MissionMap
      base={d.base}
      radioRangeKm={d.radioRangeKm}
      area={d.area}
      noFlyZones={d.noFlyZones}
      sectors={d.sectors}
      showWaypoints={showWaypoints}
      drones={d.drones}
      detections={d.detections}
      deliveries={d.deliveries}
      signals={d.signals ?? []}
      priorityZones={d.priorityZones ?? []}
      highlightDetectionId={focusId}
      onDetectionClick={setFocusId}
      onDroneClick={setCameraId}
      selectedDroneId={cameraId}
      drawMode={mode}
      onMapClick={async (lat, lng) => {
        setPriorityMode(false);
        await act('priority', 'post', '/priority', { lat, lng });
      }}
      height={height}
      fitKey={mission.id}
    />
  );

  const stationsBody = (
    <>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.icon} {t.label}
            {!!badges[t.key as Tab] && (
              <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center">
                {badges[t.key as Tab]}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === 'dowodca' && <CommanderPanel {...props} priorityMode={priorityMode} setPriorityMode={setPriorityMode} cameraId={cameraId} onCamera={setCameraId} />}
      {tab === 'weryfikator' && <VerifierPanel {...props} />}
      {tab === 'technik' && <TechnicianPanel {...props} />}
      {tab === 'logistyk' && <LogisticsPanel {...props} />}
      {tab === 'ratownik' && <RescuePanel {...props} onFocus={setFocusId} />}
      {tab === 'timeline' && <Timeline mission={mission} />}
    </>
  );

  // Okno w prawym dolnym rogu obrazu: mapa albo zadania zespołu
  const pipSwitch = (
    <div className="flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-bold bg-white">
      {(
        [
          { v: 'mapa', label: 'Mapa', icon: <MapIcon className="h-3.5 w-3.5" /> },
          { v: 'zadania', label: 'Zadania', icon: <Users className="h-3.5 w-3.5" /> },
        ] as const
      ).map((o) => (
        <button
          key={o.v}
          onClick={() => showPip(o.v)}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 ${pipView === o.v && pipSize !== 'ukryty' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          {o.icon} {o.label}
          {o.v === 'zadania' && badgeTotal > 0 && (
            <span className="h-4 min-w-[16px] px-1 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center">{badgeTotal}</span>
          )}
        </button>
      ))}
    </div>
  );

  const pip =
    pipSize === 'ukryty' ? (
      <div className="absolute bottom-3 right-3 z-[500] shadow-xl rounded-xl">{pipSwitch}</div>
    ) : (
      <div
        className={`absolute bottom-3 right-3 z-[500] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 shadow-2xl overflow-hidden transition-all duration-300 ${
          pipSize === 'duzy' ? 'w-[55%] h-[70%]' : 'w-[36%] h-[42%]'
        } min-w-[340px] min-h-[260px]`}
      >
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-100">
          {pipSwitch}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title={pipSize === 'duzy' ? 'Zmniejsz okno' : 'Powiększ okno'}
              onClick={() => setPipSize(pipSize === 'duzy' ? 'maly' : 'duzy')}
            >
              {pipSize === 'duzy' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Schowaj okno" onClick={() => setPipSize('ukryty')}>
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Mapa pozostaje zamontowana, żeby przy przełączaniu nie traciła widoku */}
        <div className={`flex-1 min-h-0 flex flex-col gap-1 p-1.5 ${pipView === 'mapa' ? '' : 'hidden'}`}>
          <div className="px-1">{legend}</div>
          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0">{missionMap('100%')}</div>
          </div>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto p-3 ${pipView === 'zadania' ? '' : 'hidden'}`}>{stationsBody}</div>
      </div>
    );
  const overlayInset = pipSize === 'ukryty' ? '230px' : pipSize === 'duzy' ? 'calc(55% + 24px)' : 'calc(36% + 24px)';

  return (
    <div className="space-y-3">
      {mission.status === 'zakonczona' && (
        <div className="rounded-3xl bg-indigo-600 text-white p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-extrabold text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Operacja zakończona – flota w trybie czuwania
            </div>
            <p className="text-sm text-indigo-100">System automatycznie wygenerował raport dla służb ratunkowych (WOPR, Straż Pożarna).</p>
          </div>
          <Link to={`/dashboard/missions/${mission.id}/report`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-indigo-700 text-xs font-bold">
            <FileText className="h-4 w-4" /> Otwórz raport PDF / Excel
          </Link>
        </div>
      )}
      {mission.status === 'powrot' && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs font-semibold text-amber-800 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Rozkaz powrotu – drony obierają najkrótszą bezpieczną trasę do Strefy Zero.
        </div>
      )}

      {/* Najważniejsze liczby; ostrzeżenia pojawiają się tylko, gdy wymagają uwagi */}
      <div className="flex flex-wrap items-stretch gap-2">
        {[
          { label: 'Czas operacji', value: formatSim(d.simSeconds), icon: <History className="h-4 w-4" />, cls: 'text-indigo-600 bg-indigo-50' },
          { label: 'Drony w powietrzu', value: `${kpi.airborne}/${d.drones.length}`, icon: <Radio className="h-4 w-4" />, cls: 'text-sky-600 bg-sky-50' },
          { label: 'Odnalezione osoby', value: kpi.persons, icon: <Users className="h-4 w-4" />, cls: 'text-emerald-600 bg-emerald-50' },
          { label: 'W zagrożeniu', value: kpi.critical, icon: <AlertOctagon className="h-4 w-4" />, cls: 'text-red-600 bg-red-50' },
        ].map((k) => (
          <div key={k.label} className="flex-1 min-w-[150px] rounded-2xl bg-white border border-slate-200/80 shadow-xs px-3 py-1.5 flex items-center gap-3">
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${k.cls}`}>{k.icon}</div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k.label}</div>
              <div className="text-base font-extrabold text-slate-900 tabular-nums leading-tight">{k.value}</div>
            </div>
          </div>
        ))}
        {kpi.toVerify > 0 && (
          <button
            onClick={() => {
              setTab('weryfikator');
              showPip('zadania');
            }}
            className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-800 flex items-center gap-2"
          >
            <ShieldCheck className="h-4 w-4" /> Do weryfikacji: {kpi.toVerify}
          </button>
        )}
        {kpi.lost > 0 && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 flex items-center gap-2">
            <WifiOff className="h-4 w-4" /> Brak łączności: {kpi.lost}
          </div>
        )}
      </div>

      {inFlight ? (
        // Obraz z drona na prawie cały ekran, mapa / zadania w oknie w prawym dolnym rogu
        <div className="h-[calc(100vh-150px)] min-h-[480px]">
          <DroneCameraPanel
            {...props}
            cameraId={cameraId}
            setCameraId={setCameraId}
            autoFollow={autoFollow}
            setAutoFollow={setAutoFollow}
            overlay={pip}
            overlayInset={overlayInset}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          <div className="xl:col-span-3 space-y-2">
            {legend}
            {missionMap('640px')}
          </div>
          <div className="xl:col-span-2">
            <SectionCard title="Zadania zespołu" icon={<Users className="h-5 w-5" />}>
              {stationsBody}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionControl;
