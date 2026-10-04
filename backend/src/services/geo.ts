import type { LatLng } from '../models/Mission';

export interface XY {
  x: number;
  y: number;
}

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQ = 111_320;

/**
 * Lokalna projekcja równoodległościowa (metry) wokół punktu odniesienia.
 * Dla obszarów o rozmiarze kilkunastu km błąd jest pomijalny.
 */
export class LocalProjection {
  private readonly cosLat: number;

  constructor(private readonly lat0: number, private readonly lng0: number) {
    this.cosLat = Math.cos((lat0 * Math.PI) / 180);
  }

  toXY([lat, lng]: LatLng): XY {
    return {
      x: (lng - this.lng0) * this.cosLat * M_PER_DEG_LNG_EQ,
      y: (lat - this.lat0) * M_PER_DEG_LAT,
    };
  }

  toLatLng({ x, y }: XY): LatLng {
    return [this.lat0 + y / M_PER_DEG_LAT, this.lng0 + x / (this.cosLat * M_PER_DEG_LNG_EQ)];
  }
}

export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const bearingDeg = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/** Przesunięcie punktu o zadaną odległość (m) w kierunku celu; zwraca [punkt, czyOsiągnięto] */
export const moveTowards = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  meters: number
): { lat: number; lng: number; reached: boolean } => {
  const distM = haversineKm(from, to) * 1000;
  if (distM <= meters || distM < 0.5) return { lat: to.lat, lng: to.lng, reached: true };
  const f = meters / distM;
  return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f, reached: false };
};

export const signedArea = (poly: XY[]): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

export const polygonArea = (poly: XY[]): number => (poly.length < 3 ? 0 : Math.abs(signedArea(poly)));

export const polygonCentroid = (poly: XY[]): XY => {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
};

export const bbox = (poly: XY[]) => ({
  minX: Math.min(...poly.map((p) => p.x)),
  maxX: Math.max(...poly.map((p) => p.x)),
  minY: Math.min(...poly.map((p) => p.y)),
  maxY: Math.max(...poly.map((p) => p.y)),
});

/**
 * Przycięcie wielokąta półpłaszczyzną x <= value (keep='le') lub x >= value (keep='ge').
 * Algorytm Sutherlanda–Hodgmana – poprawny również dla wielokątów wklęsłych (pole zachowane).
 */
export const clipX = (poly: XY[], value: number, keep: 'le' | 'ge'): XY[] => {
  const inside = (p: XY) => (keep === 'le' ? p.x <= value : p.x >= value);
  const out: XY[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn !== prevIn) {
      const t = (value - prev.x) / (cur.x - prev.x);
      out.push({ x: value, y: prev.y + t * (cur.y - prev.y) });
    }
    if (curIn) out.push(cur);
  }
  return out;
};

export const clipStrip = (poly: XY[], from: number, to: number): XY[] => clipX(clipX(poly, from, 'ge'), to, 'le');

/** Przycięcie wielokąta wypukłym wielokątem (np. okręgiem zasięgu radiowego) */
export const clipConvex = (subject: XY[], clip: XY[]): XY[] => {
  let output = subject;
  const ccw = signedArea(clip) > 0;
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: XY) => {
      const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      return ccw ? c >= 0 : c <= 0;
    };
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curIn = side(cur);
      const prevIn = side(prev);
      if (curIn !== prevIn) {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) > 1e-12) {
          const t = ((a.x - prev.x) * ey - (a.y - prev.y) * ex) / denom;
          output.push({ x: prev.x + t * dx, y: prev.y + t * dy });
        }
      }
      if (curIn) output.push(cur);
    }
  }
  return output;
};

export const circlePolygon = (center: XY, radius: number, segments = 72): XY[] =>
  Array.from({ length: segments }, (_, i) => {
    const a = (2 * Math.PI * i) / segments;
    return { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) };
  });

export const pointInPolygon = (p: XY, poly: XY[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** Odcinki pionowej linii x=value leżące wewnątrz wielokąta (reguła parzystości) */
export const verticalIntervals = (poly: XY[], x: number): [number, number][] => {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
      const t = (x - a.x) / (b.x - a.x);
      ys.push(a.y + t * (b.y - a.y));
    }
  }
  ys.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ys.length; i += 2) out.push([ys[i], ys[i + 1]]);
  return out;
};

/** Różnica zbiorów przedziałów: a \ b */
export const subtractIntervals = (a: [number, number][], b: [number, number][]): [number, number][] => {
  let result = a.slice();
  for (const [b0, b1] of b) {
    const next: [number, number][] = [];
    for (const [a0, a1] of result) {
      if (b1 <= a0 || b0 >= a1) {
        next.push([a0, a1]);
        continue;
      }
      if (b0 > a0) next.push([a0, b0]);
      if (b1 < a1) next.push([b1, a1]);
    }
    result = next;
  }
  return result;
};

export const segmentsIntersect = (p1: XY, p2: XY, q1: XY, q2: XY): boolean => {
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

export const segmentCrossesPolygon = (a: XY, b: XY, poly: XY[]): boolean => {
  if (pointInPolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (segmentsIntersect(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  }
  return false;
};

export const swapXY = (p: XY): XY => ({ x: p.y, y: p.x });

/**
 * Przycięcie wielokąta półpłaszczyzną wyznaczoną przez prostą (punkt + kierunek).
 * keep = 'left' zachowuje punkty po lewej stronie kierunku (iloczyn wektorowy ≥ 0).
 */
export const clipHalfPlane = (poly: XY[], origin: XY, dir: XY, keep: 'left' | 'right'): XY[] => {
  const side = (p: XY) => {
    const c = dir.x * (p.y - origin.y) - dir.y * (p.x - origin.x);
    return keep === 'left' ? c : -c;
  };
  const out: XY[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const sc = side(cur);
    const sp = side(prev);
    if (sc >= 0 !== sp >= 0) {
      const t = sp / (sp - sc);
      out.push({ x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) });
    }
    if (sc >= 0) out.push(cur);
  }
  return out;
};

/** Obrót punktu o kąt (rad) wokół początku układu */
export const rotate = (p: XY, angle: number): XY => ({
  x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
  y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
});

const pointSegmentDistance = (p: XY, a: XY, b: XY): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Najmniejsza odległość punktu od wielokąta (0, gdy punkt leży wewnątrz) */
export const distanceToPolygon = (p: XY, poly: XY[]): number => {
  if (poly.length < 3) return Infinity;
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
};

/** Powiększenie wielokąta o margines (m) względem środka – margines bezpieczeństwa stref No-Fly */
export const inflatePolygon = (poly: XY[], margin: number): XY[] => {
  const c = polygonCentroid(poly);
  return poly.map((v) => {
    const dx = v.x - c.x;
    const dy = v.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: c.x + (dx * (len + margin)) / len, y: c.y + (dy * (len + margin)) / len };
  });
};

const segmentIntersection = (p1: XY, p2: XY, q1: XY, q2: XY): { t: number; point: XY } | null => {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((q1.x - p1.x) * s.y - (q1.y - p1.y) * s.x) / denom;
  const u = ((q1.x - p1.x) * r.y - (q1.y - p1.y) * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, point: { x: p1.x + t * r.x, y: p1.y + t * r.y } };
};

const pathLength = (pts: XY[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

/**
 * Objazd zapasowy, gdy końce odcinka leżą na granicy wielokąta (brak dwóch przecięć numerycznych):
 * trasa prowadzi przez wierzchołki – od najbliższego punktowi startu do najbliższego celowi, krótszą stroną.
 */
const walkAround = (a: XY, b: XY, poly: XY[]): XY[] | null => {
  if (poly.length < 3) return null;
  const nearest = (p: XY) => poly.reduce((best, v, i) => (Math.hypot(v.x - p.x, v.y - p.y) < Math.hypot(poly[best].x - p.x, poly[best].y - p.y) ? i : best), 0);
  const i = nearest(a);
  const j = nearest(b);
  const n = poly.length;
  const forward: XY[] = [];
  for (let k = i; ; k = (k + 1) % n) {
    forward.push(poly[k]);
    if (k === j) break;
  }
  const backward: XY[] = [];
  for (let k = i; ; k = (k - 1 + n) % n) {
    backward.push(poly[k]);
    if (k === j) break;
  }
  const len = (pts: XY[]) => pathLength([a, ...pts, b]);
  return len(forward) <= len(backward) ? forward : backward;
};

/**
 * Objazd przeszkody: zamiast przecinać wielokąt, trasa biegnie wzdłuż jego krawędzi
 * (krótszą stroną) od punktu wejścia do punktu wyjścia.
 */
export const detourAround = (a: XY, b: XY, poly: XY[]): XY[] | null => {
  const hits: { t: number; point: XY; edge: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const hit = segmentIntersection(a, b, poly[i], poly[(i + 1) % poly.length]);
    if (hit) hits.push({ ...hit, edge: i });
  }
  if (hits.length < 2) return walkAround(a, b, poly);
  hits.sort((p, q) => p.t - q.t);
  const entry = hits[0];
  const exit = hits[hits.length - 1];
  const n = poly.length;
  const forward: XY[] = [entry.point];
  for (let k = (entry.edge + 1) % n; ; k = (k + 1) % n) {
    forward.push(poly[k]);
    if (k === exit.edge) break;
  }
  forward.push(exit.point);
  const backward: XY[] = [entry.point];
  for (let k = entry.edge; ; k = (k - 1 + n) % n) {
    backward.push(poly[k]);
    if (k === (exit.edge + 1) % n) break;
  }
  backward.push(exit.point);
  return pathLength(forward) <= pathLength(backward) ? forward : backward;
};
