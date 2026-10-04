/**
 * Krok 8.1 – automatyczny raport operacji: mapa tras, zwalidowane pineski,
 * statystyki zasobów logistycznych i oś czasu. Dostępny jako JSON (widok do druku / PDF)
 * oraz arkusz Excel.
 */
import ExcelJS from 'exceljs';
import { normalizeMissionData, type Mission } from '../models/Mission';
import { PAYLOAD_LABELS } from './missionSimulator';

const CRITICALITY_LABEL = { krytyczny: 'Krytyczny', umiarkowany: 'Umiarkowany', niski: 'Niski' } as const;
const RESCUE_LABEL = { oczekuje: 'Oczekuje', w_drodze: 'Zespół w drodze', ewakuowano: 'Ewakuowano' } as const;
const STATUS_LABEL = { wstepny: 'Alert wstępny', potwierdzony: 'Potwierdzony', odrzucony: 'Fałszywy alarm' } as const;
const DELIVERY_LABEL: Record<string, string> = {
  oczekuje_autoryzacji: 'Oczekuje autoryzacji',
  oczekuje_zaladunku: 'Oczekuje załadunku',
  oczekuje_drona: 'Oczekuje na drona',
  w_locie: 'W locie',
  zrzucono: 'Zrzucono',
  odrzucona: 'Odrzucona',
};

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const priorityOf = (c: string) => (c === 'krytyczny' ? 1 : c === 'umiarkowany' ? 2 : 3);

export const buildMissionReport = (mission: Mission) => {
  const data = normalizeMissionData(mission.data);
  const createdBy = (mission as any).createdBy;

  const sectors = data.sectors.map((s) => {
    const drone = data.drones.find((d) => d.sectorId === s.id);
    const scanned = drone ? (drone.sectorDone ? s.waypoints.length : Math.min(drone.scanIndex, s.waypoints.length)) : 0;
    return {
      id: s.id,
      index: s.index,
      droneName: s.droneName,
      color: s.color,
      polygon: s.polygon,
      areaKm2: s.areaKm2,
      altitudeAgl: s.altitudeAgl,
      pathLengthKm: s.pathLengthKm,
      waypoints: s.waypoints.map((w) => [w.lat, w.lng] as [number, number]),
      coveragePct: s.waypoints.length ? round((scanned / s.waypoints.length) * 100, 0) : 0,
      reassigned: drone?.sectorReassigned ?? false,
    };
  });

  const persons = data.detections
    .filter((d) => d.status !== 'odrzucony')
    .sort((a, b) => priorityOf(a.criticality) - priorityOf(b.criticality) || b.pk - a.pk)
    .map((d, i) => ({
      no: i + 1,
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      persons: d.persons,
      criticality: d.criticality,
      pk: d.pk,
      priority: priorityOf(d.criticality),
      status: d.status,
      rescueStatus: d.rescueStatus,
      rescueTeam: d.rescueTeam ?? null,
      source: d.source,
      droneName: d.droneName,
      detectedAt: d.detectedAt,
      waterDepthM: d.waterDepthM,
      gesture: d.gesture,
      offline: d.offline,
    }));

  const dropped = data.deliveries.filter((x) => x.status === 'zrzucono');
  const flights = data.drones.map((d) => ({
    droneId: d.droneId,
    name: d.name,
    model: d.model,
    category: d.category,
    sorties: d.sorties,
    distanceKm: round(d.distanceKm, 2),
    flightMinutes: round(d.flightSeconds / 60, 1),
    battery: round(d.battery, 0),
    phase: d.phase,
    track: d.track,
  }));

  // Skuteczność poszukiwań względem prawdy terenowej symulacji
  const start = data.startedAtSim ?? 0;
  const victims = data.hidden.filter((t) => t.kind === 'osoba');
  const foundTimes = victims
    .filter((t) => t.foundAtSim !== undefined)
    .map((t) => (t.foundAtSim! - start) / 60)
    .sort((a, b) => a - b);
  const firstSignal = data.signals.length ? Math.min(...data.signals.map((s) => s.detectedAtSim)) : null;
  const effectiveness = victims.length
    ? {
        searchMode: data.searchMode,
        hiddenSites: victims.length,
        hiddenPersons: victims.reduce((s, t) => s + t.persons, 0),
        foundSites: foundTimes.length,
        foundPersons: victims.filter((t) => t.foundAtSim !== undefined).reduce((s, t) => s + t.persons, 0),
        firstFindMinutes: foundTimes.length ? round(foundTimes[0], 1) : null,
        medianFindMinutes: foundTimes.length ? round(foundTimes[Math.floor((foundTimes.length - 1) / 2)], 1) : null,
        halfFoundMinutes: foundTimes.length >= Math.ceil(victims.length / 2) ? round(foundTimes[Math.ceil(victims.length / 2) - 1], 1) : null,
        lastFindMinutes: foundTimes.length ? round(foundTimes[foundTimes.length - 1], 1) : null,
        firstSignalMinutes: firstSignal !== null ? round((firstSignal - start) / 60, 1) : null,
        signals: data.signals.length,
        signalsConfirmed: data.signals.filter((s) => s.status === 'potwierdzony').length,
        signalsFalse: data.signals.filter((s) => s.status === 'falszywy').length,
        decoys: data.hidden.filter((t) => t.kind !== 'osoba').length,
        plannedExpectedFindMinutes: data.planStats?.expectedFindMinutes ?? null,
        plannedBaselineMinutes: data.planStats?.baselineExpectedFindMinutes ?? null,
        foundTimeline: foundTimes.map((t) => round(t, 1)),
      }
    : null;

  return {
    effectiveness,
    mission: {
      id: mission.id,
      name: mission.name,
      description: mission.description,
      status: mission.status,
      createdBy: createdBy ? `${createdBy.firstName} ${createdBy.lastName}` : null,
      startedAt: mission.startedAt,
      endedAt: mission.endedAt,
      generatedAt: new Date().toISOString(),
      simulatedMinutes: round(data.simSeconds / 60, 0),
    },
    base: data.base,
    radioRangeKm: data.radioRangeKm,
    area: data.area,
    noFlyZones: data.noFlyZones,
    weather: data.weatherOverride ?? data.weather,
    planStats: data.planStats ?? null,
    assignments: data.assignments,
    summary: {
      areaKm2: data.planStats?.areaKm2 ?? 0,
      avgCoveragePct: sectors.length ? round(sectors.reduce((s, x) => s + x.coveragePct, 0) / sectors.length, 0) : 0,
      drones: data.drones.length,
      sorties: flights.reduce((s, f) => s + f.sorties, 0),
      distanceKm: round(flights.reduce((s, f) => s + f.distanceKm, 0), 1),
      detections: persons.length,
      personsFound: persons.reduce((s, p) => s + p.persons, 0),
      critical: persons.filter((p) => p.criticality === 'krytyczny').length,
      evacuated: persons.filter((p) => p.rescueStatus === 'ewakuowano').reduce((s, p) => s + p.persons, 0),
      falseAlarmsOnboard: data.stats.falseAlarmsOnboard,
      falseAlarmsVerifier: data.stats.falseAlarmsVerifier,
    },
    logistics: {
      vests: data.stats.vests,
      medkits: data.stats.medkits,
      foodWater: data.stats.foodWater,
      drops: dropped.length,
      pending: data.deliveries.filter((x) => !['zrzucono', 'odrzucona'].includes(x.status)).length,
      deliveries: data.deliveries.map((x) => ({
        id: x.id,
        payload: PAYLOAD_LABELS[x.payloadType],
        quantity: x.quantity,
        weightKg: x.weightKg,
        status: x.status,
        statusLabel: DELIVERY_LABEL[x.status] ?? x.status,
        automatic: x.automatic,
        droneName: x.droneName ?? null,
        createdAt: x.createdAt,
        droppedAt: x.droppedAt ?? null,
      })),
    },
    sectors,
    flights,
    persons,
    timeline: data.events
      .filter((e) => e.level !== 'info' || ['detekcja', 'dostawa', 'system', 'pogoda'].includes(e.category))
      .map((e) => ({ at: e.at, simMinutes: round(e.simSeconds / 60, 0), level: e.level, category: e.category, message: e.message })),
  };
};

const styleHeader = (sheet: ExcelJS.Worksheet) => {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  row.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
};

export const buildMissionWorkbook = async (mission: Mission): Promise<ExcelJS.Workbook> => {
  const r = buildMissionReport(mission);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'System Koordynacji Kryzysowej';
  wb.created = new Date();

  const summary = wb.addWorksheet('Podsumowanie');
  summary.columns = [
    { header: 'Parametr', key: 'k', width: 42 },
    { header: 'Wartość', key: 'v', width: 60 },
  ];
  const rows: [string, string | number][] = [
    ['Operacja', r.mission.name],
    ['Status', r.mission.status],
    ['Dowódca / autor', r.mission.createdBy ?? '—'],
    ['Rozpoczęcie', r.mission.startedAt ? new Date(r.mission.startedAt).toLocaleString('pl-PL') : '—'],
    ['Zakończenie', r.mission.endedAt ? new Date(r.mission.endedAt).toLocaleString('pl-PL') : '—'],
    ['Czas operacji (symulowany, min)', r.mission.simulatedMinutes],
    ['Strefa Zero (lat, lng)', `${r.base.lat.toFixed(5)}, ${r.base.lng.toFixed(5)}`],
    ['Powierzchnia strefy (km²)', r.summary.areaKm2],
    ['Średnie pokrycie sektorów (%)', r.summary.avgCoveragePct],
    ['Liczba dronów / wylotów', `${r.summary.drones} / ${r.summary.sorties}`],
    ['Łączny dystans lotów (km)', r.summary.distanceKm],
    ['Odnalezione osoby', r.summary.personsFound],
    ['Punkty krytyczne', r.summary.critical],
    ['Osoby ewakuowane', r.summary.evacuated],
    ['Fałszywe alarmy (pokładowe / weryfikator)', `${r.summary.falseAlarmsOnboard} / ${r.summary.falseAlarmsVerifier}`],
    ['Zrzucone kamizelki ratunkowe', r.logistics.vests],
    ['Zrzucone pakiety medyczne', r.logistics.medkits],
    ['Zrzucone pakiety wody i żywności', r.logistics.foodWater],
    [
      'Pogoda (ostatni odczyt)',
      r.weather
        ? `${r.weather.temperature.toFixed(1)}°C, wiatr ${r.weather.windSpeed.toFixed(1)} m/s (porywy ${r.weather.windGust.toFixed(1)}), opad ${r.weather.precipitation.toFixed(1)} mm/h [${r.weather.source}]`
        : '—',
    ],
    ['Tryb przeszukania', r.effectiveness?.searchMode ?? '—'],
    ['Oczekiwany czas dotarcia nad osobę – plan (bez priorytetów)', r.effectiveness ? `${r.effectiveness.plannedExpectedFindMinutes ?? '—'} min (${r.effectiveness.plannedBaselineMinutes ?? '—'} min)` : '—'],
    ['Symulacja: odnalezione miejsca / osoby', r.effectiveness ? `${r.effectiveness.foundSites} z ${r.effectiveness.hiddenSites} / ${r.effectiveness.foundPersons} z ${r.effectiveness.hiddenPersons}` : '—'],
    ['Pierwszy sygnał / pierwsze odnalezienie (min od startu)', r.effectiveness ? `${r.effectiveness.firstSignalMinutes ?? '—'} / ${r.effectiveness.firstFindMinutes ?? '—'}` : '—'],
    ['Połowa osób odnaleziona po (min)', r.effectiveness?.halfFoundMinutes ?? '—'],
    ['Wygenerowano', new Date(r.mission.generatedAt).toLocaleString('pl-PL')],
  ];
  rows.forEach(([k, v]) => summary.addRow({ k, v }));
  styleHeader(summary);

  const persons = wb.addWorksheet('Odnalezione osoby');
  persons.columns = [
    { header: 'Lp.', key: 'no', width: 6 },
    { header: 'Priorytet ewakuacji', key: 'priority', width: 18 },
    { header: 'Poziom zagrożenia', key: 'criticality', width: 18 },
    { header: 'PK', key: 'pk', width: 8 },
    { header: 'Liczba osób', key: 'persons', width: 12 },
    { header: 'Szerokość (lat)', key: 'lat', width: 14 },
    { header: 'Długość (lng)', key: 'lng', width: 14 },
    { header: 'Głębokość wody (m)', key: 'water', width: 18 },
    { header: 'Status weryfikacji', key: 'status', width: 18 },
    { header: 'Status ewakuacji', key: 'rescue', width: 18 },
    { header: 'Zespół', key: 'team', width: 24 },
    { header: 'Źródło', key: 'source', width: 14 },
    { header: 'Dron', key: 'drone', width: 16 },
    { header: 'Czas detekcji', key: 'at', width: 20 },
  ];
  r.persons.forEach((p) =>
    persons.addRow({
      no: p.no,
      priority: p.priority,
      criticality: CRITICALITY_LABEL[p.criticality],
      pk: p.pk,
      persons: p.persons,
      lat: p.lat,
      lng: p.lng,
      water: p.waterDepthM,
      status: STATUS_LABEL[p.status],
      rescue: RESCUE_LABEL[p.rescueStatus],
      team: p.rescueTeam ?? '',
      source: p.source === 'termowizja' ? 'FLIR' : 'RGB/AI',
      drone: p.droneName,
      at: new Date(p.detectedAt).toLocaleString('pl-PL'),
    })
  );
  styleHeader(persons);

  const sectors = wb.addWorksheet('Sektory i trasy');
  sectors.columns = [
    { header: 'Sektor', key: 's', width: 8 },
    { header: 'Dron', key: 'drone', width: 16 },
    { header: 'Powierzchnia (km²)', key: 'area', width: 18 },
    { header: 'Wysokość AGL (m)', key: 'alt', width: 16 },
    { header: 'Długość trasy (km)', key: 'len', width: 18 },
    { header: 'Pokrycie (%)', key: 'cov', width: 12 },
    { header: 'Przejęty przez sąsiadów', key: 're', width: 22 },
  ];
  r.sectors.forEach((s) =>
    sectors.addRow({ s: s.index + 1, drone: s.droneName, area: s.areaKm2, alt: s.altitudeAgl, len: s.pathLengthKm, cov: s.coveragePct, re: s.reassigned ? 'tak' : 'nie' })
  );
  styleHeader(sectors);

  const flights = wb.addWorksheet('Loty dronów');
  flights.columns = [
    { header: 'Dron', key: 'name', width: 16 },
    { header: 'Model', key: 'model', width: 28 },
    { header: 'Kategoria', key: 'cat', width: 14 },
    { header: 'Wyloty', key: 'sorties', width: 10 },
    { header: 'Dystans (km)', key: 'dist', width: 14 },
    { header: 'Czas lotu (min)', key: 'time', width: 16 },
    { header: 'Bateria końcowa (%)', key: 'bat', width: 18 },
  ];
  r.flights.forEach((f) =>
    flights.addRow({ name: f.name, model: f.model, cat: f.category, sorties: f.sorties, dist: f.distanceKm, time: f.flightMinutes, bat: f.battery })
  );
  styleHeader(flights);

  const logistics = wb.addWorksheet('Zasoby logistyczne');
  logistics.columns = [
    { header: 'Ładunek', key: 'payload', width: 22 },
    { header: 'Ilość', key: 'qty', width: 8 },
    { header: 'Masa (kg)', key: 'kg', width: 10 },
    { header: 'Status', key: 'status', width: 22 },
    { header: 'Tryb', key: 'mode', width: 22 },
    { header: 'Dron', key: 'drone', width: 16 },
    { header: 'Zrzut', key: 'at', width: 20 },
  ];
  r.logistics.deliveries.forEach((d) =>
    logistics.addRow({
      payload: d.payload,
      qty: d.quantity,
      kg: d.weightKg,
      status: d.statusLabel,
      mode: d.automatic ? 'Automatyczny (krytyczny)' : 'Po autoryzacji',
      drone: d.droneName ?? '',
      at: d.droppedAt ? new Date(d.droppedAt).toLocaleString('pl-PL') : '',
    })
  );
  styleHeader(logistics);

  const timeline = wb.addWorksheet('Oś czasu');
  timeline.columns = [
    { header: 'Czas', key: 'at', width: 20 },
    { header: 'T+ (min)', key: 't', width: 10 },
    { header: 'Poziom', key: 'level', width: 14 },
    { header: 'Kategoria', key: 'cat', width: 12 },
    { header: 'Zdarzenie', key: 'msg', width: 110 },
  ];
  r.timeline.forEach((e) =>
    timeline.addRow({ at: new Date(e.at).toLocaleString('pl-PL'), t: e.simMinutes, level: e.level, cat: e.category, msg: e.message })
  );
  styleHeader(timeline);

  return wb;
};
