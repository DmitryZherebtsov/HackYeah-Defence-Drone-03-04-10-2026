import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Loader2, Printer } from 'lucide-react';
import api from '../services/api';
import { apiError, CRITICALITY_STYLES, Criticality, Mission, MISSION_STATUS_LABELS, MissionStatus, ROLE_LABELS, MissionRole } from '../types/drones';
import { MissionMap } from '../components/drones/MissionMap';
import { Badge, Toast, WeatherStrip, btnPrimary, btnSecondary, useToast } from '../components/drones/DroneUi';

interface Effectiveness {
  searchMode: 'jednoprzebiegowy' | 'dwuprzebiegowy';
  hiddenSites: number;
  hiddenPersons: number;
  foundSites: number;
  foundPersons: number;
  firstFindMinutes: number | null;
  medianFindMinutes: number | null;
  halfFoundMinutes: number | null;
  lastFindMinutes: number | null;
  firstSignalMinutes: number | null;
  signals: number;
  signalsConfirmed: number;
  signalsFalse: number;
  decoys: number;
  plannedExpectedFindMinutes: number | null;
  plannedBaselineMinutes: number | null;
  foundTimeline: number[];
}

interface Report {
  effectiveness: Effectiveness | null;
  mission: {
    id: string;
    name: string;
    description?: string | null;
    status: MissionStatus;
    createdBy: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    generatedAt: string;
    simulatedMinutes: number;
  };
  weather: Mission['data']['weather'];
  planStats: Mission['data']['planStats'] | null;
  assignments: Mission['data']['assignments'];
  summary: {
    areaKm2: number;
    avgCoveragePct: number;
    drones: number;
    sorties: number;
    distanceKm: number;
    detections: number;
    personsFound: number;
    critical: number;
    evacuated: number;
    falseAlarmsOnboard: number;
    falseAlarmsVerifier: number;
  };
  logistics: {
    vests: number;
    medkits: number;
    foodWater: number;
    drops: number;
    pending: number;
    deliveries: { id: string; payload: string; quantity: number; weightKg: number; statusLabel: string; automatic: boolean; droneName: string | null; droppedAt: string | null }[];
  };
  sectors: { id: string; index: number; droneName: string; color: string; areaKm2: number; altitudeAgl: number; pathLengthKm: number; coveragePct: number; reassigned: boolean }[];
  flights: { droneId: string; name: string; model: string; category: string; sorties: number; distanceKm: number; flightMinutes: number; battery: number }[];
  persons: {
    no: number;
    id: string;
    lat: number;
    lng: number;
    persons: number;
    criticality: Criticality;
    pk: number;
    priority: number;
    status: string;
    rescueStatus: string;
    rescueTeam: string | null;
    source: string;
    droneName: string;
    detectedAt: string;
    waterDepthM: number;
    offline: boolean;
  }[];
  timeline: { at: string; simMinutes: number; level: string; category: string; message: string }[];
}

const RESCUE: Record<string, string> = { oczekuje: 'Oczekuje', w_drodze: 'Zespół w drodze', ewakuowano: 'Ewakuowano' };
const VERIF: Record<string, string> = { wstepny: 'Alert wstępny', potwierdzony: 'Zwalidowany' };
const th = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400';
const td = 'px-3 py-2 text-xs text-slate-700 border-t border-slate-100';

export const MissionReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast, show } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/missions/${id}/report`), api.get(`/missions/${id}`)])
      .then(([r, m]) => {
        setReport(r.data.report);
        setMission(m.data.mission);
      })
      .catch((err) => show('error', apiError(err, 'Nie udało się wygenerować raportu')));
  }, [id, show]);

  const downloadXlsx = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/missions/${id}/report.xlsx`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raport_${(report?.mission.name ?? 'operacja').replace(/[^\p{L}\p{N}_-]+/gu, '_')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      show('error', apiError(err, 'Nie udało się pobrać pliku Excel'));
    } finally {
      setDownloading(false);
    }
  };

  if (!report || !mission) {
    return (
      <div className="flex justify-center py-24">
        <Toast toast={toast} />
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const s = report.summary;
  const l = report.logistics;

  return (
    <div className="space-y-6">
      <Toast toast={toast} />
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to={`/dashboard/missions/${id}`} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Wróć do operacji
        </Link>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={downloadXlsx} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Pobierz Excel
          </button>
          <button className={btnPrimary} onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Drukuj / zapisz PDF
          </button>
        </div>
      </div>

      <header className="rounded-3xl bg-white border border-slate-200/80 p-6">
        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Raport z działań ratowniczych • Krok 8.1</div>
        <h1 className="text-2xl font-extrabold text-slate-900 mt-1">{report.mission.name}</h1>
        {report.mission.description && <p className="text-sm text-slate-500 mt-1">{report.mission.description}</p>}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
          <Badge className={MISSION_STATUS_LABELS[report.mission.status].cls}>{MISSION_STATUS_LABELS[report.mission.status].label}</Badge>
          <span>Dowódca: {report.assignments.dowodca.map((p) => p.name).join(', ') || report.mission.createdBy}</span>
          <span>Start: {report.mission.startedAt ? new Date(report.mission.startedAt).toLocaleString('pl-PL') : '—'}</span>
          <span>Koniec: {report.mission.endedAt ? new Date(report.mission.endedAt).toLocaleString('pl-PL') : 'w toku'}</span>
          <span>Czas operacji: {report.mission.simulatedMinutes} min</span>
          <span>Wygenerowano: {new Date(report.mission.generatedAt).toLocaleString('pl-PL')}</span>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 break-inside-avoid">
        {[
          ['Przeszukany teren', `${s.areaKm2} km² (${s.avgCoveragePct}%)`],
          ['Odnalezione osoby', `${s.personsFound} (${s.critical} krytycz.)`],
          ['Ewakuowano', s.evacuated],
          ['Loty', `${s.drones} dronów • ${s.sorties} wylotów • ${s.distanceKm} km`],
          ['Kamizelki ratunkowe', l.vests],
          ['Pakiety medyczne', l.medkits],
          ['Woda i żywność', l.foodWater],
          ['Fałszywe alarmy', `${s.falseAlarmsOnboard} pokł. / ${s.falseAlarmsVerifier} weryf.`],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl bg-white border border-slate-200/80 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</div>
            <div className="text-sm font-extrabold text-slate-900 mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      {report.effectiveness && (
        <section className="rounded-3xl bg-white border border-slate-200/80 p-5 break-inside-avoid">
          <h2 className="text-sm font-extrabold text-slate-900">Skuteczność poszukiwań</h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Symulacja: osoby i fałszywe źródła ciepła rozmieszczono zgodnie z mapą prawdopodobieństwa, system ich nie znał. Tryb:{' '}
            {report.effectiveness.searchMode === 'dwuprzebiegowy' ? 'rozpoznanie + przeszukanie dokładne' : 'jeden przelot dokładny'}.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Odnalezione miejsca', `${report.effectiveness.foundSites} z ${report.effectiveness.hiddenSites}`],
              ['Odnalezione osoby', `${report.effectiveness.foundPersons} z ${report.effectiveness.hiddenPersons}`],
              ['Pierwszy sygnał', report.effectiveness.firstSignalMinutes !== null ? `po ${report.effectiveness.firstSignalMinutes} min` : '—'],
              ['Pierwsze odnalezienie', report.effectiveness.firstFindMinutes !== null ? `po ${report.effectiveness.firstFindMinutes} min` : '—'],
              ['Połowa osób odnaleziona', report.effectiveness.halfFoundMinutes !== null ? `po ${report.effectiveness.halfFoundMinutes} min` : 'nie osiągnięto'],
              ['Ostatnie odnalezienie', report.effectiveness.lastFindMinutes !== null ? `po ${report.effectiveness.lastFindMinutes} min` : '—'],
              ['Sygnały (potw. / fałszywe)', `${report.effectiveness.signals} (${report.effectiveness.signalsConfirmed} / ${report.effectiveness.signalsFalse})`],
              [
                'Plan: dotarcie nad osobę',
                report.effectiveness.plannedExpectedFindMinutes !== null
                  ? `${report.effectiveness.plannedExpectedFindMinutes} min (żmija: ${report.effectiveness.plannedBaselineMinutes ?? '—'} min)`
                  : '—',
              ],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</div>
                <div className="text-sm font-extrabold text-slate-900 mt-0.5">{v}</div>
              </div>
            ))}
          </div>
          {report.effectiveness.foundTimeline.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Odnalezienia w czasie (min od startu)</div>
              <div className="relative h-8 rounded-xl bg-slate-50 border border-slate-200/80">
                {report.effectiveness.foundTimeline.map((t, i) => {
                  const max = Math.max(report.mission.simulatedMinutes, ...report.effectiveness!.foundTimeline, 1);
                  return (
                    <span
                      key={i}
                      title={`${t} min`}
                      className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white"
                      style={{ left: `calc(${(t / max) * 100}% - 6px)` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>start</span>
                <span>{Math.max(report.mission.simulatedMinutes, ...report.effectiveness.foundTimeline)} min</span>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-3xl bg-white border border-slate-200/80 p-5 break-inside-avoid">
        <h2 className="text-sm font-extrabold text-slate-900 mb-3">Cyfrowa mapa przeszukanego terenu z trasami lotów</h2>
        <MissionMap
          base={mission.data.base}
          radioRangeKm={mission.data.radioRangeKm}
          area={mission.data.area}
          noFlyZones={mission.data.noFlyZones}
          sectors={mission.data.sectors}
          showWaypoints={false}
          drones={mission.data.drones}
          detections={mission.data.detections.filter((x) => x.status !== 'odrzucony')}
          height="460px"
          fitKey={`report-${mission.id}`}
        />
        <div className="mt-3">
          <WeatherStrip weather={report.weather} />
        </div>
      </section>

      <section className="rounded-3xl bg-white border border-slate-200/80 p-5">
        <h2 className="text-sm font-extrabold text-slate-900 mb-3">Zwalidowane współrzędne GPS odnalezionych osób</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Priorytet', 'Osób', 'Zagrożenie', 'Współrzędne GPS', 'Woda', 'Weryfikacja', 'Ewakuacja', 'Źródło'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.persons.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <b>P{p.priority}</b>
                  </td>
                  <td className={td}>{p.persons}</td>
                  <td className={td}>
                    <Badge className={CRITICALITY_STYLES[p.criticality].cls}>
                      {CRITICALITY_STYLES[p.criticality].label} {p.pk}
                    </Badge>
                  </td>
                  <td className={`${td} font-mono`}>
                    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </td>
                  <td className={td}>{p.waterDepthM} m</td>
                  <td className={td}>{VERIF[p.status] ?? p.status}</td>
                  <td className={td}>
                    {RESCUE[p.rescueStatus]} {p.rescueTeam ? `(${p.rescueTeam})` : ''}
                  </td>
                  <td className={td}>
                    {p.source === 'termowizja' ? 'FLIR' : 'RGB/AI'} • {p.droneName}
                    {p.offline ? ' (offline)' : ''}
                  </td>
                </tr>
              ))}
              {report.persons.length === 0 && (
                <tr>
                  <td className={td} colSpan={8}>
                    Nie odnaleziono osób.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-3xl bg-white border border-slate-200/80 p-5 break-inside-avoid">
          <h2 className="text-sm font-extrabold text-slate-900 mb-3">Statystyki zasobów logistycznych</h2>
          <table className="w-full">
            <thead>
              <tr>
                {['Ładunek', 'Ilość', 'Status', 'Dron'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {l.deliveries.map((x) => (
                <tr key={x.id}>
                  <td className={td}>
                    {x.payload}
                    {x.automatic && <span className="text-red-600"> • auto</span>}
                  </td>
                  <td className={td}>
                    {x.quantity} ({x.weightKg} kg)
                  </td>
                  <td className={td}>{x.statusLabel}</td>
                  <td className={td}>{x.droneName ?? '—'}</td>
                </tr>
              ))}
              {l.deliveries.length === 0 && (
                <tr>
                  <td className={td} colSpan={4}>
                    Brak dostaw.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-3xl bg-white border border-slate-200/80 p-5 break-inside-avoid">
          <h2 className="text-sm font-extrabold text-slate-900 mb-3">Sektory i loty dronów</h2>
          <table className="w-full">
            <thead>
              <tr>
                {['Sektor', 'Dron', 'Pow.', 'Pokrycie', 'Trasa'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.sectors.map((x) => (
                <tr key={x.id}>
                  <td className={td}>
                    <span className="inline-block h-2.5 w-2.5 rounded-full mr-1.5" style={{ background: x.color }} />
                    {x.index + 1}
                  </td>
                  <td className={td}>{x.droneName}</td>
                  <td className={td}>{x.areaKm2} km²</td>
                  <td className={td}>
                    {x.coveragePct}% {x.reassigned && '(przejęty)'}
                  </td>
                  <td className={td}>{x.pathLengthKm} km</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full mt-4">
            <thead>
              <tr>
                {['Dron', 'Wyloty', 'Dystans', 'Czas lotu'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.flights.map((f) => (
                <tr key={f.droneId}>
                  <td className={td}>
                    {f.name} <span className="text-slate-400">({f.category})</span>
                  </td>
                  <td className={td}>{f.sorties}</td>
                  <td className={td}>{f.distanceKm} km</td>
                  <td className={td}>{f.flightMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="rounded-3xl bg-white border border-slate-200/80 p-5">
        <h2 className="text-sm font-extrabold text-slate-900 mb-3">Zespół operacji</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {(Object.keys(ROLE_LABELS) as MissionRole[]).map((r) => (
            <div key={r} className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{ROLE_LABELS[r].label}</div>
              <div className="text-xs font-semibold text-slate-800 mt-1">{report.assignments[r].map((p) => p.name).join(', ') || '—'}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-white border border-slate-200/80 p-5">
        <h2 className="text-sm font-extrabold text-slate-900 mb-3">Oś czasu kluczowych alertów i zdarzeń</h2>
        <div className="space-y-1">
          {report.timeline.map((e, i) => (
            <div key={i} className="flex gap-3 text-xs border-t border-slate-100 pt-1">
              <span className="w-14 shrink-0 font-bold text-slate-400 tabular-nums">T+{e.simMinutes}m</span>
              <span
                className={`w-20 shrink-0 font-bold ${
                  e.level === 'krytyczny' ? 'text-red-600' : e.level === 'ostrzezenie' ? 'text-amber-600' : e.level === 'sukces' ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {e.level}
              </span>
              <span className="text-slate-700">{e.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default MissionReportPage;
