import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CloudSun,
  Flame as FlameIcon,
  Layers3,
  Sparkles,
  Trash2,
  Crosshair,
  Eraser,
  Flame,
  Layers,
  Loader2,
  MapPin,
  Package,
  PenLine,
  Route,
  Save,
  ShieldAlert,
  Undo2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import api from '../../services/api';
import type { MissionViewProps } from '../../pages/MissionPage';
import { LatLng, MissionRole, PriorityZone, ROLE_LABELS, SEARCH_MODE_LABELS, SearchMode } from '../../types/drones';
import { MissionMap, MapDrawMode } from './MissionMap';
import { Badge, SectionCard, WeatherStrip, btnPrimary, btnSecondary, inputCls, labelCls } from './DroneUi';

type Tab = 'flota' | 'strefa' | 'zespol';

interface AssignableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  organization?: { name: string } | null;
}

const CoefficientBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-16 rounded-full bg-slate-200 overflow-hidden">
      <div className={`h-full ${value >= 0.7 ? 'bg-emerald-500' : value >= 0.35 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${value * 100}%` }} />
    </div>
    <span className="text-xs font-bold tabular-nums text-slate-700">{value.toFixed(2)}</span>
  </div>
);

const FleetTab: React.FC<MissionViewProps> = ({ mission, act, busy }) => {
  const d = mission.data;
  const canEdit = mission.permissions.isCommander;
  const [selected, setSelected] = useState<string[]>(d.selectedDroneIds);
  useEffect(() => setSelected(d.selectedDroneIds), [d.selectedDroneIds]);
  const dirty = selected.slice().sort().join() !== d.selectedDroneIds.slice().sort().join();

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-5">
      <SectionCard
        title="Komunikat meteorologiczny z obszaru zagrożenia"
        subtitle="Siła wiatru w porywach, intensywność opadów i temperatura – przed wyjazdem floty z bazy"
        icon={<CloudSun className="h-5 w-5" />}
        actions={
          canEdit && (
            <button className={btnPrimary} disabled={busy === 'analyze'} onClick={() => act('analyze', 'post', '/analyze')}>
              {busy === 'analyze' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudSun className="h-4 w-4" />}
              {d.weather ? 'Odśwież pogodę i przelicz' : 'Pobierz pogodę i przeanalizuj flotę'}
            </button>
          )
        }
      >
        <WeatherStrip weather={d.weatherOverride ?? d.weather} />
        {d.fleetSummary && (
          <ul className="mt-4 space-y-1.5">
            {d.fleetSummary.rationale.map((r) => (
              <li key={r} className="flex items-start gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" /> {r}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {d.fleetAnalysis.length > 0 && (
        <SectionCard
          title="Kompletowanie floty – Wzór A i Wzór B"
          subtitle="B – współczynnik powodzenia lotu w pogodzie; A – pokrycie terenu na jedno wyjście. Zablokowane maszyny nie mogą zostać wybrane."
          icon={<Layers className="h-5 w-5" />}
          actions={
            canEdit &&
            dirty && (
              <button className={btnPrimary} disabled={busy === 'fleet'} onClick={() => act('fleet', 'put', '/fleet', { selectedDroneIds: selected })}>
                <Save className="h-4 w-4" /> Zapisz skład floty
              </button>
            )
          }
        >
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-2"></th>
                  <th className="py-2 pr-3">Dron</th>
                  <th className="py-2 pr-3">Wzór B</th>
                  <th className="py-2 pr-3">Czas lotu</th>
                  <th className="py-2 pr-3">Rezerwa RTH</th>
                  <th className="py-2 pr-3">Przelot</th>
                  <th className="py-2 pr-3">Wzór A / udźwig</th>
                  <th className="py-2 pr-3">K = A·B</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.fleetAnalysis.map((a) => {
                  const blocked = !a.weather.canFly || !a.available;
                  return (
                    <tr key={a.droneId} className={`border-b border-slate-50 ${blocked ? 'opacity-60' : ''}`}>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-indigo-600"
                          disabled={!canEdit || blocked}
                          checked={selected.includes(a.droneId)}
                          onChange={() => toggle(a.droneId)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.category === 'zwiadowczy' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
                            {a.category === 'zwiadowczy' ? <Crosshair className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1">
                              {a.name} {a.hasThermal && <Flame className="h-3 w-3 text-orange-500" />}
                            </div>
                            <div className="text-[10px] text-slate-400">{a.model}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <CoefficientBar value={a.weather.coefficient} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {a.capability.effectiveMinutes} min <span className="text-slate-400">({a.capability.baseMinutes})</span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{a.capability.reserveMinutes} min</td>
                      <td className="py-2 pr-3 tabular-nums">{a.capability.transitMinutes} min</td>
                      <td className="py-2 pr-3 tabular-nums font-bold text-slate-800">
                        {a.category === 'zwiadowczy' ? `${a.capability.areaKm2} km²` : `${a.capability.effectivePayloadKg} kg`}
                        {a.category === 'zwiadowczy' && <div className="text-[10px] font-normal text-slate-400">pas {a.capability.swathM} m</div>}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{a.flightCoefficient}</td>
                      <td className="py-2 max-w-[260px]">
                        {!a.available ? (
                          <Badge className="bg-slate-100 text-slate-600 border-slate-200">{a.unavailableReason ?? 'Niedostępny'}</Badge>
                        ) : a.weather.canFly ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Zdolny do lotu</Badge>
                        ) : (
                          <div className="space-y-0.5">
                            <Badge className="bg-red-50 text-red-700 border-red-200">
                              <Ban className="h-3 w-3" /> Zablokowany
                            </Badge>
                            {a.weather.reasons.map((r) => (
                              <div key={r} className="text-[10px] text-red-600">
                                {r}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Wybrano: {selected.length} dronów • zwiadowcze: {d.fleetAnalysis.filter((a) => selected.includes(a.droneId) && a.category === 'zwiadowczy').length} • dostawcze:{' '}
            {d.fleetAnalysis.filter((a) => selected.includes(a.droneId) && a.category === 'dostawczy').length}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

const AreaTab: React.FC<MissionViewProps> = ({ mission, act, busy }) => {
  const d = mission.data;
  const canEdit = mission.permissions.isCommander;
  const [mode, setMode] = useState<MapDrawMode>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [radio, setRadio] = useState(d.radioRangeKm);
  useEffect(() => setRadio(d.radioRangeKm), [d.radioRangeKm]);
  const [zoneLevel, setZoneLevel] = useState<PriorityZone['level']>('wysoki');
  const [showHeat, setShowHeat] = useState(true);
  const zones = d.priorityZones ?? [];
  const savePriority = (key: string, body: { zones?: PriorityZone[]; searchMode?: SearchMode; clearFeatures?: boolean }) => act(key, 'put', '/priority', body);

  const onMapClick = async (lat: number, lng: number) => {
    if (mode === 'base') {
      setMode(null);
      await act('base', 'put', '/base', { lat, lng });
      return;
    }
    setDraft((p) => [...p, [Number(lat.toFixed(6)), Number(lng.toFixed(6))]]);
  };

  const finish = async () => {
    if (draft.length < 3) return;
    let ok: boolean;
    if (mode === 'hotspot') {
      const zone: PriorityZone = { id: `pz-${Date.now()}`, polygon: draft, level: zoneLevel };
      ok = await savePriority('area', { zones: [...zones, zone] });
    } else {
      const body = mode === 'nfz' ? { area: d.area, noFlyZones: [...d.noFlyZones, draft] } : { area: draft, noFlyZones: d.noFlyZones };
      ok = await act('area', 'put', '/area', body);
    }
    if (ok) {
      setDraft([]);
      setMode(null);
    }
  };

  const start = (m: MapDrawMode) => {
    setDraft([]);
    setMode(m);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-3">
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button className={mode === 'area' ? btnPrimary : btnSecondary} onClick={() => start('area')}>
                <PenLine className="h-4 w-4" /> {d.area.length ? 'Narysuj strefę od nowa' : 'Rysuj strefę poszukiwań'}
              </button>
              <button className={mode === 'nfz' ? btnPrimary : btnSecondary} onClick={() => start('nfz')}>
                <ShieldAlert className="h-4 w-4" /> Dodaj strefę No-Fly
              </button>
              <button className={mode === 'base' ? btnPrimary : btnSecondary} onClick={() => start('base')}>
                <MapPin className="h-4 w-4" /> Przesuń Strefę Zero
              </button>
              <button className={mode === 'hotspot' ? btnPrimary : btnSecondary} disabled={d.area.length < 3} onClick={() => start('hotspot')}>
                <FlameIcon className="h-4 w-4" /> Zaznacz strefę priorytetową
              </button>
              {d.noFlyZones.length > 0 && !mode && (
                <button className={btnSecondary} onClick={() => act('area', 'put', '/area', { area: d.area, noFlyZones: [] })}>
                  <Eraser className="h-4 w-4" /> Usuń strefy No-Fly
                </button>
              )}
            </div>
          )}
          {mode && mode !== 'base' && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-800">
              <span className="font-semibold mr-auto">
                Klikaj na mapie, aby dodać wierzchołki {mode === 'nfz' ? 'strefy zakazu lotów' : mode === 'hotspot' ? 'strefy priorytetowej' : 'strefy poszukiwań'} ({draft.length} pkt).
              </span>
              {mode === 'hotspot' && (
                <select className={`${inputCls} w-auto py-1.5`} value={zoneLevel} onChange={(e) => setZoneLevel(e.target.value as PriorityZone['level'])}>
                  <option value="wysoki">Wysoki priorytet</option>
                  <option value="sredni">Średni priorytet</option>
                </select>
              )}
              <button className={btnSecondary} disabled={draft.length === 0} onClick={() => setDraft((p) => p.slice(0, -1))}>
                <Undo2 className="h-3.5 w-3.5" /> Cofnij
              </button>
              <button className={btnSecondary} onClick={() => start(null)}>
                <X className="h-3.5 w-3.5" /> Anuluj
              </button>
              <button className={btnPrimary} disabled={draft.length < 3 || busy === 'area'} onClick={finish}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Zamknij wielokąt
              </button>
            </div>
          )}
          {mode === 'base' && (
            <div className="rounded-2xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-800">
              Kliknij na mapie nowe położenie Strefy Zero (bezpieczna krawędź strefy zalewowej).
            </div>
          )}
          <MissionMap
            base={d.base}
            radioRangeKm={radio}
            area={mode === 'area' ? [] : d.area}
            noFlyZones={d.noFlyZones}
            draft={draft}
            drawMode={mode}
            onMapClick={onMapClick}
            sectors={mode === 'area' ? [] : d.sectors}
            priorityCells={showHeat ? d.priorityGrid?.cells ?? [] : []}
            priorityCellM={d.priorityGrid?.cellM ?? 0}
            priorityRange={d.priorityGrid ? [d.priorityGrid.minWeight, d.priorityGrid.maxWeight] : undefined}
            priorityZones={zones}
            waterways={showHeat ? d.mapFeatures?.waterways ?? [] : []}
            height="560px"
          />
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <label className="flex items-center gap-1.5 font-semibold">
              <input type="checkbox" className="accent-indigo-600" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> Mapa prawdopodobieństwa
            </label>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500/70" /> wysokie</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-orange-400/60" /> średnie</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-yellow-300/60" /> podwyższone</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-sky-600" /> cieki wodne (OSM)</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t border-dashed border-slate-500" /> rozpoznanie</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-slate-600" /> przeszukanie dokładne</span>
          </div>
        </div>

        <div className="space-y-4">
          <SectionCard title="Strategia poszukiwań" icon={<Sparkles className="h-5 w-5" />} subtitle="Cel: jak najszybciej znaleźć jak najwięcej osób">
            <div className="space-y-2">
              {(Object.keys(SEARCH_MODE_LABELS) as SearchMode[]).map((m) => (
                <button
                  key={m}
                  disabled={!canEdit || busy === 'mode'}
                  onClick={() => m !== d.searchMode && savePriority('mode', { searchMode: m })}
                  className={`w-full text-left rounded-2xl border p-3 transition ${d.searchMode === m ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200/80 bg-white hover:bg-slate-50'}`}
                >
                  <div className="text-xs font-extrabold text-slate-900">{SEARCH_MODE_LABELS[m].label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{SEARCH_MODE_LABELS[m].description}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Layers3 className="h-4 w-4 text-orange-500" /> Mapa priorytetów
              </div>
              <p className="text-[11px] text-slate-500">
                {d.priorityGrid && !d.priorityGrid.uniform
                  ? `Źródła: ${d.priorityGrid.sources.join(', ')}. Trasy najpierw obejmują miejsca, gdzie ludzi jest najprawdopodobniej najwięcej.`
                  : 'Brak mapy – cała strefa ma równe prawdopodobieństwo. Wyznacz priorytety z mapy (rzeki, zabudowa) lub zaznacz strefy ręcznie.'}
              </p>
              {canEdit && (
                <button className={`${btnSecondary} w-full`} disabled={d.area.length < 3 || busy === 'auto'} onClick={() => act('auto', 'post', '/priority/auto')}>
                  {busy === 'auto' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {d.mapFeatures ? 'Odśwież dane z mapy (rzeki, zabudowa)' : 'Wyznacz priorytety z mapy (rzeki, zabudowa)'}
                </button>
              )}
              {d.mapFeatures && (
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    OpenStreetMap: {d.mapFeatures.waterways.length} cieków, {d.mapFeatures.buildingsCount} budynków
                  </span>
                  {canEdit && (
                    <button className="text-red-600 hover:underline" onClick={() => savePriority('auto', { clearFeatures: true })}>
                      usuń
                    </button>
                  )}
                </div>
              )}
              {zones.map((z) => (
                <div key={z.id} className="flex items-center justify-between rounded-xl border border-slate-200/80 px-2.5 py-1.5 text-[11px]">
                  <span className={`font-bold ${z.level === 'wysoki' ? 'text-red-600' : 'text-orange-600'}`}>
                    Strefa {z.level === 'wysoki' ? 'wysokiego' : 'średniego'} priorytetu {z.label ? `– ${z.label}` : ''}
                  </span>
                  {canEdit && (
                    <button className="p-1 rounded text-slate-400 hover:text-red-600" title="Usuń strefę" onClick={() => savePriority('zone', { zones: zones.filter((x) => x.id !== z.id) })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Łączność i baza" icon={<MapPin className="h-5 w-5" />}>
            <div className="text-xs text-slate-600 space-y-1">
              <div>
                Strefa Zero: <b>{d.base.name || `${d.base.lat.toFixed(5)}, ${d.base.lng.toFixed(5)}`}</b>
              </div>
              <label className={`${labelCls} mt-3`}>Zasięg RTK / MESH: {radio} km</label>
              <input type="range" min={1} max={20} step={0.5} disabled={!canEdit} value={radio} onChange={(e) => setRadio(Number(e.target.value))} className="w-full accent-indigo-600" />
              {radio !== d.radioRangeKm && canEdit && (
                <button className={`${btnSecondary} mt-2`} onClick={() => act('base', 'put', '/base', { lat: d.base.lat, lng: d.base.lng, radioRangeKm: radio })}>
                  <Save className="h-3.5 w-3.5" /> Zapisz zasięg
                </button>
              )}
              <p className="text-[11px] text-slate-400 pt-1">Najdalsze punkty podwarstw poza tym promieniem zostaną automatycznie skorygowane (krok 4.1).</p>
            </div>
          </SectionCard>

          <SectionCard
            title="Podział na podwarstwy"
            icon={<Route className="h-5 w-5" />}
            subtitle={d.planStats ? `${d.planStats.coveredKm2} z ${d.planStats.areaKm2} km² • teren ${d.planStats.terrainMin}–${d.planStats.terrainMax} m n.p.m.` : undefined}
          >
            {d.planStats?.finishMinutes !== undefined && d.sectors.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Powrót floty</div>
                  <div className="text-lg font-extrabold text-indigo-800 tabular-nums">~{Math.round(d.planStats.finishMinutes)} min</div>
                </div>
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Rozrzut powrotów</div>
                  <div className="text-lg font-extrabold text-emerald-800 tabular-nums">{d.planStats.finishSpreadMinutes} min</div>
                </div>
                {d.planStats.expectedFindMinutes !== undefined && (
                  <div className="col-span-2 rounded-2xl bg-orange-50 border border-orange-100 p-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Średni czas dotarcia nad osobę</div>
                    <div className="text-lg font-extrabold text-orange-800 tabular-nums">
                      {d.planStats.expectedFindMinutes} min
                      <span className="text-xs font-semibold text-orange-600"> (zwykła żmija: {d.planStats.baselineExpectedFindMinutes} min)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {canEdit && (
              <button
                className={`${btnPrimary} w-full`}
                disabled={busy === 'plan' || d.area.length < 3 || !d.weather}
                onClick={() => act('plan', 'post', '/plan')}
              >
                {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                {d.sectors.length ? 'Przelicz podział i trasy' : 'Generuj podział i trasy lotu'}
              </button>
            )}
            {!d.weather && <p className="text-[11px] text-amber-600 mt-2">Najpierw pobierz pogodę i przeanalizuj flotę.</p>}
            {d.area.length < 3 && <p className="text-[11px] text-amber-600 mt-2">Narysuj na mapie strefę poszukiwań.</p>}
            {d.planWarnings.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {d.planWarnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-[11px] text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {d.sectors.length > 0 && (
        <SectionCard title="Sektory i wzorce lotu" subtitle="Wzorzec „lawnmower” (żmija) dopasowany do FOV kamery i wysokości, pułap nad najwyższym punktem terenu" icon={<Layers className="h-5 w-5" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {d.sectors.map((s) => (
              <div key={s.id} className="rounded-2xl border border-slate-200/80 p-4" style={{ borderLeft: `5px solid ${s.color}` }}>
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-slate-900">
                    Sektor {s.index + 1} • {s.droneName}
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200">Echelon {s.echelon + 1}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  {[
                    ['Pow.', `${s.areaKm2} km²`],
                    ['Pułap', `${s.altitudeAgl} m AGL`],
                    ['Skan', `${s.pathLengthKm} km`],
                    ['Przelot', s.transitInKm !== undefined ? `${s.transitInKm} km` : '—'],
                    ['Powrót', s.returnKm !== undefined ? `${s.returnKm} km` : '—'],
                    ['Wyloty', s.sorties],
                    ['Linie', s.sweepDeg?.length ? s.sweepDeg.map((x) => `${x}°`).join(' / ') : '—'],
                    ['Zawroty', s.turns ?? '—'],
                    ['Dotarcie nad osobę', s.expectedFindMinutes !== undefined ? `${s.expectedFindMinutes} min` : '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-xl bg-slate-50 border border-slate-200/80 p-1.5">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{k}</div>
                      <div className="text-xs font-extrabold text-slate-800">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs">
                  <span className="font-semibold text-indigo-700">Powrót do bazy po</span>
                  <span className="font-extrabold text-indigo-800 tabular-nums">{s.estimatedMinutes} min</span>
                </div>
                <ul className="mt-3 space-y-1">
                  {s.notes.map((n) => (
                    <li key={n} className="text-[11px] text-slate-500">
                      • {n}
                    </li>
                  ))}
                  <li className="text-[11px] text-slate-500">
                    • {s.waypoints.length} punktów trasy, wys. bezwzględna {Math.min(...s.waypoints.map((w) => w.altAmsl))}–{Math.max(...s.waypoints.map((w) => w.altAmsl))} m n.p.m.
                  </li>
                </ul>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

const TeamTab: React.FC<MissionViewProps> = ({ mission, act, busy }) => {
  const canEdit = mission.permissions.isCommander;
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [draft, setDraft] = useState<Record<MissionRole, string[]>>(() => {
    const a = mission.data.assignments;
    return Object.fromEntries((Object.keys(ROLE_LABELS) as MissionRole[]).map((r) => [r, (a[r] ?? []).map((p) => p.userId)])) as Record<MissionRole, string[]>;
  });

  useEffect(() => {
    api.get('/missions/assignable-users').then((res) => setUsers(res.data.users || []));
  }, []);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  return (
    <SectionCard
      title="Przydział osób do zarządzania dronami i alertami"
      subtitle="Ścisły podział zadań zapobiega przeciążeniu informacyjnemu (alarm fatigue) – każda rola widzi tylko swoje zadania."
      icon={<Users className="h-5 w-5" />}
      actions={
        canEdit && (
          <button className={btnPrimary} disabled={busy === 'team'} onClick={() => act('team', 'put', '/assignments', draft)}>
            <Save className="h-4 w-4" /> Zapisz zespół
          </button>
        )
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(ROLE_LABELS) as MissionRole[]).map((role) => (
          <div key={role} className="rounded-2xl border border-slate-200/80 p-4">
            <div className="font-extrabold text-sm text-slate-900">{ROLE_LABELS[role].label}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">{ROLE_LABELS[role].description}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {draft[role].map((id) => {
                const u = byId.get(id);
                const fallback = mission.data.assignments[role].find((p) => p.userId === id)?.name;
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-semibold px-2 py-1">
                    {u ? `${u.firstName} ${u.lastName}` : fallback ?? id}
                    {canEdit && (
                      <button onClick={() => setDraft((d) => ({ ...d, [role]: d[role].filter((x) => x !== id) }))} className="hover:text-red-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
              {draft[role].length === 0 && <span className="text-[11px] text-slate-400">Nikt nie jest przydzielony</span>}
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 mt-3">
                <UserPlus className="h-4 w-4 text-slate-400 shrink-0" />
                <select
                  className={inputCls}
                  value=""
                  onChange={(e) => e.target.value && setDraft((d) => ({ ...d, [role]: [...d[role], e.target.value] }))}
                >
                  <option value="">Dodaj osobę…</option>
                  {users
                    .filter((u) => !draft[role].includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} – {u.organization?.name ?? u.email}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">
        Bez przydzielonego technika wymianę baterii wykonuje z opóźnieniem obsługa bazy. Dowódca ma uprawnienia wszystkich ról.
      </p>
    </SectionCard>
  );
};

export const MissionPlanning: React.FC<MissionViewProps> = (props) => {
  const { mission, act, busy } = props;
  const d = mission.data;
  const [tab, setTab] = useState<Tab>(d.fleetAnalysis.length === 0 ? 'flota' : d.sectors.length === 0 ? 'strefa' : 'zespol');

  const tabs: { key: Tab; label: string; done: boolean }[] = [
    { key: 'flota', label: 'Kroki 2–3 • Pogoda i flota', done: d.fleetAnalysis.length > 0 && d.selectedDroneIds.length > 0 },
    { key: 'strefa', label: 'Krok 4 • Strefa i trasy', done: d.sectors.length > 0 },
    { key: 'zespol', label: 'Krok 5 • Zespół', done: d.assignments.dowodca.length > 0 && d.assignments.weryfikator.length > 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.done && <CheckCircle2 className="h-3.5 w-3.5" />} {t.label}
          </button>
        ))}
        {mission.permissions.isCommander && (
          <button
            className={`${btnPrimary} ml-auto`}
            disabled={d.sectors.length === 0 || busy === 'prepare'}
            title={d.sectors.length === 0 ? 'Wygeneruj najpierw plan tras' : ''}
            onClick={() => act('prepare', 'post', '/prepare')}
          >
            {busy === 'prepare' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Zatwierdź plan i załaduj flotę
          </button>
        )}
      </div>
      {tab === 'flota' && <FleetTab {...props} />}
      {tab === 'strefa' && <AreaTab {...props} />}
      {tab === 'zespol' && <TeamTab {...props} />}
    </div>
  );
};

export default MissionPlanning;
