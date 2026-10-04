/**
 * Symulator przebiegu operacji (kroki 6–8 planu). Fizyczne drony, sensory i modele AI
 * są tu zastąpione modelem symulacyjnym, który zachowuje logikę decyzyjną systemu C2:
 *  6.  start, przelot (transit), wejście w sektor, skanowanie wzorcem żmii, telemetria,
 *  7.1 detekcja (FLIR → RGB/OpenCV) na podstawie ukrytej „prawdy terenowej” – osoba zostaje
 *      wykryta tylko wtedy, gdy znajdzie się w pasie kamery, z prawdopodobieństwem zależnym od
 *      wysokości, sensora i pory dnia; w trybie dwuprzebiegowym rozpoznanie zgłasza sygnały,
 *      które przeszukanie dokładne sprawdza po obniżeniu pułapu; PK, wywiad gestami,
 *      automatyczne zrzuty kamizelek (krytyczne) i dostawy po autoryzacji (umiarkowane),
 *  7.2 utrata łączności – Offline Search, Smart RTH i przejęcie sektora przez sąsiadów,
 *  7.3 nagła zmiana pogody – automatyczny powrót / uziemienie i aktualizacja mapy zagrożeń,
 *  8.  powrót floty, tryb czuwania, zakończenie operacji.
 */
import { Drone } from '../models/Drone';
import {
  Delivery,
  Detection,
  DroneRuntime,
  FleetAnalysisItem,
  HiddenTarget,
  Mission,
  MissionData,
  ProcedureStage,
  SearchSignal,
  VictimAssessment,
  Waypoint,
  WeatherSnapshot,
} from '../models/Mission';
import {
  DroneSpec,
  LIFE_VEST_KG,
  MIN_VESTS_PER_DROP,
  REFERENCE_HEIGHT_M,
  RTH_RESERVE,
  assessVictim,
  criticalityLevel,
  effectiveFlightMinutes,
  effectivePayloadKg,
  scanSpeedFor,
  weatherCoefficient,
} from './flightMath';
import { bearingDeg, haversineKm, moveTowards } from './geo';
import { computePriorityGrid, gridCells } from './priorityService';
import { groundSpeed, windVector } from './routeBuilder';
import { addEvent, logFeed, newId, withMission } from './missionStore';
import { fetchLiveWeather } from './weatherService';

export const TICK_MS = 1000;
/** 1 s czasu rzeczywistego = 20 s czasu operacji (przyspieszenie symulacji) */
export const TIME_SCALE = 20;
/** Dopuszczalne tempa symulacji wybierane przez dowódcę (×1 – czas rzeczywisty) */
export const TIME_SCALES = [1, 2, 5, 10, 20] as const;
export const missionTimeScale = (data: MissionData) => data.timeScale ?? TIME_SCALE;
/** Czas operacji na jeden tick – ustawiany przed tickiem każdej operacji (operacje są tickowane kolejno) */
let SIM_DT = (TICK_MS / 1000) * TIME_SCALE;

const WEATHER_CHECK_SIM_S = 300;
const TELEMETRY_TIMEOUT_SIM_S = 60;
/** Prawdopodobieństwo wykrycia osoby w pasie kamery (POD) – [termowizja, tylko RGB] × [dzień, noc] */
const POD = {
  1: { thermal: { day: 0.75, night: 0.85 }, rgb: { day: 0.45, night: 0.1 } },
  2: { thermal: { day: 0.9, night: 0.95 }, rgb: { day: 0.8, night: 0.2 } },
} as const;
const RANDOM_LINK_LOSS_PER_TICK = 0.002;
const LINK_RESTORE_PER_TICK = 0.08;
const AUTO_BATTERY_SWAP_TICKS = 25;
const TRACK_LIMIT = 400;
/** 45 ticków = 15 minut operacji bez żadnej aktywności floty */
const IDLE_FINISH_TICKS = 45;

const AIRBORNE = new Set(['przelot', 'skanowanie', 'weryfikacja_celu', 'analiza', 'wywiad', 'monitorowanie', 'dostawa', 'sprawdzanie_sygnalu', 'powrot']);
export const isAirborne = (d: DroneRuntime) => AIRBORNE.has(d.phase);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export const currentWeather = (data: MissionData): WeatherSnapshot | null => data.weatherOverride ?? data.weather;

export const createRuntime = (spec: DroneSpec, base: { lat: number; lng: number }, analysis: FleetAnalysisItem | undefined, sectorId: string | null): DroneRuntime => ({
  droneId: spec.id,
  name: spec.name,
  model: spec.model,
  category: spec.category,
  sectorId,
  phase: 'baza',
  lat: base.lat,
  lng: base.lng,
  altAgl: 0,
  battery: 100,
  speed: 0,
  heading: 0,
  cruiseSpeed: spec.cruiseSpeed,
  maxPayloadKg: spec.maxPayloadKg,
  hasThermal: spec.hasThermal,
  hasSpeaker: spec.hasSpeaker,
  radioRangeKm: spec.radioRangeKm,
  effectiveMinutes: analysis?.capability.effectiveMinutes ?? 20,
  scanIndex: 0,
  extraWaypoints: [],
  sectorDone: false,
  calibrated: false,
  connected: false,
  linkLost: false,
  sectorReassigned: false,
  lastTelemetryAt: new Date().toISOString(),
  taskTicks: 0,
  detectionId: null,
  deliveryId: null,
  returnReason: null,
  offlineBuffer: [],
  target: null,
  candidate: null,
  signalQueue: [],
  reportedLat: base.lat,
  reportedLng: base.lng,
  reportedBattery: 100,
  batterySwapWaitTicks: 0,
  sorties: 0,
  distanceKm: 0,
  flightSeconds: 0,
  track: [],
  groundedByWeather: false,
  spec,
  activity: 'Dron w bazie',
  feedLog: [],
  procedure: null,
});

const sectorOf = (data: MissionData, d: DroneRuntime) => data.sectors.find((s) => s.id === d.sectorId) ?? null;

const nextScanWaypoint = (data: MissionData, d: DroneRuntime): Waypoint | null => {
  const sector = sectorOf(data, d);
  if (sector && d.scanIndex < sector.waypoints.length) return sector.waypoints[d.scanIndex];
  return d.extraWaypoints[0] ?? null;
};

const advanceScanWaypoint = (data: MissionData, d: DroneRuntime) => {
  const sector = sectorOf(data, d);
  if (sector && d.scanIndex < sector.waypoints.length) d.scanIndex++;
  else d.extraWaypoints.shift();
};

export const orderReturn = (data: MissionData, d: DroneRuntime, reason: string) => {
  if (!isAirborne(d) || d.phase === 'powrot') return;
  abortProcedure(data, d);
  if (d.phase === 'dostawa' && d.deliveryId) {
    const delivery = data.deliveries.find((x) => x.id === d.deliveryId);
    if (delivery && delivery.status === 'w_locie') {
      delivery.status = 'oczekuje_drona';
      delivery.droneId = null;
      delivery.droneName = null;
    }
    d.deliveryId = null;
  }
  d.phase = 'powrot';
  d.returnReason = reason;
  d.target = { lat: data.base.lat, lng: data.base.lng };
  d.altAgl = Math.max(d.altAgl, 80);
  d.candidate = null;
};

const drainBattery = (d: DroneRuntime, seconds: number) => {
  d.battery = Math.max(0, d.battery - (seconds / (Math.max(1, d.effectiveMinutes) * 60)) * 100);
};

const pushTrack = (d: DroneRuntime) => {
  const last = d.track[d.track.length - 1];
  if (!last || Math.abs(last[0] - d.lat) > 1e-6 || Math.abs(last[1] - d.lng) > 1e-6) d.track.push([round(d.lat, 6), round(d.lng, 6)]);
  if (d.track.length > TRACK_LIMIT) d.track = d.track.filter((_, i) => i % 2 === 0 || i === d.track.length - 1);
};

/** Prędkość względem ziemi na kursie do celu przy danym wietrze */
const groundSpeedTo = (from: { lat: number; lng: number }, to: { lat: number; lng: number }, airspeed: number, wind: { x: number; y: number }) => {
  if (wind.x === 0 && wind.y === 0) return airspeed;
  const b = (bearingDeg(from, to) * Math.PI) / 180;
  return groundSpeed(airspeed, { x: Math.sin(b), y: Math.cos(b) }, wind);
};

const windOf = (data: MissionData) => windVector(currentWeather(data));

/** Przesuwa drona w kierunku celu; zwraca przebyty dystans (km) i informację o osiągnięciu celu */
const fly = (d: DroneRuntime, to: { lat: number; lng: number }, airspeed: number, seconds: number, wind = { x: 0, y: 0 }) => {
  const from = { lat: d.lat, lng: d.lng };
  const speed = groundSpeedTo(from, to, airspeed, wind);
  const next = moveTowards(from, to, speed * seconds);
  const distKm = haversineKm(from, next);
  if (distKm > 0) d.heading = round(bearingDeg(from, next), 0);
  d.lat = next.lat;
  d.lng = next.lng;
  d.speed = speed;
  d.distanceKm = round(d.distanceKm + distKm, 3);
  return { distKm, reached: next.reached };
};

/** Czy bateria wystarczy na powrót z zachowaniem obowiązkowej rezerwy (Return-to-Home) */
const needsReturnForBattery = (data: MissionData, d: DroneRuntime) => {
  const distM = haversineKm(d, data.base) * 1000;
  const needed = ((distM / d.cruiseSpeed) / (Math.max(1, d.effectiveMinutes) * 60)) * 100 + RTH_RESERVE * 100;
  return d.battery <= needed;
};

const createDelivery = (
  data: MissionData,
  det: Detection,
  payloadType: Delivery['payloadType'],
  automatic: boolean,
  status: Delivery['status']
): Delivery => {
  const quantity = payloadType === 'kamizelki' ? Math.max(MIN_VESTS_PER_DROP, det.persons) : det.persons;
  const weightKg = payloadType === 'kamizelki' ? quantity * LIFE_VEST_KG : payloadType === 'apteczka' ? 1.5 : Math.min(8, 2.5 * det.persons);
  const delivery: Delivery = {
    id: newId('dlv'),
    detectionId: det.id,
    lat: det.lat,
    lng: det.lng,
    payloadType,
    quantity,
    weightKg: round(weightKg, 1),
    status,
    automatic,
    createdAt: new Date().toISOString(),
  };
  data.deliveries.push(delivery);
  return delivery;
};

export const PAYLOAD_LABELS: Record<Delivery['payloadType'], string> = {
  kamizelki: 'kamizelki ratunkowe',
  apteczka: 'pakiet medyczny',
  woda_jedzenie: 'woda i żywność',
};

/**
 * Obiekty, na których przebywają osoby: wysokość nad lustrem wody, głębokość wody wokół
 * i krytyczna intensywność przepływu D·V [m²/s], przy której obiekt zostaje porwany lub zniszczony.
 */
const VICTIM_OBJECTS: Record<Detection['position'], { label: string; dv: number; free: [number, number]; depth: [number, number] }[]> = {
  w_wodzie: [{ label: 'otwarta woda', dv: 0.5, free: [0, 0], depth: [0.6, 1.8] }],
  na_dachu: [
    { label: 'dach budynku mieszkalnego', dv: 3, free: [0.8, 3.2], depth: [1.0, 2.6] },
    { label: 'dach garażu', dv: 1.6, free: [0.3, 1.3], depth: [0.8, 1.8] },
  ],
  na_podwyzszeniu: [
    { label: 'dach samochodu', dv: 0.6, free: [0.1, 0.6], depth: [0.4, 1.1] },
    { label: 'altana ogrodowa', dv: 1.0, free: [0.2, 1.0], depth: [0.4, 1.3] },
    { label: 'konar drzewa', dv: 1.5, free: [0.4, 1.6], depth: [0.6, 1.6] },
    { label: 'mur ogrodzenia', dv: 2.0, free: [0.1, 0.6], depth: [0.5, 1.4] },
  ],
};

const randomVictimAttrs = () => {
  const roll = Math.random();
  const position: Detection['position'] = roll < 0.35 ? 'w_wodzie' : roll < 0.7 ? 'na_podwyzszeniu' : 'na_dachu';
  const options = VICTIM_OBJECTS[position];
  const obj = options[Math.floor(Math.random() * options.length)];
  const collapseRisk = position === 'na_dachu' && Math.random() < 0.25;
  return {
    waterDepthM: round(rand(obj.depth[0], obj.depth[1]), 2),
    currentSpeedMs: round(rand(0.1, 2.4), 2),
    personHeightM: round(Math.random() < 0.2 ? rand(1.0, 1.4) : rand(1.55, 1.9), 2),
    position,
    collapseRisk,
    surfaceAboveWaterM: round(rand(obj.free[0], obj.free[1]), 2),
    objectLabel: obj.label,
    dvThreshold: round(collapseRisk ? obj.dv * 0.4 : obj.dv, 2),
    riseFactor: round(rand(0.7, 1.4), 2),
    needsMedical: Math.random() < (position === 'w_wodzie' ? 0.45 : 0.3),
    needsFood: Math.random() < 0.55,
  };
};

/** Prognoza przyboru wody: bazowy trend fali + wpływ bieżącego opadu; kulminacja zbliża się z czasem operacji */
const forecastNow = (data: MissionData) => {
  if (!data.floodForecast) {
    data.floodForecast = {
      baseRiseCmH: round(rand(4, 12), 1),
      riseCmH: 0,
      peakInH: round(rand(3, 8), 1),
      issuedAtSim: data.simSeconds,
      source: 'prognoza hydrologiczna (symulacja) + opad Open-Meteo',
    };
  }
  const f = data.floodForecast;
  f.riseCmH = round(f.baseRiseCmH + (currentWeather(data)?.precipitation ?? 0) * 1.2, 1);
  return { riseCmH: f.riseCmH, peakInH: round(Math.max(0.5, f.peakInH - (data.simSeconds - f.issuedAtSim) / 3600), 1) };
};

/**
 * Prawda terenowa symulacji: osoby rozmieszczone zgodnie z mapą prawdopodobieństwa (ludzie częściej
 * przebywają tam, gdzie wskazuje mapa, ale nie wyłącznie) oraz fałszywe źródła ciepła.
 */
export const generateHiddenTargets = (data: MissionData): HiddenTarget[] => {
  const grid = data.priorityGrid ?? computePriorityGrid(data.area, data.priorityZones ?? [], data.mapFeatures ?? null);
  if (!grid) return [];
  const cells = gridCells(grid);
  if (cells.length === 0) return [];
  const areaKm2 = (cells.length * grid.cellM * grid.cellM) / 1e6;
  const pick = (exp: number) => {
    const ws = cells.map((c) => c.w ** exp);
    const total = ws.reduce((a, b) => a + b, 0);
    let x = Math.random() * total;
    for (let i = 0; i < cells.length; i++) {
      x -= ws[i];
      if (x <= 0) return cells[i];
    }
    return cells[cells.length - 1];
  };
  const jitter = (c: { lat: number; lng: number }) => {
    const dLat = grid.cellM / 110540;
    const dLng = grid.cellM / (111320 * Math.cos((c.lat * Math.PI) / 180));
    return { lat: round(c.lat + (Math.random() - 0.5) * dLat, 6), lng: round(c.lng + (Math.random() - 0.5) * dLng, 6) };
  };
  const victims = Math.max(3, Math.min(30, Math.round(2 + 2.2 * areaKm2)));
  const decoys = Math.round(victims * 0.8);
  const out: HiddenTarget[] = [];
  for (let i = 0; i < victims + decoys; i++) {
    const isVictim = i < victims;
    const pos = jitter(pick(isVictim ? 1.5 : 0.5));
    out.push({
      id: newId(isVictim ? 'os' : 'zc'),
      kind: isVictim ? 'osoba' : 'zrodlo_ciepla',
      ...pos,
      persons: isVictim ? (Math.random() < 0.6 ? 1 : Math.floor(rand(2, 5))) : 0,
      ...randomVictimAttrs(),
      sensed: [],
      signalled: false,
      resolved: false,
    });
  }
  return out;
};

const pointSegmentM = (p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111320;
  const ax = (a.lng - p.lng) * k;
  const ay = (a.lat - p.lat) * 110540;
  const bx = (b.lng - p.lng) * k;
  const by = (b.lat - p.lat) * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
};

const podFor = (d: DroneRuntime, pass: 1 | 2, isDay: boolean, t: HiddenTarget) => {
  const base = POD[pass][d.hasThermal ? 'thermal' : 'rgb'][isDay ? 'day' : 'night'];
  const mod = t.position === 'w_wodzie' ? -0.1 : t.position === 'na_dachu' ? 0.05 : 0;
  return Math.max(0.02, Math.min(0.99, base + mod));
};

/**
 * Sprawdza, czy podczas ruchu nad odcinkiem kamera objęła któryś z ukrytych celów.
 * Każdy przelot (dron + numer przelotu) ma jedną szansę na wykrycie danego celu.
 * Zwraca kandydata do weryfikacji (przeszukanie dokładne) albo null.
 */
const senseAlong = (
  data: MissionData,
  d: DroneRuntime,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  wp: Waypoint
): DroneRuntime['candidate'] => {
  if (wp.fast || !data.hidden?.length) return null;
  const pass: 1 | 2 = wp.pass ?? 2;
  const halfSwath = wp.altAgl * Math.tan(((d.spec.cameraFovDeg / 2) * Math.PI) / 180);
  const isDay = currentWeather(data)?.isDay ?? true;
  const key = `${d.droneId}:${pass}`;
  const source: 'termowizja' | 'rgb' = d.hasThermal ? 'termowizja' : 'rgb';
  for (const t of data.hidden) {
    if (t.resolved || t.sensed.includes(key)) continue;
    if (pass === 1 && t.signalled) continue;
    if (pointSegmentM(t, from, to) > halfSwath) continue;
    t.sensed.push(key);
    if (Math.random() > podFor(d, pass, isDay, t)) continue;
    let signalId: string | undefined;
    if (pass === 1) {
      // Rozpoznanie: sygnał cieplny z dużej wysokości – dron od razu obniża pułap i go weryfikuje
      t.signalled = true;
      const sig: SearchSignal = {
        id: newId('sig'),
        targetId: t.id,
        droneId: d.droneId,
        droneName: d.name,
        lat: round(t.lat + rand(-0.00015, 0.00015), 6),
        lng: round(t.lng + rand(-0.00022, 0.00022), 6),
        detectedAtSim: data.simSeconds,
        status: 'sprawdzany',
      };
      data.signals.push(sig);
      signalId = sig.id;
      if (!d.linkLost) {
        addEvent(data, 'info', 'detekcja', `${d.name}: sygnał cieplny z rozpoznania (${Math.round(wp.altAgl)} m) – obniżenie pułapu i weryfikacja.`, d.droneId);
      }
    }
    return { lat: t.lat + rand(-0.0001, 0.0001), lng: t.lng + rand(-0.00015, 0.00015), falseAlarm: t.kind !== 'osoba', source, targetId: t.id, signalId };
  }
  return null;
};

/** Czy dron powinien teraz sprawdzać sygnały (po zakończeniu rozpoznania lub gdy trasa się skończyła) */
const shouldCheckSignals = (data: MissionData, d: DroneRuntime) => {
  if (d.signalQueue.length === 0 || d.linkLost) return false;
  const next = nextScanWaypoint(data, d);
  return !next || (next.pass ?? 2) === 2;
};

const startSignalCheck = (data: MissionData, d: DroneRuntime) => {
  const sigs = d.signalQueue.map((id) => data.signals.find((x) => x.id === id)).filter((x): x is SearchSignal => !!x);
  if (sigs.length === 0) {
    d.signalQueue = [];
    return false;
  }
  sigs.sort((a, b) => haversineKm(d, a) - haversineKm(d, b));
  const sig = sigs[0];
  sig.status = 'sprawdzany';
  d.phase = 'sprawdzanie_sygnalu';
  d.target = { lat: sig.lat, lng: sig.lng };
  d.candidate = null;
  d.detectionId = sig.id;
  return true;
};

/**
 * Detekcja z pełną analizą sytuacji. Dron nie zna wzrostu osoby – przyjmuje wzorzec 1,70 m
 * i z proporcji pikseli (osoba ↔ odległość stóp od lustra wody) szacuje zapas do zalania obiektu.
 */
const buildDetection = (
  data: MissionData,
  d: DroneRuntime,
  c: NonNullable<DroneRuntime['candidate']>,
  offline: boolean,
  target?: HiddenTarget | null
): Detection => {
  const attrs: Omit<HiddenTarget, 'id' | 'kind' | 'lat' | 'lng' | 'persons' | 'sensed' | 'signalled' | 'resolved'> = target ?? randomVictimAttrs();
  const input = {
    waterDepthM: attrs.waterDepthM,
    currentSpeedMs: attrs.currentSpeedMs,
    personHeightM: attrs.personHeightM,
    position: attrs.position,
    collapseRisk: attrs.collapseRisk,
  };
  const inWater = input.position === 'w_wodzie';
  const surface = attrs.surfaceAboveWaterM ?? (inWater ? 0 : round(rand(0.3, 1.5), 2));
  const objectLabel = attrs.objectLabel ?? (inWater ? 'otwarta woda' : input.position === 'na_dachu' ? 'dach budynku' : 'podwyższenie terenu');
  const fc = forecastNow(data);
  const riseCmH = round(fc.riseCmH * (attrs.riseFactor ?? 1), 1);
  // Skala obrazu po zbliżeniu na 25 m z zoomem; pomiar krawędzi obarczony błędem kilku pikseli
  const pxPerM = round(rand(55, 75), 1);
  const personPx = Math.round(input.personHeightM * pxPerM);
  const freeboardPx = inWater ? null : Math.max(1, Math.round(surface * pxPerM + rand(-3, 3)));
  const freeboardM = freeboardPx === null ? null : round((freeboardPx / personPx) * REFERENCE_HEIGHT_M, 2);
  const initial = criticalityLevel(input);
  const result = assessVictim({ ...input, freeboardM, dvThreshold: attrs.dvThreshold ?? (input.position === 'na_dachu' ? 3 : 1), riseCmH, peakInH: fc.peakInH });
  const assessment: VictimAssessment = {
    referenceHeightM: REFERENCE_HEIGHT_M,
    pxPerM,
    personPx,
    freeboardPx,
    freeboardM,
    objectLabel,
    riseCmH,
    peakInH: fc.peakInH,
    ...result,
    pkInitial: inWater ? Math.max(0.85, initial.pk) : initial.pk,
    criticalityInitial: inWater ? 'krytyczny' : initial.criticality,
  };
  const { pk, criticality } = result;
  return {
    id: newId('det'),
    droneId: d.droneId,
    droneName: d.name,
    sectorId: d.sectorId,
    lat: round(c.lat, 6),
    lng: round(c.lng, 6),
    detectedAt: new Date().toISOString(),
    source: c.source,
    confidence: round(rand(0.72, 0.97), 2),
    persons: target?.persons || (Math.random() < 0.6 ? 1 : Math.floor(rand(2, 5))),
    animals: Math.random() < 0.25 ? 1 : 0,
    ...input,
    pk,
    criticality,
    status: 'wstepny',
    offline,
    gesture: null,
    interviewStatus: 'nie_dotyczy',
    rescueStatus: 'oczekuje',
    history: [],
    assessment,
    medicalNeed: null,
    foodNeed: null,
    photo: null,
  };
};

/** Ponowna ocena po zmianie poziomu wody lub odpowiedzi osoby na pytanie z głośnika */
const reassess = (data: MissionData, det: Detection) => {
  const a = det.assessment;
  if (!a) {
    const r = criticalityLevel(det);
    det.pk = r.pk;
    det.criticality = r.criticality;
    if (det.medicalNeed) {
      det.pk = 1;
      det.criticality = 'krytyczny';
    }
    return;
  }
  const { peakInH } = forecastNow(data);
  const r = assessVictim({ ...det, freeboardM: a.freeboardM, dvThreshold: a.dvThreshold, riseCmH: a.riseCmH, peakInH, medical: !!det.medicalNeed });
  Object.assign(a, r, { peakInH });
  det.pk = r.pk;
  det.criticality = r.criticality;
};

// ----- Procedura przy odnalezionej osobie (krok 7.1.2) – każdy etap widoczny w transmisji z kamery -----

/** Liczba ticków (1 tick = 1 s transmisji) na etap – tak, by koordynator zdążył przeczytać wynik */
const PROC_TICKS: Record<ProcedureStage, number> = {
  pozycja: 2,
  pomiar: 3,
  prognoza: 3,
  kategoria: 2,
  raport: 2,
  wywiad_lekarz: 3,
  wywiad_jedzenie: 3,
  decyzja: 2,
};

export const STAGE_ACTIVITY: Record<ProcedureStage, string> = {
  pozycja: 'Klasyfikacja pozycji osoby',
  pomiar: 'Pomiar wysokości obiektu nad wodą',
  prognoza: 'Porównanie z prognozą wody i ocena nurtu',
  kategoria: 'Przeliczenie kategorii ewakuacji',
  raport: 'Wysyłanie zdjęcia i pinezki GPS do sztabu',
  wywiad_lekarz: 'Głośnik: pytanie o pomoc medyczną',
  wywiad_jedzenie: 'Głośnik: pytanie o wodę i żywność',
  decyzja: 'Decyzja o dostawach i ewakuacji',
};

const POSITION_TEXT: Record<Detection['position'], string> = { w_wodzie: 'w wodzie', na_dachu: 'na dachu', na_podwyzszeniu: 'na podwyższeniu' };

const procDetection = (data: MissionData, d: DroneRuntime): Detection | null => {
  const p = d.procedure;
  if (!p) return null;
  return p.det ?? data.detections.find((x) => x.id === p.detectionId) ?? null;
};

const enterStage = (data: MissionData, d: DroneRuntime, stage: ProcedureStage) => {
  const p = d.procedure!;
  p.stage = stage;
  p.ticks = PROC_TICKS[stage];
  d.phase = stage.startsWith('wywiad') ? 'wywiad' : 'analiza';
  if (stage === 'wywiad_lekarz') {
    logFeed(data, d.droneId, 'info', 'GŁOŚNIK: „Tu dron ratowniczy. Pomoc jest w drodze. Jeśli potrzebujesz pomocy medycznej – podnieś OBIE RĘCE.”');
  } else if (stage === 'wywiad_jedzenie') {
    logFeed(data, d.droneId, 'info', 'GŁOŚNIK: „Jeśli potrzebujesz wody lub jedzenia – podnieś JEDNĄ RĘKĘ.”');
  }
};

const startProcedure = (data: MissionData, d: DroneRuntime, det: Detection, target?: HiddenTarget | null) => {
  const inWater = det.position === 'w_wodzie';
  const stages: ProcedureStage[] = [
    'pozycja',
    ...(inWater ? [] : (['pomiar'] as ProcedureStage[])),
    'prognoza',
    'kategoria',
    'raport',
    ...(d.hasSpeaker ? (['wywiad_lekarz'] as ProcedureStage[]) : []),
    'decyzja',
  ];
  d.procedure = {
    stage: 'pozycja',
    ticks: 0,
    stages,
    det,
    detectionId: det.id,
    startedSim: data.simSeconds,
    needs: {
      medical: target?.needsMedical ?? Math.random() < (inWater ? 0.45 : 0.3),
      food: target?.needsFood ?? Math.random() < 0.55,
    },
  };
  d.detectionId = det.id;
  d.speed = 0;
  d.altAgl = 25;
  const src = det.source === 'termowizja' ? 'FLIR' : 'RGB/OpenCV';
  logFeed(data, d.droneId, 'ostrzezenie', `Cel potwierdzony: ${det.persons} os. [${src}, pewność ${Math.round(det.confidence * 100)}%] – zawis 25 m, analiza sytuacji.`);
  enterStage(data, d, 'pozycja');
};

/** Wysyła zdjęcie i pinezkę do sztabu – od tej chwili osoba jest widoczna na mapie i u Weryfikatora AI */
const reportDetection = (data: MissionData, d: DroneRuntime, det: Detection) => {
  det.photo ??= { capturedAtSim: data.simSeconds, altAgl: Math.round(d.altAgl), heading: d.heading, droneName: d.name };
  data.detections.push(det);
  const a = det.assessment;
  det.history.push(
    a
      ? `Analiza drona: ${POSITION_TEXT[det.position]} (${a.objectLabel})${a.freeboardM !== null ? `, zapas do zalania ~${Math.round(a.freeboardM * 100)} cm` : ''}, ryzyko porwania ${a.sweepRiskPct}% – ${a.criticality} (PK ${a.pk}).`
      : `Detekcja: ${POSITION_TEXT[det.position]} – ${det.criticality} (PK ${det.pk}).`
  );
  addEvent(
    data,
    det.criticality === 'krytyczny' ? 'krytyczny' : 'ostrzezenie',
    'detekcja',
    `${d.name}: zdjęcie i pinezka GPS przesłane do sztabu – ${det.persons} os. ${POSITION_TEXT[det.position]} (${det.lat.toFixed(5)}, ${det.lng.toFixed(5)}), PK ${det.pk} (${det.criticality}).`,
    d.droneId
  );
};

/** Końcowa decyzja drona: pakiet medyczny, kamizelki (sytuacja niebezpieczna), żywność. Zwraca true, gdy wysłano drona automatycznie. */
const decideDeliveries = (data: MissionData, d: DroneRuntime, det: Detection) => {
  const a = det.assessment;
  const has = (type: Delivery['payloadType']) => data.deliveries.some((x) => x.detectionId === det.id && x.payloadType === type && x.status !== 'odrzucona');
  let auto = false;
  if (det.medicalNeed !== null && det.medicalNeed !== undefined) det.interviewStatus = 'zakonczony';
  if (det.medicalNeed && !has('apteczka')) {
    createDelivery(data, det, 'apteczka', true, 'oczekuje_drona');
    det.history.push('Potrzebna pomoc medyczna – automatycznie wysłano pakiet medyczny, priorytet ewakuacji P1.');
    addEvent(data, 'krytyczny', 'dostawa', `${d.name}: pomoc medyczna – dron transportowy z pakietem medycznym wysłany automatycznie, zespół ratowniczy z priorytetem P1.`, d.droneId);
    auto = true;
  }
  const dangerous = a ? a.dangerous : det.criticality === 'krytyczny';
  if (dangerous && !has('kamizelki')) {
    const dlv = createDelivery(data, det, 'kamizelki', true, 'oczekuje_drona');
    det.history.push('Sytuacja niebezpieczna – automatyczne dysponowanie drona transportowego z kamizelkami.');
    addEvent(
      data,
      'krytyczny',
      'dostawa',
      `${d.name}: sytuacja niebezpieczna${a?.reasons.length ? ` (${a.reasons.join(', ')})` : ''} – dron transportowy wiezie ${dlv.quantity} kamizelek ratunkowych.`,
      d.droneId
    );
    auto = true;
  }
  if (det.foodNeed && !has('woda_jedzenie')) {
    createDelivery(data, det, 'woda_jedzenie', false, 'oczekuje_autoryzacji');
    det.history.push('Rozpoznano gest: jedna ręka – woda i jedzenie.');
    addEvent(data, 'ostrzezenie', 'dostawa', `${d.name}: osoba podniosła jedną rękę – żądanie wody i żywności (dron transportowy) czeka na autoryzację Weryfikatora AI.`, d.droneId);
  }
  if (!d.hasSpeaker && det.criticality === 'umiarkowany') {
    det.history.push('Dron bez głośnika – decyzję o dostawie podejmuje Weryfikator AI.');
    logFeed(data, d.droneId, 'info', 'Brak głośnika – wywiad niemożliwy, decyzję o dostawie podejmie Weryfikator AI.');
  }
  if (!auto && !det.foodNeed) logFeed(data, d.droneId, 'sukces', 'Brak bezpośredniego zagrożenia – osoba czeka na zespół ratowniczy, wznowienie poszukiwań.');
  return auto;
};

const completeStage = (data: MissionData, d: DroneRuntime, stage: ProcedureStage) => {
  const det = procDetection(data, d);
  const p = d.procedure!;
  if (!det) return;
  const a = det.assessment;
  const inWater = det.position === 'w_wodzie';
  switch (stage) {
    case 'pozycja':
      if (inWater) {
        const visible = Math.round(Math.max(15, Math.min(100, (1 - det.waterDepthM / Math.max(0.5, det.personHeightM)) * 100)));
        logFeed(data, d.droneId, 'krytyczny', `Pozycja: OSOBA W WODZIE (widoczne ~${visible}% sylwetki) → kategoria KRYTYCZNA.`);
      } else {
        logFeed(data, d.droneId, 'info', `Pozycja: ${POSITION_TEXT[det.position]} – ${a?.objectLabel ?? 'obiekt'}; ocena wstępna: ${a?.criticalityInitial ?? det.criticality} (PK ${a?.pkInitial ?? det.pk}).`);
      }
      break;
    case 'pomiar':
      if (a && a.freeboardPx !== null && a.freeboardM !== null) {
        logFeed(
          data,
          d.droneId,
          'info',
          `Skala: wzrost wzorcowy ${a.referenceHeightM.toFixed(2)} m = ${a.personPx} px; stopy → lustro wody ${a.freeboardPx} px ≈ ${Math.round(a.freeboardM * 100)} cm do zalania obiektu.`
        );
      }
      break;
    case 'prognoza':
      if (a) {
        const floodText =
          a.minutesToFlood !== null
            ? `woda dojdzie do stóp za ~${a.minutesToFlood} min`
            : inWater
              ? 'poziom wody wokół osoby rośnie'
              : `zapas ${Math.round((a.freeboardM ?? 0) * 100 - a.forecastRiseCm)} cm po kulminacji`;
        logFeed(data, d.droneId, a.minutesToFlood !== null && a.minutesToFlood <= 180 ? 'krytyczny' : 'info', `Prognoza: +${a.riseCmH} cm/h, kulminacja za ${a.peakInH} h (+${a.forecastRiseCm} cm) → ${floodText}.`);
        logFeed(
          data,
          d.droneId,
          a.sweepRiskPct >= 50 ? 'krytyczny' : 'info',
          `Nurt ${det.currentSpeedMs} m/s, D·V ${a.dvPeak} m²/s (próg ${a.dvThreshold}) → ryzyko porwania ${inWater ? 'osoby' : 'obiektu'} ${a.sweepRiskPct}%.`
        );
      }
      break;
    case 'kategoria':
      logFeed(
        data,
        d.droneId,
        det.criticality === 'krytyczny' ? 'krytyczny' : det.criticality === 'umiarkowany' ? 'ostrzezenie' : 'sukces',
        a ? `Kategoria ewakuacji: ${a.criticalityInitial} → ${det.criticality.toUpperCase()} (PK ${a.pkInitial} → ${det.pk}).` : `Kategoria ewakuacji: ${det.criticality.toUpperCase()} (PK ${det.pk}).`
      );
      break;
    case 'raport':
      reportDetection(data, d, det);
      p.det = null;
      break;
    case 'wywiad_lekarz': {
      det.interviewStatus = 'w_toku';
      det.medicalNeed = p.needs?.medical ?? Math.random() < (inWater ? 0.45 : 0.3);
      if (det.medicalNeed) {
        det.gesture = 'lekarz';
        reassess(data, det);
        det.history.push('Rozpoznano gest: obie ręce – potrzebna pomoc medyczna. Kategoria maksymalna.');
        addEvent(data, 'krytyczny', 'detekcja', `${d.name}: osoba podniosła OBIE RĘCE – potrzebna pomoc medyczna. Kategoria MAKSYMALNA (PK 1).`, d.droneId);
      } else {
        logFeed(data, d.droneId, 'info', 'Brak gestu obu rąk – pomoc medyczna nie jest potrzebna.');
        p.stages.splice(p.stages.indexOf('wywiad_lekarz') + 1, 0, 'wywiad_jedzenie');
      }
      break;
    }
    case 'wywiad_jedzenie':
      det.foodNeed = p.needs?.food ?? Math.random() < 0.55;
      det.gesture = det.foodNeed ? 'woda_jedzenie' : 'brak';
      logFeed(data, d.droneId, 'info', det.foodNeed ? 'Rozpoznano gest: JEDNA RĘKA – potrzebna woda i żywność.' : 'Brak gestu – żywność nie jest potrzebna.');
      break;
    case 'decyzja':
      break;
  }
};

const finishProcedure = (data: MissionData, d: DroneRuntime) => {
  const det = procDetection(data, d);
  d.procedure = null;
  const auto = det ? decideDeliveries(data, d, det) : false;
  if (auto && det) {
    d.phase = 'monitorowanie';
    d.taskTicks = 10;
    d.detectionId = det.id;
    d.altAgl = 40;
  } else {
    d.phase = 'skanowanie';
    d.detectionId = null;
    d.altAgl = sectorOf(data, d)?.altitudeAgl ?? 60;
  }
};

/** Przerwanie procedury (powrót, awaryjne lądowanie) – wyniki nie mogą przepaść */
const abortProcedure = (data: MissionData, d: DroneRuntime) => {
  const p = d.procedure;
  if (!p) return;
  const det = procDetection(data, d);
  d.procedure = null;
  if (!det) return;
  if (p.det) reportDetection(data, d, det);
  logFeed(data, d.droneId, 'ostrzezenie', 'Procedura przerwana – wyniki przekazane do sztabu.');
  decideDeliveries(data, d, det);
};

const tickProcedure = (data: MissionData, d: DroneRuntime) => {
  const p = d.procedure;
  if (!p) {
    d.phase = 'skanowanie';
    return;
  }
  d.speed = 0;
  if (--p.ticks > 0) return;
  completeStage(data, d, p.stage);
  if (!d.procedure) return;
  const next = p.stages[p.stages.indexOf(p.stage) + 1];
  if (next) enterStage(data, d, next);
  else finishProcedure(data, d);
};

const RETURN_REASONS: Record<string, string> = {
  bateria: 'rezerwa baterii',
  pogoda: 'pogoda poza limitami',
  sektor_ukonczony: 'sektor ukończony',
  dostawa_zakonczona: 'zrzut wykonany',
  smart_rth: 'Smart RTH – brak łączności',
  rozkaz_koordynatora: 'rozkaz koordynatora',
  brak_zadan: 'brak zadań',
  sektor_przejety: 'sektor przejęty',
};

/** Podpis bieżącej czynności drona w transmisji z kamery */
const describeActivity = (data: MissionData, d: DroneRuntime) => {
  const p = d.procedure;
  if (p) {
    d.activity = STAGE_ACTIVITY[p.stage];
    d.activityDetail = `Procedura przy osobie • krok ${p.stages.indexOf(p.stage) + 1}/${p.stages.length}`;
    return;
  }
  const sector = sectorOf(data, d);
  const set = (activity: string, detail?: string) => {
    d.activity = activity;
    d.activityDetail = detail;
  };
  const distM = (t: { lat: number; lng: number } | null | undefined) => (t ? `${Math.round(haversineKm(d, t) * 1000)} m do celu` : undefined);
  switch (d.phase) {
    case 'baza':
      return set('Dron w Strefie Zero');
    case 'kalibracja':
      return set('Kalibracja IMU, kompasu i gimbala');
    case 'gotowy':
      return set('Gotowy do startu');
    case 'przelot':
      return set(`Przelot do sektora ${sector ? sector.index + 1 : ''}`, distM(d.target));
    case 'skanowanie': {
      const wp = nextScanWaypoint(data, d);
      const total = (sector?.waypoints.length ?? 0) + d.extraWaypoints.length;
      const label = !wp ? 'Skanowanie terenu' : wp.fast ? 'Przejście do kolejnej linii skanowania' : (wp.pass ?? 2) === 1 ? 'Szybkie rozpoznanie termowizyjne' : 'Przeszukanie dokładne – analiza obrazu';
      return set(label, `${Math.round(d.altAgl)} m AGL • punkt ${Math.min(d.scanIndex + 1, Math.max(1, total))}/${Math.max(1, total)}`);
    }
    case 'sprawdzanie_sygnalu':
      return set('Lot do sygnału cieplnego z rozpoznania', distM(d.target));
    case 'weryfikacja_celu':
      return set('Zbliżanie do potencjalnego celu', 'obniżanie pułapu do 25 m • analiza AI');
    case 'monitorowanie': {
      const dl = data.deliveries.filter((x) => x.detectionId === d.detectionId && x.automatic);
      const flying = dl.find((x) => x.status === 'w_locie');
      return set(
        'Monitorowanie osoby – oczekiwanie na drona transportowego',
        flying ? `${flying.droneName} w drodze • ${PAYLOAD_LABELS[flying.payloadType]}` : dl.length ? 'ładunek czeka na wolnego drona' : undefined
      );
    }
    case 'dostawa': {
      const dlv = data.deliveries.find((x) => x.id === d.deliveryId);
      return set(dlv ? `Lot ze zrzutem: ${dlv.quantity} × ${PAYLOAD_LABELS[dlv.payloadType]}` : 'Lot ze zrzutem', distM(d.target));
    }
    case 'powrot':
      return set('Powrót do Strefy Zero (RTH)', d.returnReason ? RETURN_REASONS[d.returnReason] ?? d.returnReason : undefined);
    case 'wymiana_baterii':
      return set('Oczekiwanie na wymianę akumulatora');
    case 'uziemiony':
      return set('Dron uziemiony', d.groundedByWeather ? 'pogoda poza limitami' : undefined);
    case 'czuwanie':
      return set('Tryb czuwania');
    default:
      return set(d.phase);
  }
};

const reassignSector = (data: MissionData, lost: DroneRuntime) => {
  const sector = sectorOf(data, lost);
  const remaining: Waypoint[] = [...(sector ? sector.waypoints.slice(lost.scanIndex) : []), ...lost.extraWaypoints];
  lost.sectorReassigned = true;
  lost.extraWaypoints = [];
  const heir = data.drones.find((x) => x.category === 'zwiadowczy' && x.droneId !== lost.droneId && !x.linkLost && x.calibrated && x.phase !== 'uziemiony');
  if (heir && lost.signalQueue.length) {
    heir.signalQueue.push(...lost.signalQueue);
    lost.signalQueue = [];
    heir.sectorDone = false;
    if (heir.phase === 'czuwanie') heir.phase = 'gotowy';
  }
  if (remaining.length === 0) return;
  const lostIndex = sector?.index ?? 0;
  const candidates = data.drones
    .filter((x) => x.category === 'zwiadowczy' && x.droneId !== lost.droneId && !x.linkLost && x.phase !== 'uziemiony' && x.calibrated)
    .sort((a, b) => {
      const ia = sectorOf(data, a)?.index ?? 99;
      const ib = sectorOf(data, b)?.index ?? 99;
      return Math.abs(ia - lostIndex) - Math.abs(ib - lostIndex);
    })
    .slice(0, 2);
  if (candidates.length === 0) {
    addEvent(data, 'ostrzezenie', 'lacznosc', `Brak sąsiednich jednostek do przejęcia sektora ${sector?.index !== undefined ? sector.index + 1 : ''} – teren oczekuje na ponowny wylot.`);
    return;
  }
  if (lost.signalQueue.length) {
    candidates[0].signalQueue.push(...lost.signalQueue);
    lost.signalQueue = [];
  }
  const half = Math.ceil(remaining.length / candidates.length);
  candidates.forEach((c, i) => {
    const part = remaining.slice(i * half, (i + 1) * half);
    c.extraWaypoints.push(...part);
    // Dron przejmujący punkty wraca do pracy – także gdy sam wcześniej oddał swój sektor
    c.sectorDone = false;
    if (c.phase === 'czuwanie') c.phase = 'gotowy';
  });
  addEvent(
    data,
    'ostrzezenie',
    'lacznosc',
    `C2 przeliczył trasy – sektor ${lost.name} (${remaining.length} pkt) przejmują: ${candidates.map((c) => c.name).join(', ')}.`,
    lost.droneId
  );
};

/** 7.3 – reakcja na zmianę pogody i aktualizacja mapy zagrożeń */
export const applyWeather = (data: MissionData, w: WeatherSnapshot) => {
  data.weatherHistory.push(w);
  if (data.weatherHistory.length > 60) data.weatherHistory.shift();
  const affected: string[] = [];

  for (const d of data.drones) {
    const evalB = weatherCoefficient(d.spec, w);
    d.effectiveMinutes = round(effectiveFlightMinutes(d.spec, w), 1);
    if (!evalB.canFly) {
      if (!d.groundedByWeather) affected.push(`${d.name} (${evalB.reasons[0]})`);
      d.groundedByWeather = true;
      if (isAirborne(d)) orderReturn(data, d, 'pogoda');
      else if (d.phase === 'gotowy') d.phase = 'uziemiony';
    } else if (d.groundedByWeather) {
      d.groundedByWeather = false;
      if (d.phase === 'uziemiony') {
        d.phase = 'gotowy';
        addEvent(data, 'sukces', 'pogoda', `${d.name}: warunki ponownie w granicach – dron gotowy do lotu.`, d.droneId);
      }
    }
  }

  if (affected.length > 0) {
    addEvent(data, 'krytyczny', 'pogoda', `Nagła zmiana pogody – automatyczny powrót/uziemienie: ${affected.join('; ')}.`);
    const pending = data.recommendations.some((r) => r.type === 'uziemienie_floty' && r.status === 'oczekuje');
    const groundedCount = data.drones.filter((d) => d.groundedByWeather).length;
    if (!pending && groundedCount >= Math.ceil(data.drones.length / 2)) {
      data.recommendations.push({
        id: newId('rec'),
        type: 'uziemienie_floty',
        title: 'Rekomendacja: uziemienie całej floty',
        details: `Warunki przekraczają limity ${groundedCount} z ${data.drones.length} dronów (porywy ${w.windGust.toFixed(1)} m/s, opad ${w.precipitation.toFixed(1)} mm/h, ${w.temperature.toFixed(1)}°C). Wymagana decyzja dowódcy.`,
        status: 'oczekuje',
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Rosnąca fala: intensywny opad podnosi poziom wody przy odnalezionych osobach
  if (w.precipitation > 2) {
    for (const det of data.detections) {
      if (det.status === 'odrzucony' || det.rescueStatus === 'ewakuowano') continue;
      const before = det.criticality;
      const rise = Math.min(0.3, w.precipitation * 0.02);
      det.waterDepthM = round(det.waterDepthM + rise, 2);
      if (det.assessment && det.assessment.freeboardM !== null) det.assessment.freeboardM = round(Math.max(0, det.assessment.freeboardM - rise), 2);
      reassess(data, det);
      const { pk, criticality } = det;
      if (before !== 'krytyczny' && criticality === 'krytyczny') {
        det.history.push(`Wzrost poziomu wody do ${det.waterDepthM} m – eskalacja do zagrożenia krytycznego.`);
        addEvent(data, 'krytyczny', 'detekcja', `Aktualizacja mapy zagrożeń: punkt ${det.lat.toFixed(4)}, ${det.lng.toFixed(4)} – rosnąca fala, PK ${pk} (krytyczny).`);
        const hasVests = data.deliveries.some((x) => x.detectionId === det.id && x.payloadType === 'kamizelki' && x.status !== 'odrzucona');
        if (!hasVests) createDelivery(data, det, 'kamizelki', true, 'oczekuje_drona');
      }
    }
  }
};

const dispatchDeliveries = (data: MissionData) => {
  const w = currentWeather(data);
  for (const dlv of data.deliveries.filter((x) => x.status === 'oczekuje_drona')) {
    const drone = data.drones
      .filter(
        (d) =>
          d.category === 'dostawczy' &&
          d.phase === 'gotowy' &&
          !d.groundedByWeather &&
          d.battery >= 45 &&
          (w ? effectivePayloadKg(d.spec, w) : d.maxPayloadKg) >= dlv.weightKg
      )
      .sort((a, b) => haversineKm(a, dlv) - haversineKm(b, dlv))[0];
    if (!drone) continue;
    dlv.status = 'w_locie';
    dlv.droneId = drone.droneId;
    dlv.droneName = drone.name;
    drone.deliveryId = dlv.id;
    drone.phase = 'dostawa';
    drone.target = { lat: dlv.lat, lng: dlv.lng };
    drone.altAgl = 50;
    drone.sorties++;
    addEvent(data, 'info', 'dostawa', `${drone.name} startuje ze zrzutem: ${dlv.quantity} × ${PAYLOAD_LABELS[dlv.payloadType]} (${dlv.weightKg} kg).`, drone.droneId);
  }
};

const landDrone = (data: MissionData, mission: Mission, d: DroneRuntime) => {
  d.phase = 'baza';
  d.altAgl = 0;
  d.speed = 0;
  d.target = null;
  if (d.linkLost) {
    d.linkLost = false;
    addEvent(data, 'sukces', 'lacznosc', `${d.name}: wylądował w Strefie Zero – łączność przywrócona.`, d.droneId);
  }
  if (d.offlineBuffer.length > 0) {
    addEvent(data, 'ostrzezenie', 'detekcja', `${d.name}: przekazano ${d.offlineBuffer.length} detekcji zapisanych w trybie offline (Smart RTH).`, d.droneId);
    for (const det of d.offlineBuffer) {
      det.photo ??= { capturedAtSim: data.simSeconds, altAgl: 25, heading: d.heading, droneName: d.name };
      data.detections.push(det);
      if (det.assessment ? det.assessment.dangerous : det.criticality === 'krytyczny') {
        createDelivery(data, det, 'kamizelki', true, 'oczekuje_drona');
      }
    }
    d.offlineBuffer = [];
  }
  const reason = d.returnReason;
  d.returnReason = null;
  // Sektor przejęty przez sąsiadów – dron nie wraca już do własnych punktów trasy
  const ownSector = sectorOf(data, d);
  if (d.sectorReassigned && ownSector) d.scanIndex = ownSector.waypoints.length;

  if (mission.status === 'powrot') {
    d.phase = 'czuwanie';
    return;
  }
  if (d.groundedByWeather) {
    d.phase = 'uziemiony';
    addEvent(data, 'ostrzezenie', 'pogoda', `${d.name}: wylądował i pozostaje uziemiony do poprawy warunków.`, d.droneId);
    return;
  }
  const hasWork =
    d.category === 'zwiadowczy' ? d.signalQueue.length > 0 || (!d.sectorDone && (!d.sectorReassigned || d.extraWaypoints.length > 0)) : true;
  if (d.category === 'zwiadowczy' && !hasWork) {
    d.phase = 'czuwanie';
    addEvent(data, 'sukces', 'dron', `${d.name}: ${reason === 'sektor_przejety' ? 'sektor przejęty przez sąsiadów' : 'zadanie zakończone'} – tryb czuwania.`, d.droneId);
    return;
  }
  if (d.battery < 60) {
    d.phase = 'wymiana_baterii';
    d.batterySwapWaitTicks = 0;
    addEvent(data, 'info', 'dron', `${d.name}: lądowanie z baterią ${Math.round(d.battery)}% – oczekuje na wymianę akumulatora (Pit-Stop).`, d.droneId);
  } else {
    d.phase = 'gotowy';
  }
};

const tickDrone = (data: MissionData, mission: Mission, d: DroneRuntime) => {
  const w = currentWeather(data);
  const sector = sectorOf(data, d);
  const scanAlt = sector?.altitudeAgl ?? 60;

  if (isAirborne(d)) {
    drainBattery(d, SIM_DT);
    d.flightSeconds += SIM_DT;
  }

  // Awaryjne lądowanie przy wyczerpanej baterii
  if (isAirborne(d) && d.battery <= 3) {
    abortProcedure(data, d);
    d.battery = 0;
    d.phase = 'uziemiony';
    d.speed = 0;
    addEvent(data, 'krytyczny', 'dron', `${d.name}: krytyczny poziom baterii – awaryjne lądowanie w ${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}.`, d.droneId);
    if (d.category === 'zwiadowczy' && !d.sectorDone && !d.sectorReassigned) reassignSector(data, d);
    d.sectorDone = true;
    const dlv = data.deliveries.find((x) => x.id === d.deliveryId && x.status === 'w_locie');
    if (dlv) {
      dlv.status = 'oczekuje_drona';
      dlv.droneId = null;
      dlv.droneName = null;
    }
    d.deliveryId = null;
    return;
  }

  switch (d.phase) {
    case 'gotowy': {
      if (mission.status !== 'aktywna' || d.groundedByWeather || d.category !== 'zwiadowczy') break;
      const next = nextScanWaypoint(data, d);
      if ((d.sectorDone || !next) && d.signalQueue.length === 0) break;
      if (d.battery < 50) {
        d.phase = 'wymiana_baterii';
        break;
      }
      if (!next || d.sectorDone) {
        // Trasa przeleciana, zostały sygnały do sprawdzenia
        d.phase = 'skanowanie';
        d.sorties++;
        addEvent(data, 'info', 'dron', `${d.name}: wylot #${d.sorties} – sprawdzenie ${d.signalQueue.length} sygnałów z rozpoznania.`, d.droneId);
        break;
      }
      d.phase = 'przelot';
      d.target = { lat: next.lat, lng: next.lng };
      d.altAgl = Math.max(80, scanAlt);
      d.sorties++;
      addEvent(data, 'info', 'dron', `${d.name}: autonomiczny start – przelot (transit) do sektora ${sector ? sector.index + 1 : ''}, wylot #${d.sorties}.`, d.droneId);
      break;
    }
    case 'przelot': {
      const next = nextScanWaypoint(data, d);
      if (!next) {
        orderReturn(data, d, 'brak_zadan');
        break;
      }
      const { reached } = fly(d, next, d.cruiseSpeed, SIM_DT, windOf(data));
      if (reached) {
        d.phase = 'skanowanie';
        d.turnPendingS = 0;
        d.altAgl = next.altAgl;
        addEvent(
          data,
          'info',
          'dron',
          `${d.name}: wejście w sektor – aktywacja ${d.hasThermal ? 'FLIR i kamery optycznej' : 'kamery optycznej'}, ${(next.pass ?? 2) === 1 ? 'szybkie rozpoznanie termowizyjne' : 'przeszukanie dokładne'} na ${next.altAgl} m AGL.`,
          d.droneId
        );
      }
      if (needsReturnForBattery(data, d)) orderReturn(data, d, 'bateria');
      break;
    }
    case 'skanowanie': {
      if (shouldCheckSignals(data, d) && startSignalCheck(data, d)) break;
      const wind = windOf(data);
      const reconSpeed = Math.min(d.cruiseSpeed * 0.9, 14);
      let budget = SIM_DT;
      let found: DroneRuntime['candidate'] = null;
      while (budget > 0 && !found) {
        // Zawrót na końcu linii zajmuje czas (hamowanie, obrót, przyspieszenie)
        if ((d.turnPendingS ?? 0) > 0) {
          const used = Math.min(budget, d.turnPendingS!);
          d.turnPendingS! -= used;
          budget -= used;
          d.speed = 0;
          continue;
        }
        const wp = nextScanWaypoint(data, d);
        if (!wp) break;
        const airspeed = wp.fast ? d.cruiseSpeed : (wp.pass ?? 2) === 1 ? reconSpeed : scanSpeedFor(d.spec);
        const before = { lat: d.lat, lng: d.lng };
        const gs = groundSpeedTo(before, wp, airspeed, wind);
        const step = Math.min(budget, (haversineKm(before, wp) * 1000) / gs);
        const r = fly(d, wp, airspeed, step, wind);
        d.altAgl = wp.altAgl;
        budget -= step;
        found = senseAlong(data, d, before, { lat: d.lat, lng: d.lng }, wp);
        if (r.reached) {
          advanceScanWaypoint(data, d);
          d.turnPendingS = nextScanWaypoint(data, d)?.turnS ?? 0;
          if (shouldCheckSignals(data, d)) break;
        } else if (!found) break;
      }
      if (found) {
        d.candidate = found;
        d.phase = 'weryfikacja_celu';
        d.taskTicks = 2;
        d.altAgl = 25;
        break;
      }
      if (!nextScanWaypoint(data, d) && d.signalQueue.length > 0 && !d.linkLost) {
        startSignalCheck(data, d);
        break;
      }
      if (!nextScanWaypoint(data, d)) {
        d.sectorDone = true;
        addEvent(data, 'sukces', 'dron', `${d.name}: sektor przeskanowany w 100% – powrót do Strefy Zero.`, d.droneId);
        orderReturn(data, d, 'sektor_ukonczony');
        break;
      }
      if (needsReturnForBattery(data, d)) {
        addEvent(data, 'ostrzezenie', 'dron', `${d.name}: osiągnięto rezerwę RTH (${Math.round(d.battery)}%) – powrót na wymianę baterii.`, d.droneId);
        orderReturn(data, d, 'bateria');
        break;
      }
      break;
    }
    case 'sprawdzanie_sygnalu': {
      const sig = data.signals.find((x) => x.id === d.detectionId);
      if (!sig || !d.target) {
        d.phase = 'skanowanie';
        break;
      }
      const { reached } = fly(d, d.target, d.cruiseSpeed, SIM_DT, windOf(data));
      d.altAgl = Math.max(40, scanAlt);
      if (reached) {
        const t = data.hidden.find((x) => x.id === sig.targetId);
        d.signalQueue = d.signalQueue.filter((x) => x !== sig.id);
        d.detectionId = null;
        d.candidate = {
          lat: t ? t.lat : sig.lat,
          lng: t ? t.lng : sig.lng,
          falseAlarm: !t || t.kind !== 'osoba',
          source: d.hasThermal ? 'termowizja' : 'rgb',
          targetId: t?.id,
          signalId: sig.id,
        };
        d.phase = 'weryfikacja_celu';
        d.taskTicks = 2;
        d.altAgl = 25;
      }
      if (needsReturnForBattery(data, d)) {
        sig.status = 'nowy';
        orderReturn(data, d, 'bateria');
      }
      break;
    }
    case 'weryfikacja_celu': {
      if (--d.taskTicks > 0) break;
      const c = d.candidate;
      d.candidate = null;
      if (!c) {
        d.phase = 'skanowanie';
        break;
      }
      const target = c.targetId ? data.hidden.find((x) => x.id === c.targetId) ?? null : null;
      const signal = c.signalId ? data.signals.find((x) => x.id === c.signalId) ?? null : null;
      if (target) target.resolved = true;
      if (signal) signal.status = c.falseAlarm ? 'falszywy' : 'potwierdzony';
      if (target && !c.falseAlarm) target.foundAtSim = data.simSeconds;
      if (c.falseAlarm) {
        data.stats.falseAlarmsOnboard++;
        if (!d.linkLost) addEvent(data, 'info', 'detekcja', `${d.name}: potencjalny cel po obniżeniu pułapu okazał się fałszywym alarmem – wznowienie poszukiwań.`, d.droneId);
        d.phase = 'skanowanie';
        d.altAgl = scanAlt;
        break;
      }
      const det = buildDetection(data, d, c, d.linkLost, target);
      if (d.linkLost) {
        // 7.2 – tryb offline: zapis danych, przerwanie poszukiwań, wznoszenie i Smart RTH
        det.history.push('Wykryto w trybie offline (Edge AI) – dane dostarczone po powrocie drona.');
        d.offlineBuffer.push(det);
        orderReturn(data, d, 'smart_rth');
        d.altAgl = 100;
        break;
      }
      startProcedure(data, d, det, target);
      break;
    }
    case 'analiza':
    case 'wywiad': {
      tickProcedure(data, d);
      if (d.procedure && needsReturnForBattery(data, d)) {
        addEvent(data, 'ostrzezenie', 'dron', `${d.name}: rezerwa RTH (${Math.round(d.battery)}%) w trakcie analizy – przekazanie wyników i powrót.`, d.droneId);
        orderReturn(data, d, 'bateria');
      }
      break;
    }
    case 'monitorowanie': {
      const dlvDone = data.deliveries.some((x) => x.detectionId === d.detectionId && x.status === 'zrzucono');
      d.speed = 0;
      if (--d.taskTicks <= 0 || dlvDone) {
        d.detectionId = null;
        d.phase = 'skanowanie';
        d.altAgl = scanAlt;
      }
      if (needsReturnForBattery(data, d)) orderReturn(data, d, 'bateria');
      break;
    }
    case 'dostawa': {
      const dlv = data.deliveries.find((x) => x.id === d.deliveryId);
      if (!dlv || !d.target) {
        orderReturn(data, d, 'brak_zadan');
        break;
      }
      const { reached } = fly(d, d.target, d.cruiseSpeed, SIM_DT);
      if (reached) {
        dlv.status = 'zrzucono';
        dlv.droppedAt = new Date().toISOString();
        if (dlv.payloadType === 'kamizelki') data.stats.vests += dlv.quantity;
        else if (dlv.payloadType === 'apteczka') data.stats.medkits += dlv.quantity;
        else data.stats.foodWater += dlv.quantity;
        const det = data.detections.find((x) => x.id === dlv.detectionId);
        det?.history.push(`Zrzut wykonany: ${dlv.quantity} × ${PAYLOAD_LABELS[dlv.payloadType]} (${d.name}).`);
        addEvent(data, 'sukces', 'dostawa', `${d.name}: precyzyjny zrzut – ${dlv.quantity} × ${PAYLOAD_LABELS[dlv.payloadType]}.`, d.droneId);
        const watcher = data.drones.find((x) => x.phase === 'monitorowanie' && x.detectionId === dlv.detectionId);
        if (watcher) logFeed(data, watcher.droneId, 'sukces', `Obserwacja: ${d.name} zrzucił ${PAYLOAD_LABELS[dlv.payloadType]} – ładunek dotarł do osoby.`);
        d.deliveryId = null;
        orderReturn(data, d, 'dostawa_zakonczona');
      }
      break;
    }
    case 'powrot': {
      const { reached } = fly(d, data.base, d.cruiseSpeed, SIM_DT, windOf(data));
      if (reached) landDrone(data, mission, d);
      break;
    }
    case 'wymiana_baterii': {
      d.batterySwapWaitTicks++;
      // Brak przydzielonego technika – wymiana wykonywana przez obsługę bazy po dłuższym czasie
      if (data.assignments.technik.length === 0 && d.batterySwapWaitTicks >= AUTO_BATTERY_SWAP_TICKS) {
        d.battery = 100;
        d.phase = 'gotowy';
        addEvent(data, 'info', 'zespol', `${d.name}: akumulator wymieniony przez obsługę bazy.`, d.droneId);
      }
      break;
    }
    default:
      break;
  }

  if (isAirborne(d)) pushTrack(d);
  describeActivity(data, d);
};

/** 7.2 – symulacja łączności radiowej i reakcja C2 na brak telemetrii */
const tickLink = (data: MissionData, d: DroneRuntime) => {
  if (!isAirborne(d) || d.category !== 'zwiadowczy') {
    if (!d.linkLost) {
      d.reportedLat = d.lat;
      d.reportedLng = d.lng;
      d.reportedBattery = d.battery;
      d.lastTelemetryAt = new Date().toISOString();
    }
    return;
  }
  const rangeKm = Math.min(data.radioRangeKm, d.radioRangeKm);
  const dist = haversineKm(d, data.base);

  if (!d.linkLost) {
    if (dist > rangeKm || (d.phase === 'skanowanie' && Math.random() < RANDOM_LINK_LOSS_PER_TICK)) {
      d.linkLost = true;
      d.linkLostSinceSim = data.simSeconds;
    }
  } else if (dist <= rangeKm * 0.95 && Math.random() < LINK_RESTORE_PER_TICK) {
    d.linkLost = false;
    addEvent(data, 'sukces', 'lacznosc', `${d.name}: łączność przywrócona.`, d.droneId);
    if (d.sectorReassigned && d.phase !== 'powrot') {
      addEvent(data, 'info', 'lacznosc', `${d.name}: sektor przejęty przez sąsiadów – polecenie powrotu do bazy.`, d.droneId);
      d.offlineBuffer.forEach((det) => {
        det.photo ??= { capturedAtSim: data.simSeconds, altAgl: 25, heading: d.heading, droneName: d.name };
        data.detections.push(det);
      });
      d.offlineBuffer = [];
      orderReturn(data, d, 'sektor_przejety');
    }
  }

  if (d.linkLost) {
    const lostFor = data.simSeconds - (d.linkLostSinceSim ?? data.simSeconds);
    if (lostFor >= TELEMETRY_TIMEOUT_SIM_S && !d.sectorReassigned) {
      addEvent(
        data,
        'krytyczny',
        'lacznosc',
        `${d.name}: brak telemetrii od ${Math.round(lostFor)} s – dron przeszedł w tryb Offline Search (Edge AI) i kontynuuje misję.`,
        d.droneId
      );
      reassignSector(data, d);
    }
  } else {
    d.reportedLat = d.lat;
    d.reportedLng = d.lng;
    d.reportedBattery = d.battery;
    d.lastTelemetryAt = new Date().toISOString();
  }
};

const releaseFleet = async (data: MissionData) => {
  const ids = data.drones.map((d) => d.droneId);
  if (ids.length) await Drone.update({ status: 'dostepny' }, { where: { id: ids, status: 'w_misji' } });
};

const finishMission = async (mission: Mission, data: MissionData, message: string) => {
  mission.status = 'zakonczona';
  mission.endedAt = new Date();
  for (const d of data.drones) if (!isAirborne(d) && d.phase !== 'uziemiony') d.phase = 'czuwanie';
  addEvent(data, 'sukces', 'system', message);
  await releaseFleet(data);
};

// ----- Pogoda pobierana w tle, aby nie blokować ticka -----
const weatherCache = new Map<string, { snapshot: WeatherSnapshot | null; fetching: boolean }>();

const requestWeather = (missionId: string, lat: number, lng: number) => {
  const entry = weatherCache.get(missionId) ?? { snapshot: null, fetching: false };
  if (entry.fetching) return;
  entry.fetching = true;
  weatherCache.set(missionId, entry);
  fetchLiveWeather(lat, lng)
    .then((snapshot) => {
      if (snapshot) entry.snapshot = snapshot;
    })
    .finally(() => {
      entry.fetching = false;
    });
};

export const tickMission = async (mission: Mission, data: MissionData) => {
  // Pauza: czas operacji, drony, baterie i pogoda stoją w miejscu
  if (data.paused) return;
  SIM_DT = (TICK_MS / 1000) * missionTimeScale(data);
  data.simSeconds += SIM_DT;

  if (mission.status === 'przygotowanie') {
    let changed = false;
    for (const d of data.drones) {
      if (d.phase !== 'kalibracja') continue;
      if (--d.taskTicks <= 0) {
        d.phase = 'gotowy';
        d.calibrated = true;
        d.connected = true;
        changed = true;
        addEvent(data, 'sukces', 'dron', `${d.name}: kalibracja zakończona, połączono z serwerem C2.`, d.droneId);
      }
    }
    if (changed && data.drones.every((d) => d.calibrated)) {
      for (const item of data.checklist) {
        if (item.id === 'kalibracja' || item.id === 'polaczenie') {
          item.done = true;
          item.doneBy = 'System C2';
          item.doneAt = new Date().toISOString();
        }
      }
      addEvent(data, 'sukces', 'system', 'Procedura przedstartowa: cała flota skalibrowana i w pełnej gotowości technicznej.');
    }
    return;
  }

  if (mission.status !== 'aktywna' && mission.status !== 'powrot') return;

  // 7.3 – cykliczne pobieranie danych meteorologicznych
  const cached = weatherCache.get(mission.id);
  if (!data.weatherOverride && cached?.snapshot && cached.snapshot.fetchedAt !== data.weather?.fetchedAt) {
    data.weather = cached.snapshot;
    applyWeather(data, cached.snapshot);
  }
  if (data.simSeconds - data.lastWeatherCheckSim >= WEATHER_CHECK_SIM_S) {
    data.lastWeatherCheckSim = data.simSeconds;
    if (data.weatherOverride) applyWeather(data, data.weatherOverride);
    else requestWeather(mission.id, data.base.lat, data.base.lng);
  }

  dispatchDeliveries(data);
  for (const d of data.drones) {
    tickDrone(data, mission, d);
    tickLink(data, d);
  }

  const anyAirborne = data.drones.some(isAirborne);
  const deliveriesInFlight = data.deliveries.some((x) => x.status === 'w_locie');

  if (mission.status === 'powrot') {
    for (const d of data.drones) if (isAirborne(d) && d.phase !== 'powrot') orderReturn(data, d, 'rozkaz_koordynatora');
    if (!anyAirborne) await finishMission(mission, data, 'Wszystkie drony w Strefie Zero – tryb czuwania. Operacja zakończona na rozkaz koordynatora.');
    return;
  }

  const scouts = data.drones.filter((d) => d.category === 'zwiadowczy');
  const allScanned = scouts.every((d) => (d.sectorDone || d.sectorReassigned) && d.extraWaypoints.length === 0 && d.signalQueue.length === 0);
  const pendingOffline = data.drones.some((d) => d.offlineBuffer.length > 0);
  const pendingDrops = data.deliveries.some((x) => x.status === 'oczekuje_drona');
  if (scouts.length > 0 && allScanned && !anyAirborne && !deliveriesInFlight && !pendingOffline && !pendingDrops) {
    await finishMission(mission, data, 'Wszystkie sektory przeskanowane – flota w trybie czuwania. Operacja poszukiwawcza zakończona.');
    return;
  }

  // Zabezpieczenie: flota w bazie i nic nie czeka na człowieka ani na pogodę – żaden dron nie ma już zadań
  const waitingForPeopleOrWeather = data.drones.some((d) => ['wymiana_baterii', 'uziemiony', 'kalibracja'].includes(d.phase));
  if (!anyAirborne && !deliveriesInFlight && !pendingDrops && !waitingForPeopleOrWeather) data.idleTicks = (data.idleTicks ?? 0) + 1;
  else data.idleTicks = 0;
  if ((data.idleTicks ?? 0) >= IDLE_FINISH_TICKS) {
    const left = scouts.reduce((s, d) => s + d.extraWaypoints.length + d.signalQueue.length, 0);
    await finishMission(
      mission,
      data,
      `Flota w bazie bez dalszych zadań możliwych do wykonania${left ? ` (pozostało ${left} punktów – wymagają ręcznego przydziału)` : ''} – operacja zakończona.`
    );
  }
};

let timer: NodeJS.Timeout | null = null;
let running = false;

export const startSimulator = () => {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const missions = await Mission.findAll({ where: { status: ['przygotowanie', 'aktywna', 'powrot'] }, attributes: ['id'] });
      for (const m of missions) {
        await withMission(m.id, (mission, data) => tickMission(mission, data));
      }
    } catch (err) {
      console.error('❌ Błąd symulatora operacji:', err);
    } finally {
      running = false;
    }
  }, TICK_MS);
  console.log(`🛰️  Symulator operacji dronowych uruchomiony (1 s = ${TIME_SCALE} s operacji)`);
};

export const stopSimulator = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

export { releaseFleet };
