/**
 * Budowa tras skanowania w sektorze (krok 4.3):
 *  - kierunek linii dobierany osobno dla każdego przelotu: najmniej zawrotów i najkrótszy czas
 *    przy bieżącym wietrze (prędkość względem ziemi, znoszenie boczne),
 *  - kolejność linii wybierana spośród wszystkich wariantów „zacznij od linii k, potem jedna strona,
 *    potem druga” przez dokładne policzenie ważonego mapą priorytetów czasu przeszukania każdego
 *    fragmentu terenu – zwykła żmija jest jednym z wariantów, więc wynik nigdy nie jest od niej gorszy,
 *  - tryb dwuprzebiegowy: szybkie rozpoznanie wyżej (termowizja, szerszy pas) po całym sektorze,
 *    potem przeszukanie dokładne stref priorytetowych i sygnałów.
 */
import type { WeatherSnapshot } from '../models/Mission';
import { XY, bbox, detourAround, rotate, segmentCrossesPolygon, subtractIntervals, verticalIntervals } from './geo';

/** Czas zawrotu o 180° (hamowanie, obrót, przyspieszenie) [s] */
export const TURN_S_180 = 8;
/** Wysokość szybkiego rozpoznania termowizyjnego (+10 m na echelon) */
export const RECON_AGL = 105;
export const RECON_OVERLAP = 0.1;
export const DETAIL_OVERLAP = 0.2;
const ANGLE_STEP_DEG = 10;
const DENSIFY_TRANSIT_M = 250;

export interface PassSpec {
  pass: 1 | 2;
  altAgl: number;
  swath: number;
  /** Prędkość skanowania względem powietrza [m/s] */
  speed: number;
}

export interface RouteParams {
  cruise: number;
  wind: XY; // m/s, kierunek, W KTÓRYM wieje (x – wschód, y – północ)
  noFly: XY[][];
  weightAt: (p: XY) => number;
}

export interface RoutePoint extends XY {
  pass: 1 | 2;
  altAgl: number;
  turnS: number;
  fast: boolean;
}

export interface BuiltRoute {
  points: RoutePoint[];
  /** Czas od startu z bazy do ostatniego punktu trasy (bez powrotu) [s] */
  scanSec: number;
  /** Czas dolotu z bazy do pierwszego punktu [s] */
  inSec: number;
  inM: number;
  outM: number;
  pathM: number;
  passKm: [number, number];
  sweepDeg: number[];
  turns: number;
  detours: number;
  /** Ważony czas pierwszego przeszukania (masa prawdopodobieństwa × czas) i łączna masa */
  weightedTime: number;
  mass: number;
  /** Czasy, w których przeszukano 50% i 80% masy prawdopodobieństwa sektora [s] */
  t50: number;
  t80: number;
}

/** Wektor wiatru z odczytu meteo (kierunek meteorologiczny = skąd wieje) */
export const windVector = (w: WeatherSnapshot | null | undefined): XY => {
  if (!w || w.windDirection === undefined || w.windDirection === null) return { x: 0, y: 0 };
  const to = ((w.windDirection + 180) * Math.PI) / 180;
  return { x: w.windSpeed * Math.sin(to), y: w.windSpeed * Math.cos(to) };
};

/** Prędkość względem ziemi przy locie po kursie `dir` (wektor jednostkowy) z prędkością powietrzną v */
export const groundSpeed = (v: number, dir: XY, wind: XY): number => {
  const along = wind.x * dir.x + wind.y * dir.y;
  const cross = -wind.x * dir.y + wind.y * dir.x;
  if (Math.abs(cross) >= v * 0.95) return v * 0.2;
  return Math.max(v * 0.2, Math.sqrt(v * v - cross * cross) + along);
};

const unit = (a: XY, b: XY): XY => {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};
const angleBetween = (u: XY, v: XY) => Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
const turnSeconds = (u: XY | null, v: XY) => (u ? (TURN_S_180 * angleBetween(u, v)) / Math.PI : 0);

interface Line {
  a: XY;
  b: XY;
  lineIdx: number;
}

/** Linie skanowania pod kątem `angle` (rad, konwencja matematyczna) rozstawione co `swath` */
const sweepLines = (poly: XY[], angle: number, swath: number, noFly: XY[][]): Line[] => {
  const turn = Math.PI / 2 - angle;
  const local = poly.map((p) => rotate(p, turn));
  const nfz = noFly.map((z) => z.map((p) => rotate(p, turn)));
  const { minX, maxX } = bbox(local);
  const width = maxX - minX;
  const count = Math.max(1, Math.ceil(width / swath));
  const spacing = width / count;
  const lines: Line[] = [];
  for (let k = 0; k < count; k++) {
    const x = minX + spacing * (k + 0.5);
    let iv = verticalIntervals(local, x);
    for (const z of nfz) iv = subtractIntervals(iv, verticalIntervals(z, x));
    for (const [y0, y1] of iv) {
      if (y1 - y0 < 1) continue;
      lines.push({ a: rotate({ x, y: y0 }, -turn), b: rotate({ x, y: y1 }, -turn), lineIdx: k });
    }
  }
  return lines;
};

/** Szacowany czas żmii dla danego kierunku: przeloty w obie strony z wiatrem, zawroty i przejścia między liniami */
const sweepTime = (lines: Line[], spec: PassSpec, wind: XY) => {
  if (lines.length === 0) return 0;
  const dir = unit(lines[0].a, lines[0].b);
  const back = { x: -dir.x, y: -dir.y };
  const perM = 0.5 * (1 / groundSpeed(spec.speed, dir, wind) + 1 / groundSpeed(spec.speed, back, wind));
  const len = lines.reduce((s, l) => s + Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y), 0);
  const lineCount = new Set(lines.map((l) => l.lineIdx)).size;
  return len * perM + lines.length * TURN_S_180 + (lineCount - 1) * (spec.swath / spec.speed);
};

/** Kierunki linii posortowane od najkrótszego czasu przeszukania (zawroty + wiatr) */
const rankSweeps = (poly: XY[], spec: PassSpec, params: RouteParams): { angle: number; lines: Line[]; t: number }[] => {
  const out: { angle: number; lines: Line[]; t: number }[] = [];
  for (let deg = 0; deg < 180; deg += ANGLE_STEP_DEG) {
    const angle = (deg * Math.PI) / 180;
    const lines = sweepLines(poly, angle, spec.swath, params.noFly);
    if (lines.length === 0) continue;
    out.push({ angle, lines, t: sweepTime(lines, spec, params.wind) });
  }
  return out.sort((a, b) => a.t - b.t);
};

/** Wybór kierunku linii o najmniejszym czasie przeszukania (zawroty + wiatr) */
export const chooseSweep = (poly: XY[], spec: PassSpec, params: RouteParams): { angle: number; lines: Line[] } => {
  const best = rankSweeps(poly, spec, params)[0];
  return best ? { angle: best.angle, lines: best.lines } : { angle: 0, lines: [] };
};

/** Próbka wzdłuż odcinka linii: położenie (0..1), długość reprezentowana i wagi */
interface Sample {
  t: number;
  len: number;
  w: number;
  ew: number;
}

interface Seg {
  a: XY;
  b: XY;
  len: number;
  samples: Sample[];
}

/** Linia skanowania (jedna pozycja poprzeczna) – może składać się z kilku odcinków (strefy No-Fly, wklęsłości) */
interface Group {
  segs: Seg[];
}

const SAMPLE_M = 40;

const sampleSeg = (a: XY, b: XY, weightAt: (p: XY) => number, evalAt: (p: XY) => number): Seg => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.round(len / SAMPLE_M));
  const samples: Sample[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const w = weightAt(p);
    samples.push({ t, len: len / n, w, ew: evalAt === weightAt ? w : evalAt(p) });
  }
  return { a, b, len, samples };
};

/** Grupuje linie i (dla przeszukania dokładnego) zostawia tylko fragmenty o wadze ≥ progu */
const buildGroups = (
  lines: Line[],
  weightAt: (p: XY) => number,
  evalAt: (p: XY) => number,
  threshold: number | null
): Group[] => {
  const byIdx = new Map<number, Seg[]>();
  for (const l of lines) {
    const seg = sampleSeg(l.a, l.b, weightAt, evalAt);
    let parts: Seg[] = [seg];
    if (threshold !== null) {
      parts = [];
      let runStart = -1;
      for (let k = 0; k <= seg.samples.length; k++) {
        const hot = k < seg.samples.length && seg.samples[k].w >= threshold;
        if (hot && runStart < 0) runStart = k;
        if (!hot && runStart >= 0) {
          const n = seg.samples.length;
          const t0 = runStart / n;
          const t1 = k / n;
          const a = { x: l.a.x + (l.b.x - l.a.x) * t0, y: l.a.y + (l.b.y - l.a.y) * t0 };
          const b = { x: l.a.x + (l.b.x - l.a.x) * t1, y: l.a.y + (l.b.y - l.a.y) * t1 };
          if (Math.hypot(b.x - a.x, b.y - a.y) > 5) parts.push(sampleSeg(a, b, weightAt, evalAt));
          runStart = -1;
        }
      }
    }
    if (parts.length) byIdx.set(l.lineIdx, [...(byIdx.get(l.lineIdx) ?? []), ...parts]);
  }
  return [...byIdx.entries()].sort((x, y) => x[0] - y[0]).map(([, segs]) => ({ segs }));
};

interface SimResult {
  t: number;
  weighted: number;
  mass: number;
  end: XY;
  head: XY | null;
  turns: number;
  scanM: number;
  marks: { t: number; m: number }[];
}

/**
 * Dokładna ocena kolejności linii: czas (przeloty, zawroty, wiatr) i ważony czas przeszukania
 * każdego fragmentu terenu. W trybie `emit` zapisuje punkty trasy z objazdami stref No-Fly.
 */
const simulate = (
  groups: Group[],
  order: number[],
  start: XY,
  head0: XY | null,
  t0: number,
  spec: PassSpec,
  params: RouteParams,
  count: boolean,
  emit?: { points: RoutePoint[]; onDetour: () => void }
): SimResult => {
  let cur = start;
  let head = head0;
  let t = t0;
  let weighted = 0;
  let mass = 0;
  let turns = 0;
  let scanM = 0;
  const marks: { t: number; m: number }[] = [];

  const push = (p: XY, turnS: number, fast: boolean) => {
    emit?.points.push({ x: p.x, y: p.y, pass: spec.pass, altAgl: spec.altAgl, turnS: Math.round(turnS * 10) / 10, fast });
  };

  const travel = (to: XY) => {
    const d = Math.hypot(to.x - cur.x, to.y - cur.y);
    if (d < 1) return;
    const fast = d > 2 * spec.swath;
    let legs: XY[] = [to];
    if (emit) {
      const zone = params.noFly.find((z) => segmentCrossesPolygon(cur, to, z));
      const via = zone ? detourAround(cur, to, zone) : null;
      if (via) {
        legs = [...via, to];
        emit.onDetour();
      }
    }
    for (const p of legs) {
      const len = Math.hypot(p.x - cur.x, p.y - cur.y);
      if (len < 0.5) continue;
      const dir = unit(cur, p);
      const ts = turnSeconds(head, dir);
      if (ts > 0.5) turns++;
      if (emit) {
        const steps = Math.max(1, Math.ceil(len / DENSIFY_TRANSIT_M));
        for (let s = 1; s <= steps; s++) push({ x: cur.x + ((p.x - cur.x) * s) / steps, y: cur.y + ((p.y - cur.y) * s) / steps }, s === 1 ? ts : 0, fast);
      }
      t += ts + len / groundSpeed(fast ? params.cruise : spec.speed, dir, params.wind);
      head = dir;
      cur = p;
    }
  };

  for (const gi of order) {
    const g = groups[gi];
    // Kierunek przejścia linii: z tego końca, który jest bliżej bieżącej pozycji
    const first = g.segs[0];
    const last = g.segs[g.segs.length - 1];
    const ascending = Math.hypot(first.a.x - cur.x, first.a.y - cur.y) <= Math.hypot(last.b.x - cur.x, last.b.y - cur.y);
    const segs = ascending ? g.segs : [...g.segs].reverse();
    for (const s of segs) {
      const from = ascending ? s.a : s.b;
      const to = ascending ? s.b : s.a;
      travel(from);
      const dir = unit(from, to);
      const ts = turnSeconds(head, dir);
      if (ts > 0.5) turns++;
      t += ts;
      const gs = groundSpeed(spec.speed, dir, params.wind);
      if (count) {
        for (const sm of s.samples) {
          const along = (ascending ? sm.t : 1 - sm.t) * s.len;
          const at = t + along / gs;
          const m = sm.ew * sm.len;
          weighted += m * at;
          mass += m;
          marks.push({ t: at, m });
        }
      } else {
        // Ocena kolejności przelotu nieliczonego do metryki: wagi użyte do układania trasy
        for (const sm of s.samples) weighted += sm.w * sm.len * (t + ((ascending ? sm.t : 1 - sm.t) * s.len) / gs);
      }
      t += s.len / gs;
      scanM += s.len;
      push(to, ts, false);
      head = dir;
      cur = to;
    }
  }
  return { t, weighted, mass, end: cur, head, turns, scanM, marks };
};

/** Kandydaci kolejności linii: start od dowolnej linii, potem jedna strona, potem druga */
const candidateOrders = (n: number): number[][] => {
  const out: number[][] = [];
  const range = (a: number, b: number) => {
    const r: number[] = [];
    if (a <= b) for (let i = a; i <= b; i++) r.push(i);
    else for (let i = a; i >= b; i--) r.push(i);
    return r;
  };
  for (let k = 0; k < n; k++) {
    out.push([...range(k, n - 1), ...(k > 0 ? range(k - 1, 0) : [])]);
    if (k > 0 && k < n - 1) out.push([...range(k, 0), ...range(k + 1, n - 1)]);
  }
  out.push(range(n - 1, 0));
  return out;
};

export interface BuildRouteInput {
  poly: XY[];
  base: XY;
  passes: PassSpec[];
  /** Dla przelotu 2 w trybie dwuprzebiegowym: tylko fragmenty o wadze ≥ progu (gdy mapa priorytetów istnieje) */
  pass2Threshold: number | null;
  params: RouteParams;
  /** Wagi do oceny czasu odnalezienia (domyślnie te same co do układania kolejności) */
  evalWeightAt?: (p: XY) => number;
  /** Mapa priorytetów niejednorodna – kierunek linii dobierany także pod kątem czasu odnalezienia */
  prioritized?: boolean;
}

/** Waga kompromisu: średni czas odnalezienia vs łączny czas pracy (bateria, wspólny powrót) */
const TOTAL_TIME_WEIGHT = 0.15;

export const buildRoute = (input: BuildRouteInput): BuiltRoute => {
  const { poly, base, params } = input;
  const evalAt = input.evalWeightAt ?? params.weightAt;
  const points: RoutePoint[] = [];
  const sweepDeg: number[] = [];
  const passKm: [number, number] = [0, 0];
  let turns = 0;
  let detours = 0;
  let cur = base;
  let head: XY | null = null;
  let t = 0;
  let inSec = 0;
  let weightedTime = 0;
  let mass = 0;
  let marks: { t: number; m: number }[] = [];

  input.passes.forEach((spec, pi) => {
    const threshold = spec.pass === 2 && input.passes.length === 2 ? input.pass2Threshold : null;
    const count = pi === 0;
    const ranked = rankSweeps(poly, spec, params);
    if (ranked.length === 0) return;
    // Bez mapy priorytetów wystarcza kierunek o najmniejszym czasie; z mapą sprawdzamy też kierunek
    // prostopadły i ukośne – linie w poprzek pozwalają zacząć od odległej strefy priorytetowej
    const candidates = input.prioritized
      ? [0, 90, 45, 135]
          .map((off) => ((ranked[0].angle * 180) / Math.PI + off) % 180)
          .map((deg) => ranked.find((x) => Math.abs((x.angle * 180) / Math.PI - deg) < ANGLE_STEP_DEG / 2) ?? null)
          .filter((x): x is { angle: number; lines: Line[]; t: number } => !!x)
      : [ranked[0]];

    // Wybór kierunku i kolejności: najmniejszy ważony czas przeszukania z karą za wydłużenie trasy
    let best: { angle: number; groups: Group[]; order: number[]; score: number } | null = null;
    for (const cand of candidates) {
      const groups = buildGroups(cand.lines, params.weightAt, evalAt, threshold);
      if (groups.length === 0) continue;
      const totalW = groups.reduce((s0, g) => s0 + g.segs.reduce((q, x) => q + x.samples.reduce((z, sm) => z + sm.w * sm.len, 0), 0), 0);
      for (const order of candidateOrders(groups.length)) {
        const r = simulate(groups, order, cur, head, t, spec, params, count);
        const back = Math.hypot(r.end.x - base.x, r.end.y - base.y) / params.cruise;
        const m = count ? r.mass : totalW;
        const score = (m > 0 ? r.weighted / m : 0) + TOTAL_TIME_WEIGHT * (r.t + back);
        if (!best || score < best.score) best = { angle: cand.angle, groups, order, score };
      }
    }
    if (!best) return;
    sweepDeg.push(Math.round((((90 - (best.angle * 180) / Math.PI) % 180) + 180) % 180));

    const startCount = points.length;
    const r = simulate(best.groups, best.order, cur, head, t, spec, params, count, { points, onDetour: () => detours++ });
    if (pi === 0 && points.length > startCount) {
      // czas dolotu = czas do pierwszego punktu trasy (przelot z prędkością przelotową)
      const p0 = points[startCount];
      inSec = Math.hypot(p0.x - base.x, p0.y - base.y) / params.cruise;
    }
    turns += r.turns;
    passKm[spec.pass - 1] += r.scanM / 1000;
    if (count) {
      weightedTime = r.weighted;
      mass = r.mass;
      marks = r.marks;
    }
    t = r.t;
    cur = r.end;
    head = r.head;
  });

  const inM = points.length ? Math.hypot(points[0].x - base.x, points[0].y - base.y) : 0;
  const outM = Math.hypot(cur.x - base.x, cur.y - base.y);
  let pathM = 0;
  for (let i = 1; i < points.length; i++) pathM += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);

  marks.sort((a, b) => a.t - b.t);
  let acc = 0;
  let t50 = t;
  let t80 = t;
  let got50 = false;
  for (const mk of marks) {
    acc += mk.m;
    if (!got50 && acc >= mass * 0.5) {
      t50 = mk.t;
      got50 = true;
    }
    if (acc >= mass * 0.8) {
      t80 = mk.t;
      break;
    }
  }

  return {
    points,
    scanSec: t,
    inSec,
    inM,
    outM,
    pathM,
    passKm: [Math.round(passKm[0] * 100) / 100, Math.round(passKm[1] * 100) / 100],
    sweepDeg,
    turns,
    detours,
    weightedTime,
    mass,
    t50,
    t80,
  };
};
