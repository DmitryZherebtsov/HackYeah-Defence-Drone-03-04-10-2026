/**
 * Mapa priorytetów poszukiwań (teoria poszukiwań – rozkład prawdopodobieństwa obszaru, POA).
 * Siatka wag nad strefą łączy:
 *  - strefy zaznaczone przez koordynatora (wysoki / średni priorytet),
 *  - bliskość cieków wodnych z OpenStreetMap (osoby odcięte przez wodę),
 *  - gęstość zabudowy z OpenStreetMap (osoby w budynkach i na dachach).
 * Waga 1 oznacza teren bez przesłanek, wyższe wartości – większe prawdopodobieństwo obecności ludzi.
 */
import type { LatLng, MapFeatures, PriorityGrid, PriorityZone } from '../models/Mission';
import { LocalProjection, XY, bbox, pointInPolygon } from './geo';

/** Serwer główny i zapasowy Overpass – publiczne instancje bywają przeciążone (HTTP 429/504) */
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const USER_AGENT = 'SKK-drone-planner/1.0 (system koordynacji kryzysowej)';
const OVERPASS_ATTEMPT_TIMEOUT_MS = 25000;

export const ZONE_BONUS: Record<PriorityZone['level'], number> = { wysoki: 4, sredni: 2 };
const RIVER_WEIGHT = 2.5;
const RIVER_DECAY_M = 150;
const BUILDING_RADIUS_M = 75;
const BUILDING_WEIGHT_PER = 0.35;
const BUILDING_WEIGHT_MAX = 3;
/** Próg wagi, od którego komórka trafia do przeszukania dokładnego (drugi przelot) */
export const PRIORITY_THRESHOLD = 2;

const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

/** Jedno zapytanie Overpass: ponawiane przy przeciążeniu serwera, potem serwer zapasowy */
const overpass = async (query: string): Promise<any[]> => {
  let lastError: unknown = null;
  for (const url of OVERPASS_URLS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }).toString(),
          signal: AbortSignal.timeout(OVERPASS_ATTEMPT_TIMEOUT_MS),
        });
        if (res.ok) return ((await res.json()) as any).elements ?? [];
        lastError = new Error(`Overpass HTTP ${res.status}`);
        // Błąd zapytania (np. 400) nie zniknie po ponowieniu – od razu kolejny serwer
        if (res.status !== 429 && res.status < 500) break;
      } catch (err) {
        lastError = err;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastError ?? new Error('Overpass niedostępny');
};

/**
 * Pobiera rzeki/kanały i budynki z OpenStreetMap (Overpass API) dla obszaru strefy.
 * Rzeki i budynki to osobne zapytania; z budynków potrzebny jest tylko środek (out center) –
 * w gęstej zabudowie (centrum miasta) pełna geometria tysięcy budynków przeciąża serwer.
 * Gdy budynków nie uda się pobrać, mapa priorytetów powstaje z samych cieków wodnych.
 */
export const fetchMapFeatures = async (area: LatLng[]): Promise<MapFeatures> => {
  const lats = area.map((p) => p[0]);
  const lngs = area.map((p) => p[1]);
  const pad = 0.003; // ok. 300 m – rzeka tuż za granicą strefy też podnosi priorytet
  const box = `${Math.min(...lats) - pad},${Math.min(...lngs) - pad},${Math.max(...lats) + pad},${Math.max(...lngs) + pad}`;

  // Kolejno, nie równolegle – Overpass ogranicza liczbę jednoczesnych zapytań z jednego adresu
  const settle = <T,>(p: Promise<T>) => p.then((value) => ({ status: 'fulfilled' as const, value }), (reason) => ({ status: 'rejected' as const, reason }));
  const waterResult = await settle(overpass(`[out:json][timeout:25];way["waterway"~"river|stream|canal|drain"](${box});out geom qt;`));
  const buildingResult = await settle(overpass(`[out:json][timeout:25];way["building"](${box});out center qt;`));
  if (waterResult.status === 'rejected' && buildingResult.status === 'rejected') throw waterResult.reason;

  const waterways: LatLng[][] = [];
  for (const el of waterResult.status === 'fulfilled' ? waterResult.value : []) {
    const geom: { lat: number; lon: number }[] = el.geometry ?? [];
    if (geom.length > 1) waterways.push(geom.map((g) => [round(g.lat), round(g.lon)] as LatLng));
  }
  const buildings: LatLng[] = [];
  for (const el of buildingResult.status === 'fulfilled' ? buildingResult.value : []) {
    if (el.center) buildings.push([round(el.center.lat), round(el.center.lon)]);
  }
  return { waterways, buildings, source: 'openstreetmap', fetchedAt: new Date().toISOString() };
};

const segDistance = (p: XY, a: XY, b: XY) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Buduje siatkę wag nad strefą poszukiwań */
export const computePriorityGrid = (area: LatLng[], zones: PriorityZone[], features: MapFeatures | null): PriorityGrid | null => {
  if (area.length < 3) return null;
  const lat0 = area.reduce((s, p) => s + p[0], 0) / area.length;
  const lng0 = area.reduce((s, p) => s + p[1], 0) / area.length;
  const proj = new LocalProjection(lat0, lng0);
  const poly = area.map((p) => proj.toXY(p));
  const b = bbox(poly);
  const areaM2 = (b.maxX - b.minX) * (b.maxY - b.minY);
  const cellM = Math.round(Math.min(250, Math.max(40, Math.sqrt(areaM2 / 1500))));
  const nx = Math.max(1, Math.ceil((b.maxX - b.minX) / cellM));
  const ny = Math.max(1, Math.ceil((b.maxY - b.minY) / cellM));

  const zonePolys = zones.filter((z) => z.polygon.length >= 3).map((z) => ({ level: z.level, poly: z.polygon.map((p) => proj.toXY(p)) }));
  const rivers = (features?.waterways ?? []).map((w) => w.map((p) => proj.toXY(p)));

  // Liczba budynków w komórkach siatki pomocniczej – szybkie liczenie gęstości w promieniu
  const counts = new Map<string, number>();
  const bcell = BUILDING_RADIUS_M;
  for (const bp of features?.buildings ?? []) {
    const p = proj.toXY(bp);
    const key = `${Math.floor(p.x / bcell)}:${Math.floor(p.y / bcell)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buildingsNear = (p: XY) => {
    const cx = Math.floor(p.x / bcell);
    const cy = Math.floor(p.y / bcell);
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) n += counts.get(`${cx + dx}:${cy + dy}`) ?? 0;
    return n / 9; // średnio na komórkę 75×75 m
  };

  const weights: number[] = new Array(nx * ny).fill(0);
  let minW = Infinity;
  let maxW = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = { x: b.minX + (i + 0.5) * cellM, y: b.minY + (j + 0.5) * cellM };
      if (!pointInPolygon(c, poly)) continue;
      let w = 1;
      if (rivers.length) {
        let d = Infinity;
        for (const r of rivers) for (let k = 1; k < r.length; k++) d = Math.min(d, segDistance(c, r[k - 1], r[k]));
        w += RIVER_WEIGHT * Math.exp(-d / RIVER_DECAY_M);
      }
      if (counts.size) w += Math.min(BUILDING_WEIGHT_MAX, buildingsNear(c) * BUILDING_WEIGHT_PER * 3);
      let bonus = 0;
      for (const z of zonePolys) if (pointInPolygon(c, z.poly)) bonus = Math.max(bonus, ZONE_BONUS[z.level]);
      w += bonus;
      w = Math.round(w * 100) / 100;
      weights[j * nx + i] = w;
      minW = Math.min(minW, w);
      maxW = Math.max(maxW, w);
    }
  }
  if (!Number.isFinite(minW)) return null;

  const sources: string[] = [];
  if (zonePolys.length) sources.push(`${zonePolys.length} stref koordynatora`);
  if (rivers.length) sources.push(`${rivers.length} cieków wodnych`);
  if (counts.size) sources.push(`${features?.buildings.length ?? 0} budynków`);

  return {
    cellM,
    lat0,
    lng0,
    minX: b.minX,
    minY: b.minY,
    nx,
    ny,
    weights,
    minWeight: minW,
    maxWeight: maxW,
    uniform: maxW - minW < 0.05,
    sources,
  };
};

/** Funkcja wagi w układzie lokalnym planera (inna projekcja niż siatki – przeliczamy przez lat/lng) */
export const makeWeightFn = (grid: PriorityGrid | null, fromXY: (p: XY) => LatLng): ((p: XY) => number) => {
  if (!grid || grid.uniform) return () => 1;
  const proj = new LocalProjection(grid.lat0, grid.lng0);
  return (p: XY) => {
    const g = proj.toXY(fromXY(p));
    const i = Math.floor((g.x - grid.minX) / grid.cellM);
    const j = Math.floor((g.y - grid.minY) / grid.cellM);
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return grid.minWeight;
    return grid.weights[j * grid.nx + i] || grid.minWeight;
  };
};

/** Środki komórek z wagami – do wyświetlania mapy cieplnej i losowania prawdy terenowej */
export const gridCells = (grid: PriorityGrid): { lat: number; lng: number; w: number }[] => {
  const proj = new LocalProjection(grid.lat0, grid.lng0);
  const out: { lat: number; lng: number; w: number }[] = [];
  for (let j = 0; j < grid.ny; j++) {
    for (let i = 0; i < grid.nx; i++) {
      const w = grid.weights[j * grid.nx + i];
      if (!w) continue;
      const [lat, lng] = proj.toLatLng({ x: grid.minX + (i + 0.5) * grid.cellM, y: grid.minY + (j + 0.5) * grid.cellM });
      out.push({ lat: round(lat), lng: round(lng), w });
    }
  }
  return out;
};
