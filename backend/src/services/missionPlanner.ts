/**
 * Krok 4 planu – rozdzielenie strefy na podwarstwy (sektory) dla każdego drona
 * i zaawansowane planowanie lotu.
 *
 * Podział „wachlarzowy” ze Strefy Zero: każdy sektor jest klinem o wierzchołku w bazie.
 * Odcinek z bazy do dowolnego punktu klina leży w tym samym klinie, więc przelot do sektora
 * i powrót nigdy nie przecinają sektorów innych dronów. Kąty klinów dobierane są tak, aby
 * łączny czas pracy każdego drona (przelot + skanowanie + kolejne wyloty i wymiany baterii)
 * był jednakowy – drony teoretycznie kończą i wracają do bazy w tym samym momencie.
 *
 * Wewnątrz sektora trasa budowana jest pod kątem jak najszybszego odnalezienia ludzi
 * (routeBuilder): mapa priorytetów, kierunek linii dobrany do kształtu i wiatru, koszt zawrotów,
 * opcjonalnie dwa przeloty – szybkie rozpoznanie termowizyjne i przeszukanie dokładne.
 *
 *  4.1 strefa przycięta do zasięgu łączności przed podziałem,
 *  4.2 czas przelotu, rezerwa RTH i liczba wylotów wliczone w bilans czasu,
 *  4.3 wzorce lotu dopasowane do FOV, wysokości, wiatru i priorytetów, teren 3D, objazdy No-Fly,
 *  4.4 bufory bezpieczeństwa między klinami i różne echelony sąsiadów.
 */
import type { FleetAnalysisItem, LatLng, PriorityGrid, SearchMode, Sector, WeatherSnapshot, Waypoint } from '../models/Mission';
import {
  DEFAULT_SCAN_AGL,
  DETECTION_CONTINGENCY,
  DroneSpec,
  ECHELON_STEP_M,
  MAX_AGL_M,
  RTH_RESERVE,
  SECTOR_BUFFER_M,
  effectiveFlightMinutes,
  scanSpeedFor,
  swathWidthM,
} from './flightMath';
import {
  LocalProjection,
  XY,
  circlePolygon,
  clipConvex,
  clipHalfPlane,
  distanceToPolygon,
  haversineKm,
  inflatePolygon,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
} from './geo';
import { PRIORITY_THRESHOLD, gridCells, makeWeightFn } from './priorityService';
import { BuiltRoute, PassSpec, RECON_AGL, RECON_OVERLAP, RouteParams, buildRoute, groundSpeed, windVector } from './routeBuilder';
import { fetchElevations } from './weatherService';

export const SECTOR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#84cc16', '#f97316'];

const NFZ_MARGIN_M = 15;
/** Czas wymiany akumulatora na lądowisku (Pit-Stop) wliczany przy kolejnych wylotach */
export const BATTERY_SWAP_S = 300;
/** Klin nie może przekraczać 180° – inaczej przestaje być wypukły względem bazy */
const MAX_WEDGE = Math.PI;
const CALIBRATION_ROUNDS = 5;
const REFINE_SWEEPS = 3;
/** Margines modelu przy bilansowaniu – klin z zapasem mieści się w jednej baterii także po wyznaczeniu rzeczywistej trasy */
const MODEL_SORTIE_MARGIN = 0.93;

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export interface PlanInput {
  base: { lat: number; lng: number };
  radioRangeKm: number;
  area: LatLng[];
  noFlyZones: LatLng[][];
  weather: WeatherSnapshot;
  scouts: { spec: DroneSpec; analysis: FleetAnalysisItem }[];
  searchMode?: SearchMode;
  priorityGrid?: PriorityGrid | null;
}

export interface PlanResult {
  sectors: Sector[];
  warnings: string[];
  stats: {
    areaKm2: number;
    coveredKm2: number;
    uncoveredKm2: number;
    finishMinutes: number;
    finishSpreadMinutes: number;
    expectedFindMinutes: number;
    baselineExpectedFindMinutes: number;
  };
}

interface ScoutCtx {
  scout: { spec: DroneSpec; analysis: FleetAnalysisItem };
  altitudeAgl: number;
  echelon: number;
  passes: PassSpec[];
  cruise: number;
  /** Czas lotu na jednej baterii z zachowaniem rezerwy RTH [s] */
  sortieSec: number;
  /** Kalibracja modelu na podstawie rzeczywistej trasy z poprzedniej iteracji */
  scanFactor: number;
  transitOffsetS: number;
}

interface TimeEstimate {
  totalSec: number;
  scanSec: number;
  transitSec: number;
  sorties: number;
}

/** Surowy (niekalibrowany) czas przeszukania: rozpoznanie całego obszaru + przeszukanie dokładne części */
const modelScanSec = (c: ScoutCtx, areaM2: number, pass2AreaM2: number) =>
  c.passes.reduce((s, p) => s + (p.pass === 1 || c.passes.length === 1 ? areaM2 : pass2AreaM2) / (p.swath * p.speed), 0);

/** Bilans czasu drona dla danego obszaru (model uproszczony – kalibrowany rzeczywistą trasą) */
const estimateTime = (c: ScoutCtx, poly: XY[], base: XY, pass2AreaM2: number): TimeEstimate => {
  const areaM2 = polygonArea(poly);
  if (areaM2 < 1) return { totalSec: 0, scanSec: 0, transitSec: 0, sorties: 0 };
  const near = distanceToPolygon(base, poly);
  const scanSec = modelScanSec(c, areaM2, Math.min(areaM2, pass2AreaM2)) * c.scanFactor;
  const transitSec = Math.max(0, (2 * near) / c.cruise + c.transitOffsetS);
  const perSortie = c.sortieSec * (1 - DETECTION_CONTINGENCY) * MODEL_SORTIE_MARGIN - transitSec;
  if (perSortie <= 60) return { totalSec: Infinity, scanSec, transitSec, sorties: Infinity };
  const sorties = Math.max(1, Math.ceil(scanSec / perSortie));
  return { totalSec: scanSec + sorties * transitSec + (sorties - 1) * BATTERY_SWAP_S, scanSec, transitSec, sorties };
};

const dirOf = (a: number): XY => ({ x: Math.cos(a), y: Math.sin(a) });

/** Klin o wierzchołku w bazie między kątami a1 < a2 (≤ 180°), z opcjonalnymi buforami na krawędziach */
const wedge = (poly: XY[], base: XY, a1: number, a2: number, bufStart = 0, bufEnd = 0): XY[] => {
  const d1 = dirOf(a1);
  const n1 = { x: -d1.y, y: d1.x };
  let out = clipHalfPlane(poly, { x: base.x + n1.x * bufStart, y: base.y + n1.y * bufStart }, d1, 'left');
  const d2 = dirOf(a2);
  const n2 = { x: -d2.y, y: d2.x };
  out = clipHalfPlane(out, { x: base.x - n2.x * bufEnd, y: base.y - n2.y * bufEnd }, d2, 'right');
  return out;
};

/** Zakres kątowy strefy widzianej z bazy (pełne 360°, gdy baza leży wewnątrz strefy) */
const angularRange = (poly: XY[], base: XY): { start: number; end: number; full: boolean } => {
  const angles = poly.map((p) => Math.atan2(p.y - base.y, p.x - base.x));
  if (pointInPolygon(base, poly)) return { start: angles[0], end: angles[0] + 2 * Math.PI, full: true };
  const sorted = [...angles].sort((a, b) => a - b);
  let gap = sorted[0] + 2 * Math.PI - sorted[sorted.length - 1];
  let start = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gap) {
      gap = sorted[i] - sorted[i - 1];
      start = sorted[i];
    }
  }
  const span = 2 * Math.PI - gap;
  return { start: start - 1e-6, end: start + span + 1e-6, full: false };
};

/**
 * Wyznacza kąty cięć tak, aby czas pracy każdego drona był jak najbliższy wspólnemu T.
 * Dla zadanego T każdy dron (po kolei w wachlarzu) otrzymuje największy klin, który zdąży
 * obsłużyć w czasie T; T jest dobierane bisekcją tak, by ostatni dron domknął wachlarz.
 */
const balanceCuts = (
  poly: XY[],
  base: XY,
  range: { start: number; end: number },
  ctxs: ScoutCtx[],
  pass2Area: (a1: number, a2: number, wedgePoly: XY[]) => number
): number[] => {
  const n = ctxs.length;
  const timeOf = (i: number, a1: number, a2: number) => {
    const w = wedge(poly, base, a1, a2);
    return estimateTime(ctxs[i], w, base, pass2Area(a1, a2, w)).totalSec;
  };

  const sweep = (T: number): { cuts: number[]; feasible: boolean } => {
    const cuts: number[] = [];
    let cur = range.start;
    for (let i = 0; i < n - 1; i++) {
      const maxA = Math.min(cur + MAX_WEDGE, range.end);
      let a: number;
      if (timeOf(i, cur, maxA) <= T) a = maxA;
      else {
        let lo = cur;
        let hi = maxA;
        for (let it = 0; it < 32; it++) {
          const mid = (lo + hi) / 2;
          if (timeOf(i, cur, mid) <= T) lo = mid;
          else hi = mid;
        }
        a = lo;
      }
      cuts.push(a);
      cur = a;
    }
    const feasible = range.end - cur <= MAX_WEDGE + 1e-9 && timeOf(n - 1, cur, range.end) <= T;
    return { cuts, feasible };
  };

  let lo = 0;
  let hi = 1e7;
  let best = sweep(hi).cuts;
  for (let it = 0; it < 45; it++) {
    const mid = (lo + hi) / 2;
    const r = sweep(mid);
    if (r.feasible) {
      hi = mid;
      best = r.cuts;
    } else lo = mid;
  }
  return best;
};

interface BuiltSector {
  ctx: ScoutCtx;
  polygon: XY[];
  route: BuiltRoute;
  outSec: number;
  est: TimeEstimate;
  approxScanSec: number;
  approxNear: number;
}

export const planSectors = (input: PlanInput): PlanResult => {
  const warnings: string[] = [];
  if (input.area.length < 3) throw new Error('Strefa poszukiwań musi mieć co najmniej 3 wierzchołki');
  if (input.scouts.length === 0) throw new Error('Brak drona zwiadowczego zdolnego do lotu – nie można utworzyć sektorów');
  const mode: SearchMode = input.searchMode ?? 'jednoprzebiegowy';

  const lat0 = input.area.reduce((s, p) => s + p[0], 0) / input.area.length;
  const lng0 = input.area.reduce((s, p) => s + p[1], 0) / input.area.length;
  const proj = new LocalProjection(lat0, lng0);
  const toLatLng = (p: XY): LatLng => {
    const ll = proj.toLatLng(p);
    return [round(ll[0], 6), round(ll[1], 6)];
  };

  const fullArea = input.area.map((p) => proj.toXY(p));
  const noFly = input.noFlyZones.filter((z) => z.length >= 3).map((z) => inflatePolygon(z.map((p) => proj.toXY(p)), NFZ_MARGIN_M));
  const base = proj.toXY([input.base.lat, input.base.lng]);
  const totalAreaM2 = polygonArea(fullArea);
  const wind = windVector(input.weather);

  // Mapa priorytetów (waga 1 = brak przesłanek); w trybie jednoprzebiegowym wpływa na kolejność
  const grid = input.priorityGrid ?? null;
  const hasPriority = !!grid && !grid.uniform;
  const weightAt = makeWeightFn(grid, (p) => proj.toLatLng(p));
  const pass2Threshold = mode === 'dwuprzebiegowy' && hasPriority ? PRIORITY_THRESHOLD : null;

  // 4.1 – strefa przycięta do zasięgu łączności MESH (drony dzielą tylko osiągalny teren)
  const maxDroneRadio = Math.max(...input.scouts.map((s) => s.spec.radioRangeKm));
  const radioKm = Math.min(input.radioRangeKm, maxDroneRadio);
  const reachable = clipConvex(fullArea, circlePolygon(base, radioKm * 1000));
  const reachableM2 = polygonArea(reachable);
  if (reachableM2 < 100) throw new Error('Strefa poszukiwań leży poza zasięgiem łączności Strefy Zero');
  if (totalAreaM2 - reachableM2 > 1000) {
    warnings.push(
      `${round((totalAreaM2 - reachableM2) / 1e6, 3)} km² strefy leży poza zasięgiem łączności ${round(radioKm)} km – rozważ przesunięcie Strefy Zero lub dodatkowe wzmacniacze MESH.`
    );
  }

  const makeCtx = (s: { spec: DroneSpec; analysis: FleetAnalysisItem }, index: number, count: number, full: boolean): ScoutCtx => {
    let echelon = index % 2;
    if (full && count > 1 && count % 2 === 1 && index === count - 1) echelon = 2; // domknięcie wachlarza 360°
    const altitudeAgl = Math.min(MAX_AGL_M, DEFAULT_SCAN_AGL + echelon * ECHELON_STEP_M);
    const detail: PassSpec = { pass: 2, altAgl: altitudeAgl, swath: swathWidthM(altitudeAgl, s.spec.cameraFovDeg), speed: scanSpeedFor(s.spec) };
    const reconAlt = Math.min(MAX_AGL_M, RECON_AGL + echelon * 10);
    const recon: PassSpec = {
      pass: 1,
      altAgl: reconAlt,
      swath: 2 * reconAlt * Math.tan(((s.spec.cameraFovDeg / 2) * Math.PI) / 180) * (1 - RECON_OVERLAP),
      speed: Math.min(s.spec.cruiseSpeed * 0.9, 14),
    };
    return {
      scout: s,
      altitudeAgl,
      echelon,
      passes: mode === 'dwuprzebiegowy' ? [recon, detail] : [detail],
      cruise: s.spec.cruiseSpeed,
      sortieSec: effectiveFlightMinutes(s.spec, input.weather) * 60 * (1 - RTH_RESERVE),
      scanFactor: 1,
      transitOffsetS: 0,
    };
  };

  // Drony, które nie są w stanie dolecieć do strefy i wrócić z rezerwą, są pomijane
  const nearAll = distanceToPolygon(base, reachable);
  const usable = input.scouts.filter((s) => {
    const sortieSec = effectiveFlightMinutes(s.spec, input.weather) * 60 * (1 - RTH_RESERVE);
    return sortieSec - (2 * nearAll) / s.spec.cruiseSpeed > 120;
  });
  const excluded = input.scouts.filter((s) => !usable.includes(s));
  if (excluded.length > 0) {
    warnings.push(`Wyłączono z podziału (zbyt daleko od bazy na bezpieczny powrót): ${excluded.map((s) => s.spec.name).join(', ')}`);
  }
  if (usable.length === 0) throw new Error('Żaden dron nie ma wystarczającej energii, aby dolecieć do strefy i bezpiecznie wrócić');

  const range = angularRange(reachable, base);
  const ctxs = usable.map((s, i) => makeCtx(s, i, usable.length, range.full));
  const n = ctxs.length;

  // Obszar przeszukania dokładnego w klinie (komórki priorytetowe widziane z bazy pod kątem z zakresu)
  const priorityCells = hasPriority
    ? gridCells(grid!)
        .filter((c) => c.w >= PRIORITY_THRESHOLD)
        .map((c) => proj.toXY([c.lat, c.lng]))
        .filter((p) => pointInPolygon(p, reachable))
        .map((p) => {
          let a = Math.atan2(p.y - base.y, p.x - base.x);
          while (a < range.start) a += 2 * Math.PI;
          while (a >= range.start + 2 * Math.PI) a -= 2 * Math.PI;
          return a;
        })
        .sort((a, b) => a - b)
    : [];
  const cellArea = grid ? grid.cellM * grid.cellM : 0;
  const countBetween = (a1: number, a2: number) => {
    const lower = (x: number) => {
      let lo = 0;
      let hi = priorityCells.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (priorityCells[m] < x) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    return lower(a2) - lower(a1);
  };
  const pass2Area = (a1: number, a2: number, wedgePoly: XY[]) => {
    if (mode !== 'dwuprzebiegowy') return 0;
    if (!hasPriority) return polygonArea(wedgePoly);
    return n === 1 ? priorityCells.length * cellArea : countBetween(a1, a2) * cellArea;
  };

  const params: RouteParams = { cruise: 0, wind, noFly, weightAt };
  const buildSector = (ctx: ScoutCtx, polygon: XY[], a1: number, a2: number): BuiltSector => {
    const route = buildRoute({ poly: polygon, base, passes: ctx.passes, pass2Threshold, params: { ...params, cruise: ctx.cruise }, prioritized: hasPriority });
    const last = route.points[route.points.length - 1] ?? base;
    const back = { x: base.x - last.x, y: base.y - last.y };
    const backLen = Math.hypot(back.x, back.y) || 1;
    const outSec = route.outM / groundSpeed(ctx.cruise, { x: back.x / backLen, y: back.y / backLen }, wind);
    const scanOnly = Math.max(0, route.scanSec - route.inSec);
    const transitSec = route.inSec + outSec;
    const perSortie = ctx.sortieSec * (1 - DETECTION_CONTINGENCY) - transitSec;
    const sorties = scanOnly > 0 ? (perSortie > 60 ? Math.max(1, Math.ceil(scanOnly / perSortie)) : Infinity) : 0;
    const totalSec = scanOnly + sorties * transitSec + Math.max(0, sorties - 1) * BATTERY_SWAP_S;
    const areaM2 = polygonArea(polygon);
    return {
      ctx,
      polygon,
      route,
      outSec,
      est: { totalSec, scanSec: scanOnly, transitSec, sorties },
      approxScanSec: modelScanSec(ctx, areaM2, Math.min(areaM2, pass2Area(a1, a2, polygon))),
      approxNear: distanceToPolygon(base, polygon),
    };
  };

  const bufStart = (i: number) => (i > 0 || range.full ? SECTOR_BUFFER_M / 2 : 0);
  const bufEnd = (i: number) => (i < n - 1 || range.full ? SECTOR_BUFFER_M / 2 : 0);
  const buildAt = (i: number, a1: number, a2: number) =>
    buildSector(ctxs[i], n === 1 ? reachable : wedge(reachable, base, a1, a2, bufStart(i), bufEnd(i)), a1, a2);
  const spreadOf = (bs: BuiltSector[]) => {
    const totals = bs.map((b) => b.est.totalSec);
    return Math.max(...totals) - Math.min(...totals);
  };

  let built: BuiltSector[] = [];
  let bounds: number[] = [];
  let bestSpread = Infinity;
  for (let round_ = 0; round_ < CALIBRATION_ROUNDS; round_++) {
    const cuts = n > 1 ? balanceCuts(reachable, base, range, ctxs, pass2Area) : [];
    const roundBounds = [range.start, ...cuts, range.end];
    const roundBuilt = ctxs.map((_, i) => buildAt(i, roundBounds[i], roundBounds[i + 1]));
    const spread = spreadOf(roundBuilt);
    if (spread < bestSpread) {
      bestSpread = spread;
      built = roundBuilt;
      bounds = roundBounds;
    }
    // Kalibracja modelu czasu rzeczywistą trasą (zawroty, wiatr, objazdy, przejścia między odcinkami)
    roundBuilt.forEach((b) => {
      if (b.approxScanSec > 0 && b.est.scanSec > 0) b.ctx.scanFactor = b.est.scanSec / b.approxScanSec;
      b.ctx.transitOffsetS = b.est.transitSec - (2 * b.approxNear) / b.ctx.cruise;
    });
  }

  // Dostrojenie na rzeczywistych trasach: każda granica między sąsiadami jest przesuwana,
  // aż czasy obu dronów (z liczbą wylotów i wymian baterii) się zrównają. Przy skoku liczby
  // wylotów granica zatrzymuje się tak, by dron nie potrzebował dodatkowego wylotu.
  if (n > 1) {
    const refined = [...bounds];
    const timeAt = (i: number, a1: number, a2: number) => {
      const t = buildAt(i, a1, a2).est.totalSec;
      return Number.isFinite(t) ? t : 1e9;
    };
    for (let sweep = 0; sweep < REFINE_SWEEPS; sweep++) {
      for (let j = 0; j < n - 1; j++) {
        let lo = Math.max(refined[j] + 1e-4, refined[j + 2] - MAX_WEDGE);
        let hi = Math.min(refined[j + 2] - 1e-4, refined[j] + MAX_WEDGE);
        if (lo >= hi) continue;
        for (let it = 0; it < 14; it++) {
          const mid = (lo + hi) / 2;
          if (timeAt(j, refined[j], mid) < timeAt(j + 1, mid, refined[j + 2])) lo = mid;
          else hi = mid;
        }
        const candidates = [lo, hi].map((a) => ({ a, worst: Math.max(timeAt(j, refined[j], a), timeAt(j + 1, a, refined[j + 2])) }));
        refined[j + 1] = candidates[0].worst <= candidates[1].worst ? candidates[0].a : candidates[1].a;
      }
    }
    const refinedBuilt = ctxs.map((_, i) => buildAt(i, refined[i], refined[i + 1]));
    const worstOf = (bs: BuiltSector[]) => Math.max(...bs.map((b) => b.est.totalSec));
    if (worstOf(refinedBuilt) < worstOf(built) - 1 || spreadOf(refinedBuilt) < bestSpread) {
      built = refinedBuilt;
      bounds = refined;
    }
  }

  let totalWeighted = 0;
  let totalMass = 0;
  let baseWeighted = 0;
  let baseMass = 0;

  const sectors: Sector[] = built.map((b, i) => {
    const spec = b.ctx.scout.spec;
    const notes: string[] = [];

    // 4.1 – dron o mniejszym zasięgu radia niż sieć MESH: dodatkowa korekta klina
    let current = b;
    let rangeCorrected = false;
    let uncoveredKm2 = 0;
    if (spec.radioRangeKm < radioKm) {
      const clipped = clipConvex(b.polygon, circlePolygon(base, spec.radioRangeKm * 1000));
      const lost = polygonArea(b.polygon) - polygonArea(clipped);
      if (lost > 100) {
        rangeCorrected = true;
        uncoveredKm2 = lost / 1e6;
        current = buildSector(b.ctx, clipped, bounds[i], bounds[i + 1]);
        notes.push(`Zasięg radia drona ${spec.radioRangeKm} km – podwarstwa skorygowana.`);
      }
    }
    if (!rangeCorrected) {
      const raw = n === 1 ? fullArea : wedge(fullArea, base, bounds[i], bounds[i + 1]);
      const lost = polygonArea(raw) - polygonArea(wedge(reachable, base, bounds[i], bounds[i + 1]));
      if (lost > 1000) {
        rangeCorrected = true;
        uncoveredKm2 = lost / 1e6;
        notes.push(`Część klina poza zasięgiem łączności ${round(radioKm)} km – podwarstwa skorygowana.`);
      }
    }

    const route = current.route;
    const est = current.est;

    // Porównanie: ta sama podwarstwa przeszukana jedną żmiją bez mapy priorytetów
    const baseline = buildRoute({
      poly: current.polygon,
      base,
      passes: [b.ctx.passes[b.ctx.passes.length - 1]],
      pass2Threshold: null,
      params: { ...params, cruise: b.ctx.cruise, weightAt: () => 1 },
      evalWeightAt: weightAt,
    });
    totalWeighted += route.weightedTime;
    totalMass += route.mass;
    baseWeighted += baseline.weightedTime;
    baseMass += baseline.mass;

    if (b.ctx.passes.length === 2) {
      notes.push(
        `Przelot 1: szybkie rozpoznanie termowizyjne na ${b.ctx.passes[0].altAgl} m (${route.passKm[0]} km, linie ${route.sweepDeg[0] ?? '–'}°). Przelot 2: przeszukanie dokładne na ${b.ctx.altitudeAgl} m (${route.passKm[1]} km${hasPriority ? ', strefy priorytetowe i sygnały' : ''}).`
      );
    } else {
      notes.push(`Przeszukanie dokładne na ${b.ctx.altitudeAgl} m, linie pod kątem ${route.sweepDeg[0] ?? '–'}° (najmniej zawrotów przy bieżącym wietrze).`);
    }
    if (hasPriority) notes.push(`Kolejność wg mapy priorytetów: 50% prawdopodobieństwa przeszukane po ${round(route.t50 / 60, 1)} min, 80% po ${round(route.t80 / 60, 1)} min.`);
    notes.push(`${route.turns} zawrotów wliczonych w czas (${round((route.turns * 8) / 60, 1)} min).`);
    if (route.detours > 0) notes.push(`Trasa omija strefy zakazu lotów (No-Fly Zones) – ${route.detours} objazdów wzdłuż ich granic.`);
    notes.push(`Przelot ${round(route.inM / 1000)} km do sektora i ${round(route.outM / 1000)} km powrotu – w całości wewnątrz własnego klina.`);
    notes.push(`Zapas ${DETECTION_CONTINGENCY * 100}% baterii na obsługę detekcji – jedno odnalezienie nie wymusza dodatkowego wylotu.`);
    if (est.sorties > 1) notes.push(`Sektor wymaga ${est.sorties} wylotów – wliczone wymiany baterii na lądowisku (Pit-Stop).`);

    const waypoints: Waypoint[] = route.points.map((p) => {
      const [lat, lng] = toLatLng(p);
      return { lat, lng, altAgl: p.altAgl, altAmsl: p.altAgl, elevation: 0, pass: p.pass, turnS: p.turnS, fast: p.fast };
    });
    const centroid = current.polygon.length >= 3 ? polygonCentroid(current.polygon) : base;

    return {
      id: `sec-${i + 1}`,
      index: i,
      droneId: spec.id,
      droneName: spec.name,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      polygon: current.polygon.map(toLatLng),
      areaKm2: round(polygonArea(current.polygon) / 1e6, 3),
      altitudeAgl: b.ctx.altitudeAgl,
      echelon: b.ctx.echelon,
      waypoints,
      pathLengthKm: round(route.pathM / 1000, 2),
      scanMinutes: round(est.scanSec / 60, 1),
      transitInKm: round(route.inM / 1000, 2),
      returnKm: round(route.outM / 1000, 2),
      estimatedMinutes: round(est.totalSec / 60, 1),
      sorties: Number.isFinite(est.sorties) ? est.sorties : 0,
      rangeCorrected,
      uncoveredKm2: round(uncoveredKm2, 3),
      distanceFromBaseKm: round(Math.hypot(centroid.x - base.x, centroid.y - base.y) / 1000, 2),
      flightCoefficient: b.ctx.scout.analysis.flightCoefficient,
      sweepDeg: route.sweepDeg,
      turns: route.turns,
      pass1Km: route.passKm[0],
      pass2Km: route.passKm[1],
      expectedFindMinutes: route.mass > 0 ? round(route.weightedTime / route.mass / 60, 1) : 0,
      t50Minutes: round(route.t50 / 60, 1),
      t80Minutes: round(route.t80 / 60, 1),
      notes,
    };
  });

  const finishTimes = sectors.map((s) => s.estimatedMinutes).filter((t) => Number.isFinite(t) && t > 0);
  const finishMinutes = finishTimes.length ? Math.max(...finishTimes) : 0;
  const finishSpreadMinutes = finishTimes.length ? round(finishMinutes - Math.min(...finishTimes), 1) : 0;
  const coveredM2 = sectors.reduce((s, x) => s + x.areaKm2 * 1e6, 0);
  const expectedFindMinutes = totalMass > 0 ? round(totalWeighted / totalMass / 60, 1) : 0;
  const baselineExpectedFindMinutes = baseMass > 0 ? round(baseWeighted / baseMass / 60, 1) : 0;

  warnings.unshift(
    `Podział wachlarzowy ze Strefy Zero: przeloty nie przecinają cudzych sektorów, szacowany powrót całej floty po ~${round(finishMinutes, 0)} min (rozrzut ${finishSpreadMinutes} min).`
  );
  const gain = baselineExpectedFindMinutes > 0 ? Math.round((1 - expectedFindMinutes / baselineExpectedFindMinutes) * 100) : 0;
  warnings.splice(
    1,
    0,
    `Oczekiwany czas dotarcia nad miejsce pobytu osoby: ${expectedFindMinutes} min (zwykła żmija bez priorytetów${mode === 'dwuprzebiegowy' ? ' i rozpoznania' : ''}: ${baselineExpectedFindMinutes} min${gain > 0 ? `, szybciej o ${gain}%` : ''}).`
  );
  if (mode === 'dwuprzebiegowy' && hasPriority) {
    warnings.push('Tereny o niskim priorytecie są przeszukiwane tylko rozpoznaniem termowizyjnym; przeszukanie dokładne obejmuje strefy priorytetowe i sygnały z rozpoznania.');
  }
  if (!hasPriority) {
    warnings.push('Brak mapy priorytetów – cała strefa ma równe prawdopodobieństwo. Wyznacz priorytety z mapy lub zaznacz strefy, aby najpierw przeszukać miejsca najbardziej zagrożone.');
  }
  const sortieCounts = [...new Set(sectors.map((s) => s.sorties))].sort((a, b) => a - b);
  if (sortieCounts.length > 1) {
    const most = sortieCounts[sortieCounts.length - 1];
    warnings.push(
      `Łączna bateria floty nie wystarcza, by wszyscy skończyli w tej samej liczbie wylotów – ${most} wyloty: ${sectors
        .filter((s) => s.sorties === most)
        .map((s) => s.droneName)
        .join(', ')}. Dodaj drona, zmniejsz strefę${mode === 'dwuprzebiegowy' ? ' lub wybierz tryb jednoprzebiegowy' : ''}, aby cała flota wróciła jednocześnie.`
    );
  } else if (finishSpreadMinutes > Math.max(2, finishMinutes * 0.08)) {
    const early = sectors.filter((s) => s.estimatedMinutes < finishMinutes - 2);
    warnings.push(
      `Bateria ogranicza wyrównanie: ${early.map((s) => `${s.droneName} (${s.estimatedMinutes} min)`).join(', ')} – krótszy lot na jednym akumulatorze. Dodaj drona do floty, aby wszyscy wrócili jednocześnie.`
    );
  }
  if (n > 1) {
    warnings.push(`Między sektorami utworzono bufory bezpieczeństwa ${SECTOR_BUFFER_M} m, sąsiednie drony lecą na różnych echelonach (+${ECHELON_STEP_M} m).`);
  }

  return {
    sectors,
    warnings,
    stats: {
      areaKm2: round(totalAreaM2 / 1e6, 3),
      coveredKm2: round(coveredM2 / 1e6, 3),
      uncoveredKm2: round(Math.max(0, totalAreaM2 - coveredM2) / 1e6, 3),
      finishMinutes: round(finishMinutes, 1),
      finishSpreadMinutes,
      expectedFindMinutes,
      baselineExpectedFindMinutes,
    },
  };
};

/**
 * 4.3 – weryfikacja 3D: pobranie wysokości terenu i dostosowanie pułapu do najwyższego
 * punktu w otoczeniu (zapas nad drzewami i liniami energetycznymi zapewnia minimalne AGL).
 */
export const applyTerrain = async (
  sectors: Sector[]
): Promise<{ terrainMin: number; terrainMax: number; source: 'open-meteo' | 'brak'; warnings: string[] }> => {
  const warnings: string[] = [];
  const all = sectors.flatMap((s) => s.waypoints);
  const elevations = await fetchElevations(all.map((w) => ({ lat: w.lat, lng: w.lng })));
  if (!elevations) {
    warnings.push('Brak danych wysokościowych terenu – pułap liczony względem Strefy Zero, wymagana ostrożność w terenie górzystym.');
    return { terrainMin: 0, terrainMax: 0, source: 'brak', warnings };
  }
  let k = 0;
  for (const s of sectors) {
    const elev = s.waypoints.map(() => elevations[k++]);
    s.waypoints.forEach((w, i) => {
      const local = Math.max(elev[i], elev[i - 1] ?? elev[i], elev[i + 1] ?? elev[i]);
      w.elevation = round(elev[i], 1);
      w.altAmsl = round(local + w.altAgl, 1);
    });
    if (elev.length) {
      const relief = Math.max(...elev) - Math.min(...elev);
      if (relief > 40) {
        s.notes.push(`Deniwelacja terenu ${round(relief, 0)} m – pułap automatycznie podnoszony nad wzniesieniami.`);
      }
    }
  }
  return {
    terrainMin: round(Math.min(...elevations), 0),
    terrainMax: round(Math.max(...elevations), 0),
    source: 'open-meteo',
    warnings,
  };
};

export const polygonAreaKm2 = (area: LatLng[]): number => {
  if (area.length < 3) return 0;
  const proj = new LocalProjection(area[0][0], area[0][1]);
  return round(polygonArea(area.map((p) => proj.toXY(p))) / 1e6, 3);
};

export const areaCentroidLatLng = (area: LatLng[]): { lat: number; lng: number } => {
  const proj = new LocalProjection(area[0][0], area[0][1]);
  const c = polygonCentroid(area.map((p) => proj.toXY(p)));
  const [lat, lng] = proj.toLatLng(c);
  return { lat, lng };
};

export const distanceKm = haversineKm;
