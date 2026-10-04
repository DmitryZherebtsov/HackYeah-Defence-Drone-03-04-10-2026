/**
 * Symulowana transmisja z kamery drona dla koordynatora. Obraz jest generowany z telemetrii
 * i wyników analizy drona – każda czynność i każdy wynik pomiaru jest podpisany na obrazie.
 */
import React, { useId, useMemo } from 'react';
import {
  CRITICALITY_STYLES,
  Criticality,
  Delivery,
  Detection,
  DroneRuntime,
  FeedLine,
  MissionData,
  PAYLOAD_LABELS,
  PHASE_LABELS,
  PROCEDURE_STAGE_LABELS,
  ProcedureStage,
} from '../../types/drones';
import { formatSim } from './DroneUi';

const VW = 960;
const VH = 540;

type Palette = {
  far: string;
  water: string;
  waterHi: string;
  object: string;
  objectHi: string;
  roof: string;
  trunk: string;
  foliage: string;
  house: string;
  tree: string;
  street: string;
  person: string;
  skin: string;
};

const PALETTE: Record<'ir' | 'rgb', Palette> = {
  ir: {
    far: '#140b33',
    water: '#1e1b4b',
    waterHi: '#4338ca',
    object: '#3b2a7a',
    objectHi: '#5b3fa8',
    roof: '#4c1d95',
    trunk: '#3b0764',
    foliage: '#4c1d95',
    house: '#2e1065',
    tree: '#581c87',
    street: '#170f35',
    person: 'url(#cam-hot)',
    skin: 'url(#cam-hot)',
  },
  rgb: {
    far: '#6b7a5e',
    water: '#6b5b3e',
    waterHi: '#a8956a',
    object: '#a8a29e',
    objectHi: '#d6d3d1',
    roof: '#9a3412',
    trunk: '#78350f',
    foliage: '#166534',
    house: '#b45309',
    tree: '#15803d',
    street: '#57534e',
    person: '#dc2626',
    skin: '#fcd9b6',
  },
};

const LEVEL_TEXT: Record<FeedLine['level'], string> = {
  info: 'text-slate-200',
  sukces: 'text-emerald-300',
  ostrzezenie: 'text-amber-300',
  krytyczny: 'text-red-400',
};

const CRIT_HUD: Record<Criticality, string> = {
  krytyczny: 'bg-red-600 text-white',
  umiarkowany: 'bg-amber-500 text-black',
  niski: 'bg-sky-600 text-white',
};

const POSITION_TEXT: Record<Detection['position'], string> = { w_wodzie: 'W WODZIE', na_dachu: 'NA DACHU', na_podwyzszeniu: 'NA PODWYŻSZENIU' };

const distKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

// ---------- Widok z lotu: zalany teren przesuwający się pod dronem ----------

const seeded = (seed: number) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const TerrainTile: React.FC<{ seed: number; p: Palette }> = ({ seed, p }) => {
  const items = useMemo(() => {
    const rnd = seeded(seed);
    const houses = Array.from({ length: 7 }, () => ({ x: rnd() * 360, y: rnd() * 360, w: 36 + rnd() * 40, h: 28 + rnd() * 26, r: rnd() * 40 - 20 }));
    const trees = Array.from({ length: 12 }, () => ({ x: rnd() * 400, y: rnd() * 400, r: 7 + rnd() * 10 }));
    const street = { y: 60 + rnd() * 280, tilt: rnd() * 60 - 30 };
    return { houses, trees, street };
  }, [seed]);
  return (
    <>
      <rect width="400" height="400" fill={p.water} />
      <line x1="0" y1={items.street.y} x2="400" y2={items.street.y + items.street.tilt} stroke={p.street} strokeWidth="18" opacity="0.6" />
      {items.trees.map((t, i) => (
        <circle key={`t${i}`} cx={t.x} cy={t.y} r={t.r} fill={p.tree} opacity="0.85" />
      ))}
      {items.houses.map((h, i) => (
        <g key={`h${i}`} transform={`rotate(${h.r} ${h.x + h.w / 2} ${h.y + h.h / 2})`}>
          <rect x={h.x} y={h.y} width={h.w} height={h.h} fill={p.house} stroke={p.waterHi} strokeOpacity="0.3" />
          <line x1={h.x} y1={h.y + h.h / 2} x2={h.x + h.w} y2={h.y + h.h / 2} stroke="#000" strokeOpacity="0.25" />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <path key={`w${i}`} d={`M 0 ${80 + i * 120} q 50 -8 100 0 t 100 0 t 100 0 t 100 0`} stroke={p.waterHi} strokeOpacity="0.25" fill="none" />
      ))}
    </>
  );
};

// ---------- Prawdziwe zdjęcia satelitarne terenu pod dronem (Esri World Imagery) ----------

export const IMAGERY_ATTRIBUTION = 'Zdjęcia: Esri, Maxar, Earthstar Geographics';
const TILE_URL = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const CAMERA_FOV_DEG = 70;
/** Kotwica układu lokalnego zmienia się co tyle kafli – małe liczby w transformacjach CSS (bez drgań precyzji) */
const ANCHOR_STEP = 16;

const worldPx = (lat: number, lng: number, z: number) => {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

/**
 * Kurs bez skoku 359° → 0°. Drobne korekty kursu obracają obraz płynnie, a zawroty na końcu linii
 * skanowania (duża zmiana) – natychmiast, żeby obraz nie „wirował”.
 */
const useSmoothHeading = (heading: number) => {
  const ref = React.useRef({ rot: heading, smooth: false });
  const prev = ref.current.rot;
  const delta = ((((heading - prev) % 360) + 540) % 360) - 180;
  if (delta !== 0) ref.current = { rot: prev + delta, smooth: Math.abs(delta) <= 30 };
  return ref.current;
};

const SatelliteLayer: React.FC<{ lat: number; lng: number; heading: number; altAgl: number; ir: boolean; onLoaded?: () => void }> = ({
  lat,
  lng,
  heading,
  altAgl,
  ir,
  onLoaded,
}) => {
  const filterId = `${useId().replace(/:/g, '')}-ir`;
  const { rot, smooth } = useSmoothHeading(heading);
  // Szerokość kadru na ziemi z wysokości lotu i kąta widzenia kamery
  const footprintM = 2 * Math.max(15, altAgl || 60) * Math.tan(((CAMERA_FOV_DEG / 2) * Math.PI) / 180);
  // Jeden poziom zbliżenia dla całego skanowania (60–110 m) – bez przeładowania kafli przy zmianie pułapu
  const z = altAgl > 0 && altAgl < 40 ? 19 : 18;
  const mPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
  const k = (VW / footprintM) * mPerPx;
  const c = worldPx(lat, lng, z);
  const ax = Math.floor(c.x / 256 / ANCHOR_STEP) * ANCHOR_STEP;
  const ay = Math.floor(c.y / 256 / ANCHOR_STEP) * ANCHOR_STEP;
  // Kafle pokrywające kadr po obrocie + zapas wczytywany z wyprzedzeniem (dron nie wlatuje w puste miejsca)
  const radius = Math.hypot(VW, VH) / 2 / k + 256 * 2.5;
  const tiles: { x: number; y: number }[] = [];
  for (let tx = Math.floor((c.x - radius) / 256); tx <= Math.floor((c.x + radius) / 256); tx++) {
    for (let ty = Math.floor((c.y - radius) / 256); ty <= Math.floor((c.y + radius) / 256); ty++) tiles.push({ x: tx, y: ty });
  }
  const lx = c.x - ax * 256;
  const ly = c.y - ay * 256;
  return (
    <>
      <defs>
        {/* Termowizja: jasność zdjęcia → paleta „ironbow” */}
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.04 0.25 0.7 0.98 1" />
            <feFuncG type="table" tableValues="0.02 0.04 0.2 0.6 0.97" />
            <feFuncB type="table" tableValues="0.12 0.4 0.42 0.12 0.7" />
          </feComponentTransfer>
        </filter>
      </defs>
      <g filter={ir ? `url(#${filterId})` : undefined}>
        {/* Obrót wg kursu (kierunek lotu = góra kadru) oddzielnie od przesunięcia */}
        <g
          style={{
            transformBox: 'view-box',
            transformOrigin: '0 0',
            transform: `translate(${VW / 2}px, ${VH / 2}px) rotate(${-rot}deg)`,
            transition: smooth ? 'transform 1s ease-out' : 'none',
          }}
        >
          <g
            key={`${z}:${ax}:${ay}`}
            style={{
              transformBox: 'view-box',
              transformOrigin: '0 0',
              transform: `scale(${k}) translate(${-lx}px, ${-ly}px)`,
              transition: 'transform 1s linear',
            }}
          >
            {tiles.map((t) => (
              <image
                key={`${t.x}:${t.y}`}
                href={TILE_URL(z, t.x, t.y)}
                x={(t.x - ax) * 256}
                y={(t.y - ay) * 256}
                width="256.6"
                height="256.6"
                preserveAspectRatio="none"
                onLoad={onLoaded}
              />
            ))}
          </g>
        </g>
      </g>
      {/* Lekki odcień wody – teren w strefie zalewowej */}
      {!ir && <rect width={VW} height={VH} fill="#5b4a2e" opacity="0.14" />}
    </>
  );
};

const FlightScene: React.FC<{ drone: DroneRuntime; ir: boolean; zoom?: boolean; scan?: boolean }> = ({ drone, ir, zoom, scan }) => {
  const p = PALETTE[ir ? 'ir' : 'rgb'];
  const seed = hash(drone.droneId);
  const speed = zoom ? 0 : drone.speed;
  const dur = speed > 12 ? 3 : speed > 6 ? 5 : speed > 0.5 ? 9 : 0;
  const scale = Math.max(0.6, Math.min(1.7, 60 / Math.max(20, drone.altAgl || 60)));
  // Teren rysowany tylko do pierwszego wczytanego zdjęcia (albo stale, gdy brak dostępu do zdjęć)
  const [imagery, setImagery] = React.useState(false);
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
      <rect width={VW} height={VH} fill={imagery ? (ir ? '#140b33' : '#3f3a2e') : p.water} />
      <g style={zoom ? { animation: 'cam-zoom 2s ease-out forwards', transformOrigin: '480px 270px' } : undefined}>
        <g style={{ transform: `scale(${scale})`, transformOrigin: '480px 270px', transition: 'transform 1.5s ease', display: imagery ? 'none' : undefined }}>
          <g style={dur ? { animation: `cam-scroll ${dur}s linear infinite` } : undefined}>
            {[0, 400, 800].map((y) =>
              [-220, 180, 580, 980].map((x) => (
                <g key={`${x}:${y}`} transform={`translate(${x} ${y - 400})`}>
                  <TerrainTile seed={seed + ((x + 220) / 400) * 7 + (y / 400) * 3} p={p} />
                </g>
              ))
            )}
          </g>
        </g>
        <SatelliteLayer lat={drone.lat} lng={drone.lng} heading={drone.heading} altAgl={drone.altAgl} ir={ir} onLoaded={imagery ? undefined : () => setImagery(true)} />
      </g>
      {scan && (
        <>
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={i} x1={i * 120} y1="0" x2={i * 120} y2={VH} stroke="#22d3ee" strokeOpacity="0.08" />
          ))}
          <rect x="0" y="0" width={VW} height="4" fill="#22d3ee" opacity="0.7" style={{ animation: 'cam-scan 2.6s linear infinite' }} />
        </>
      )}
    </svg>
  );
};

const Reticle: React.FC<{ label: string; sub?: string; hot?: boolean; ir: boolean }> = ({ label, sub, hot, ir }) => {
  const blobId = `${useId().replace(/:/g, '')}-blob`;
  return (
  <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 w-full h-full pointer-events-none">
    <defs>
      <radialGradient id={blobId}>
        <stop offset="0%" stopColor={ir ? '#fff7ae' : '#fca5a5'} />
        <stop offset="45%" stopColor={ir ? '#fb923c' : '#dc2626'} />
        <stop offset="100%" stopColor={ir ? '#7c2d12' : '#7f1d1d'} stopOpacity="0" />
      </radialGradient>
    </defs>
    {hot && <ellipse cx="480" cy="275" rx="26" ry="34" fill={`url(#${blobId})`} style={{ animation: 'cam-blink 1.2s infinite' }} />}
    <g stroke="#facc15" strokeWidth="2.5" fill="none">
      <path d="M 420 225 h -18 v 18 M 540 225 h 18 v 18 M 420 325 h -18 v -18 M 540 325 h 18 v -18" />
      <circle cx="480" cy="275" r="6" />
    </g>
    <text x="480" y="208" textAnchor="middle" fill="#facc15" fontSize="15" fontWeight="700" fontFamily="monospace">
      {label}
    </text>
    {sub && (
      <text x="480" y="352" textAnchor="middle" fill="#fde68a" fontSize="13" fontFamily="monospace">
        {sub}
      </text>
    )}
  </svg>
  );
};

// ---------- Zbliżenie na osobę: obiekt, woda, pomiary ----------

type Arms = 'down' | 'both' | 'one';

const Person: React.FC<{ x: number; feetY: number; P: number; arms: Arms; p: Palette; bob?: boolean }> = ({ x, feetY, P, arms, p, bob }) => {
  const headR = P * 0.085;
  const headCy = feetY - P + headR;
  const neckY = headCy + headR;
  const shoulderY = neckY + P * 0.04;
  const hipY = feetY - P * 0.47;
  const tw = P * 0.2;
  const armW = P * 0.055;
  const down = (s: number) => `M ${x + s * tw * 0.42} ${shoulderY} L ${x + s * tw * 0.78} ${hipY + P * 0.03}`;
  const up = (s: number) => `M ${x + s * tw * 0.42} ${shoulderY} L ${x + s * tw * 0.95} ${headCy - headR - P * 0.15}`;
  const wave = { transformBox: 'view-box' as const, transformOrigin: `${x}px ${shoulderY}px`, animation: 'cam-wave-arm 0.7s ease-in-out infinite' };
  return (
    <g style={bob ? { animation: 'cam-bob 2.2s ease-in-out infinite' } : undefined}>
      <rect x={x - tw * 0.42} y={hipY} width={tw * 0.36} height={feetY - hipY} rx={tw * 0.12} fill={p.person} opacity="0.92" />
      <rect x={x + tw * 0.06} y={hipY} width={tw * 0.36} height={feetY - hipY} rx={tw * 0.12} fill={p.person} opacity="0.92" />
      <rect x={x - tw / 2} y={neckY} width={tw} height={hipY - neckY + P * 0.04} rx={tw * 0.3} fill={p.person} />
      {arms === 'down' && <path d={`${down(-1)} ${down(1)}`} stroke={p.person} strokeWidth={armW} strokeLinecap="round" fill="none" />}
      {arms === 'both' && (
        <g style={wave}>
          <path d={`${up(-1)} ${up(1)}`} stroke={p.person} strokeWidth={armW} strokeLinecap="round" fill="none" />
        </g>
      )}
      {arms === 'one' && (
        <>
          <path d={down(-1)} stroke={p.person} strokeWidth={armW} strokeLinecap="round" fill="none" />
          <g style={wave}>
            <path d={up(1)} stroke={p.person} strokeWidth={armW} strokeLinecap="round" fill="none" />
          </g>
        </>
      )}
      <circle cx={x} cy={headCy} r={headR} fill={p.skin} />
    </g>
  );
};

const ObjectShape: React.FC<{ label: string; cx: number; feetY: number; spread: number; P: number; p: Palette; irMode: boolean }> = ({
  label,
  cx,
  feetY,
  spread,
  P,
  p,
  irMode,
}) => {
  const bottom = VH + 20;
  const ir = () => irMode;
  const l = label.toLowerCase();
  if (l.includes('mieszkaln') || l === 'dach budynku') {
    return (
      <g>
        <rect x={cx - 230} y={feetY + 95} width="460" height={bottom - feetY} fill={p.object} />
        {[0, 1].map((i) => (
          <rect key={i} x={cx - 170 + i * 250} y={feetY + 130} width="90" height="70" fill={p.water} opacity="0.55" stroke={p.objectHi} />
        ))}
        <polygon points={`${cx - 270},${feetY + 105} ${cx - spread - 30},${feetY} ${cx + spread + 30},${feetY} ${cx + 270},${feetY + 105}`} fill={p.roof} />
        {[1, 2, 3].map((i) => (
          <line key={i} x1={cx - 270 + i * 18} y1={feetY + 105 - i * 26} x2={cx + 270 - i * 18} y2={feetY + 105 - i * 26} stroke="#000" strokeOpacity="0.18" />
        ))}
        <rect x={cx + 150} y={feetY - 10} width="30" height="70" fill={p.objectHi} />
      </g>
    );
  }
  if (l.includes('garaż')) {
    return (
      <g>
        <rect x={cx - 210} y={feetY} width="420" height={bottom - feetY} fill={p.object} />
        <rect x={cx - 215} y={feetY - 6} width="430" height="12" fill={p.roof} />
        <rect x={cx - 120} y={feetY + 40} width="240" height="160" fill={p.objectHi} opacity="0.5" />
      </g>
    );
  }
  if (l.includes('samochod')) {
    return (
      <g>
        <rect x={cx - 190} y={feetY + 48} width="380" height="70" rx="22" fill={ir() ? p.objectHi : '#1d4ed8'} />
        <rect x={cx - 120} y={feetY} width="240" height="56" rx="18" fill={ir() ? p.objectHi : '#1e40af'} />
        <rect x={cx - 105} y={feetY + 12} width="95" height="34" rx="6" fill={ir() ? p.object : '#93c5fd'} opacity="0.8" />
        <rect x={cx + 10} y={feetY + 12} width="95" height="34" rx="6" fill={ir() ? p.object : '#93c5fd'} opacity="0.8" />
      </g>
    );
  }
  if (l.includes('altana')) {
    return (
      <g>
        <polygon points={`${cx - 220},${feetY + 50} ${cx - spread - 40},${feetY} ${cx + spread + 40},${feetY} ${cx + 220},${feetY + 50}`} fill={p.roof} />
        {[-180, -60, 60, 180].map((dx) => (
          <rect key={dx} x={cx + dx - 7} y={feetY + 50} width="14" height={bottom - feetY} fill={p.trunk} />
        ))}
      </g>
    );
  }
  if (l.includes('drzew')) {
    return (
      <g>
        <circle cx={cx + 40} cy={feetY - P * 0.7} r={P * 0.95} fill={p.foliage} opacity="0.75" />
        <circle cx={cx - P * 0.6} cy={feetY - P * 0.35} r={P * 0.6} fill={p.foliage} opacity="0.6" />
        <rect x={cx + spread + 50} y={feetY - P * 0.8} width="38" height={bottom - feetY + P} fill={p.trunk} />
        <rect x={cx - spread - 70} y={feetY} width={spread * 2 + 160} height="18" rx="8" fill={p.trunk} />
      </g>
    );
  }
  if (l.includes('mur')) {
    return (
      <g>
        <rect x={cx - 240} y={feetY} width="480" height={bottom - feetY} fill={p.object} />
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={i} x1={cx - 240} y1={feetY + 18 + i * 22} x2={cx + 240} y2={feetY + 18 + i * 22} stroke="#000" strokeOpacity="0.2" />
        ))}
      </g>
    );
  }
  return <rect x={cx - 200} y={feetY} width="400" height={bottom - feetY} fill={p.object} />;
};

export interface Reveal {
  reached: (s: ProcedureStage) => boolean;
  done: (s: ProcedureStage) => boolean;
}

export const ALL_REVEALED: Reveal = { reached: () => true, done: () => true };

export const revealFor = (drone: DroneRuntime | null): Reveal => {
  const proc = drone?.procedure;
  if (!proc) return ALL_REVEALED;
  const cur = proc.stages.indexOf(proc.stage);
  const order = (s: ProcedureStage) => {
    const i = proc.stages.indexOf(s);
    // Etap pominięty (np. pomiar dla osoby w wodzie) nie blokuje kolejnych
    return i === -1 ? -1 : i;
  };
  return {
    reached: (s) => order(s) !== -1 && order(s) <= cur,
    done: (s) => order(s) !== -1 && order(s) < cur,
  };
};

const TargetScene: React.FC<{
  det: Detection;
  irMode: boolean;
  reveal: Reveal;
  deliveries: Delivery[];
  incoming?: { name: string; fraction: number } | null;
  speaking?: boolean;
}> = ({ det, irMode, reveal, deliveries, incoming, speaking }) => {
  const uid = useId().replace(/:/g, '');
  const hotId = `${uid}-hot`;
  const farId = `${uid}-far`;
  const p: Palette = irMode ? { ...PALETTE.ir, person: `url(#${hotId})`, skin: `url(#${hotId})` } : PALETTE.rgb;
  const a = det.assessment;
  const inWater = det.position === 'w_wodzie';
  const n = Math.max(1, Math.min(3, det.persons));

  // Geometria: wysokość sylwetki P odpowiada zmierzonym pikselom osoby, F – pikselom stopy → lustro wody
  let P = 150;
  let F = inWater ? 0 : a && a.freeboardPx !== null ? (P * a.freeboardPx) / a.personPx : P * 0.5;
  if (!inWater) F = Math.max(6, F);
  let Wy: number;
  if (inWater) Wy = 330;
  else {
    const need = 80 + P + F;
    if (need > 470) {
      const k = 390 / (P + F);
      P *= k;
      F *= k;
      Wy = 470;
    } else Wy = Math.max(370, need);
  }
  const unitsPerM = a ? (P / a.personPx) * a.pxPerM : P / 1.7;
  const visible = inWater ? Math.max(0.2, Math.min(0.9, 1 - det.waterDepthM / Math.max(0.5, det.personHeightM))) : 1;
  const feetY = inWater ? Wy + P * (1 - visible) : Wy - F;
  const headTop = feetY - P;
  const cx = 470;
  const spacing = P * 0.45;
  const spread = ((n - 1) * spacing) / 2;
  const xs = Array.from({ length: n }, (_, i) => cx - spread + i * spacing);
  const arms: Arms = det.medicalNeed ? 'both' : det.foodNeed ? 'one' : 'down';
  const bx0 = cx - spread - P * 0.3;
  const bx1 = cx + spread + P * 0.3;
  const by0 = headTop - 16;
  const by1 = inWater ? Wy + 14 : feetY + 6;
  const measureX = bx1 + 26;
  const riseUnits = a ? (a.forecastRiseCm / 100) * unitsPerM : 0;
  const forecastY = Math.max(24, Wy - riseUnits);
  const floods = a?.minutesToFlood !== null && a?.minutesToFlood !== undefined;
  const flowDur = Math.max(0.8, Math.min(8, 3 / Math.max(0.15, det.currentSpeedMs)));
  const dropped = deliveries.filter((x) => x.detectionId === det.id && x.status === 'zrzucono');

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
      <defs>
        <radialGradient id={hotId} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#fff7ae" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
        <linearGradient id={farId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={irMode ? '#0b0620' : '#94a3b8'} />
          <stop offset="100%" stopColor={p.far} />
        </linearGradient>
      </defs>
      <rect width={VW} height={VH} fill={inWater ? p.water : `url(#${farId})`} />
      {!inWater &&
        [80, 260, 690, 860].map((x, i) => (
          <polygon key={x} points={`${x - 60},${Wy} ${x - 60},${Wy - 40 - i * 6} ${x},${Wy - 75 - i * 8} ${x + 60},${Wy - 40 - i * 6} ${x + 60},${Wy}`} fill={p.house} opacity="0.35" />
        ))}

      {!inWater && <ObjectShape label={a?.objectLabel ?? ''} cx={cx} feetY={feetY} spread={spread} P={P} p={p} irMode={irMode} />}
      {xs.map((x, i) => (
        <Person key={i} x={x} feetY={feetY} P={P} arms={arms} p={p} bob={inWater} />
      ))}

      {/* Woda – półprzezroczysta, zanurzona część sylwetki/obiektu prześwituje */}
      <rect x="0" y={Wy} width={VW} height={VH - Wy} fill={p.water} opacity={inWater ? 0.82 : 0.88} />
      <g style={{ animation: 'cam-waves 3s linear infinite' }}>
        <path d={`M -120 ${Wy} ${Array.from({ length: 10 }, () => 'q 30 -7 60 0 t 60 0').join(' ')}`} stroke={p.waterHi} strokeWidth="2.5" fill="none" opacity="0.8" />
      </g>
      {[Wy + 45, Wy + 95, Wy + 145].filter((y) => y < VH).map((y, i) => (
        <g key={y} style={{ animation: `cam-flow ${flowDur}s linear infinite`, animationDelay: `${-i * 0.6}s` }}>
          {[100, 400, 700].map((x) => (
            <path key={x} d={`M ${x} ${y} h 46 m -10 -7 l 10 7 l -10 7`} stroke={p.waterHi} strokeWidth="2" fill="none" opacity="0.6" />
          ))}
        </g>
      ))}

      {/* Zrzucone wyposażenie przy osobie */}
      {dropped.map((x, i) =>
        x.payloadType === 'kamizelki' ? (
          <g key={x.id}>
            {[0, 1].map((k) => (
              <ellipse key={k} cx={cx - spread - 90 + k * 50 + i * 20} cy={(inWater ? Wy : feetY) - 6} rx="22" ry="9" fill="none" stroke={irMode ? '#fdba74' : '#f97316'} strokeWidth="7" />
            ))}
          </g>
        ) : (
          <g key={x.id}>
            <rect x={cx + spread + 70 + i * 30} y={(inWater ? Wy : feetY) - 30} width="34" height="28" rx="4" fill={irMode ? '#c4b5fd' : '#f8fafc'} />
            {x.payloadType === 'apteczka' ? (
              <path d={`M ${cx + spread + 87 + i * 30} ${(inWater ? Wy : feetY) - 25} v 18 m -9 -9 h 18`} stroke="#dc2626" strokeWidth="5" />
            ) : (
              <rect x={cx + spread + 76 + i * 30} y={(inWater ? Wy : feetY) - 22} width="22" height="6" fill="#0ea5e9" />
            )}
          </g>
        )
      )}

      {/* Nadlatujący dron transportowy */}
      {incoming && (
        <g transform={`translate(${880 - incoming.fraction * 300} ${70 + incoming.fraction * 20})`}>
          <rect x="-26" y="-5" width="52" height="10" rx="5" fill="#0d9488" />
          <line x1="-36" y1="-9" x2="-16" y2="-9" stroke="#e2e8f0" strokeWidth="3" />
          <line x1="16" y1="-9" x2="36" y2="-9" stroke="#e2e8f0" strokeWidth="3" />
          <rect x="-10" y="6" width="20" height="16" fill="#f97316" />
          <text x="0" y="-16" textAnchor="middle" fill="#5eead4" fontSize="12" fontFamily="monospace" fontWeight="700">
            {incoming.name}
          </text>
        </g>
      )}

      {/* Głośnik drona */}
      {speaking &&
        [0, 1, 2].map((i) => (
          <circle
            key={i}
            cx="480"
            cy="-10"
            r="60"
            fill="none"
            stroke="#f472b6"
            strokeWidth="3"
            className="cam-anim"
            style={{ animation: 'cam-sound 1.5s ease-out infinite', animationDelay: `${i * 0.5}s` }}
          />
        ))}

      {/* Ramka detekcji */}
      <g stroke="#22d3ee" strokeWidth="2.5" fill="none">
        <path d={`M ${bx0} ${by0 + 20} V ${by0} H ${bx0 + 20} M ${bx1 - 20} ${by0} H ${bx1} V ${by0 + 20} M ${bx0} ${by1 - 20} V ${by1} H ${bx0 + 20} M ${bx1 - 20} ${by1} H ${bx1} V ${by1 - 20}`} />
      </g>
      <rect x={bx0} y={by0 - 22} width={Math.max(150, bx1 - bx0)} height="20" fill="#0e7490" opacity="0.85" />
      <text x={bx0 + 6} y={by0 - 7} fill="#ecfeff" fontSize="13" fontFamily="monospace" fontWeight="700">
        OSOBA ×{det.persons} • {Math.round(det.confidence * 100)}%
      </text>

      {/* Pozycja */}
      {reveal.reached('pozycja') && (
        <g>
          <rect x={bx0} y={by1 + 6} width={inWater ? 210 : 330} height="22" fill={inWater ? '#b91c1c' : '#1e293b'} opacity="0.9" />
          <text x={bx0 + 6} y={by1 + 22} fill="#fff" fontSize="13" fontFamily="monospace" fontWeight="700">
            {reveal.done('pozycja') ? (inWater ? 'W WODZIE → KRYTYCZNY' : `${POSITION_TEXT[det.position]} • ${a?.objectLabel ?? ''}`) : 'klasyfikacja pozycji…'}
          </text>
        </g>
      )}

      {/* Lustro wody */}
      {(reveal.reached('pomiar') || reveal.reached('prognoza')) && (
        <g>
          <line x1="0" y1={Wy} x2={VW} y2={Wy} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="8 6" />
          <text x="12" y={Wy - 6} fill="#7dd3fc" fontSize="12" fontFamily="monospace" fontWeight="700">
            LUSTRO WODY
          </text>
        </g>
      )}

      {/* Pomiar: wzrost wzorcowy ↔ odległość stóp od wody */}
      {!inWater && reveal.reached('pomiar') && a && (
        <g fontFamily="monospace" fontSize="13" fontWeight="700">
          <line x1={measureX} y1={headTop} x2={measureX} y2={feetY} stroke="#22d3ee" strokeWidth="2" />
          <line x1={measureX - 8} y1={headTop} x2={measureX + 8} y2={headTop} stroke="#22d3ee" strokeWidth="2" />
          <line x1={measureX - 8} y1={feetY} x2={measureX + 8} y2={feetY} stroke="#22d3ee" strokeWidth="2" />
          <text x={measureX + 12} y={(headTop + feetY) / 2 - 4} fill="#67e8f9">
            {fmt(a.referenceHeightM)} m (wzorzec)
          </text>
          <text x={measureX + 12} y={(headTop + feetY) / 2 + 13} fill="#67e8f9">
            {reveal.done('pomiar') ? `= ${a.personPx} px` : 'mierzenie…'}
          </text>
          <line x1={measureX} y1={feetY} x2={measureX} y2={Wy} stroke="#facc15" strokeWidth="2" />
          <line x1={measureX - 8} y1={Wy} x2={measureX + 8} y2={Wy} stroke="#facc15" strokeWidth="2" />
          <text x={measureX + 12} y={Math.min(Wy - 4, (feetY + Wy) / 2 + 5)} fill="#fde047">
            {reveal.done('pomiar') && a.freeboardM !== null ? `${a.freeboardPx} px ≈ ${Math.round(a.freeboardM * 100)} cm do zalania` : 'mierzenie…'}
          </text>
        </g>
      )}

      {/* Prognoza kulminacji i nurt */}
      {reveal.done('prognoza') && a && (
        <g fontFamily="monospace" fontSize="13" fontWeight="700">
          <line x1="0" y1={forecastY} x2={VW} y2={forecastY} stroke={floods ? '#ef4444' : '#fb923c'} strokeWidth="2" strokeDasharray="12 6" />
          <rect x="8" y={forecastY - 22} width={floods ? 430 : 400} height="18" fill="#000" opacity="0.55" />
          <text x="12" y={forecastY - 8} fill={floods ? '#fca5a5' : '#fdba74'}>
            PROGNOZA +{a.forecastRiseCm} cm (kulminacja {fmt(a.peakInH, 1)} h){floods ? ` → ZALANIE ~${a.minutesToFlood} min` : ''}
          </text>
          <rect x="8" y={Math.min(VH - 30, Wy + 58)} width="330" height="20" fill="#000" opacity="0.55" />
          <text x="12" y={Math.min(VH - 15, Wy + 73)} fill={a.sweepRiskPct >= 50 ? '#fca5a5' : '#e2e8f0'}>
            NURT {fmt(det.currentSpeedMs)} m/s → porwanie {a.sweepRiskPct}%
          </text>
        </g>
      )}
    </svg>
  );
};

// ---------- Panele nakładki HUD ----------

const Row: React.FC<{ label: string; value?: React.ReactNode; pending?: boolean; tone?: string }> = ({ label, value, pending, tone }) => (
  <div className="flex justify-between gap-3">
    <span className="text-slate-400">{label}</span>
    <span className={`text-right font-bold ${pending ? 'text-slate-500' : tone ?? 'text-slate-100'}`}>{pending ? '…' : value}</span>
  </div>
);

const AnalysisPanel: React.FC<{ det: Detection; reveal: Reveal; deliveries: Delivery[] }> = ({ det, reveal, deliveries }) => {
  const a = det.assessment;
  const inWater = det.position === 'w_wodzie';
  const crit = reveal.done('kategoria') ? det.criticality : a?.criticalityInitial ?? det.criticality;
  const own = deliveries.filter((x) => x.detectionId === det.id);
  return (
    <div className="w-60 rounded-lg bg-black/65 border border-cyan-500/40 p-2.5 text-[10.5px] leading-snug space-y-1 backdrop-blur-sm">
      <div className="text-cyan-300 font-extrabold tracking-wider text-[10px]">ANALIZA AI • PK</div>
      <Row label="Pozycja" pending={!reveal.done('pozycja')} value={`${POSITION_TEXT[det.position].toLowerCase()}${a ? ` – ${a.objectLabel}` : ''}`} tone={inWater ? 'text-red-400' : undefined} />
      {a && !inWater && (
        <>
          <Row label="Skala (wzorzec 1,70 m)" pending={!reveal.done('pomiar')} value={`${a.personPx} px • ${fmt(a.pxPerM, 0)} px/m`} />
          <Row label="Do zalania obiektu" pending={!reveal.done('pomiar')} value={a.freeboardM !== null ? `${Math.round(a.freeboardM * 100)} cm` : '—'} tone="text-yellow-300" />
        </>
      )}
      {a && (
        <>
          <Row label="Przybór wody" pending={!reveal.done('prognoza')} value={`+${fmt(a.riseCmH, 1)} cm/h`} />
          <Row label="Kulminacja" pending={!reveal.done('prognoza')} value={`za ${fmt(a.peakInH, 1)} h (+${a.forecastRiseCm} cm)`} />
          {!inWater && (
            <Row
              label="Czas do zalania"
              pending={!reveal.done('prognoza')}
              value={a.minutesToFlood !== null ? `~${a.minutesToFlood} min` : 'nie przed kulminacją'}
              tone={a.minutesToFlood !== null ? 'text-red-400' : 'text-emerald-300'}
            />
          )}
          <Row label="Nurt • D·V" pending={!reveal.done('prognoza')} value={`${fmt(det.currentSpeedMs)} m/s • ${fmt(a.dvPeak)} m²/s`} />
          <div className="flex items-center gap-2">
            <span className="text-slate-400 shrink-0">Ryzyko porwania</span>
            <div className="flex-1 h-1.5 rounded bg-slate-700 overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${a.sweepRiskPct >= 50 ? 'bg-red-500' : a.sweepRiskPct >= 25 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: reveal.done('prognoza') ? `${a.sweepRiskPct}%` : '0%' }}
              />
            </div>
            <span className="font-bold w-9 text-right">{reveal.done('prognoza') ? `${a.sweepRiskPct}%` : '…'}</span>
          </div>
        </>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-white/10">
        <span className="text-slate-400">Kategoria</span>
        {reveal.reached('pozycja') && reveal.done('pozycja') ? (
          <span className={`px-1.5 py-0.5 rounded font-extrabold uppercase ${CRIT_HUD[crit]}`}>
            {CRITICALITY_STYLES[crit].label} • PK {reveal.done('kategoria') ? det.pk : a?.pkInitial ?? det.pk}
          </span>
        ) : (
          <span className="text-slate-500">…</span>
        )}
      </div>
      <Row
        label="Pomoc medyczna"
        value={det.medicalNeed === true ? 'TAK – obie ręce' : det.medicalNeed === false ? 'nie' : '—'}
        tone={det.medicalNeed ? 'text-red-400' : undefined}
      />
      <Row label="Woda / żywność" value={det.foodNeed === true ? 'TAK – jedna ręka' : det.foodNeed === false ? 'nie' : '—'} tone={det.foodNeed ? 'text-amber-300' : undefined} />
      {own.length > 0 && (
        <div className="pt-1 border-t border-white/10 space-y-0.5">
          {own.map((x) => (
            <div key={x.id} className="flex justify-between gap-2">
              <span className="text-teal-300">{PAYLOAD_LABELS[x.payloadType]}</span>
              <span className="text-slate-300">{x.status === 'zrzucono' ? 'zrzucono ✓' : x.status === 'w_locie' ? `w locie (${x.droneName})` : x.status.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StagesPanel: React.FC<{ drone: DroneRuntime }> = ({ drone }) => {
  const proc = drone.procedure;
  if (!proc) return null;
  const cur = proc.stages.indexOf(proc.stage);
  return (
    <div className="w-52 rounded-lg bg-black/65 border border-white/15 p-2.5 text-[10.5px] space-y-1 backdrop-blur-sm">
      <div className="text-slate-300 font-extrabold tracking-wider text-[10px]">PROCEDURA PRZY OSOBIE</div>
      {proc.stages.map((s, i) => (
        <div key={s} className={`flex items-center gap-1.5 ${i < cur ? 'text-emerald-300' : i === cur ? 'text-yellow-300 font-bold' : 'text-slate-500'}`}>
          <span className="w-3 text-center">{i < cur ? '✓' : i === cur ? '▶' : '○'}</span>
          {PROCEDURE_STAGE_LABELS[s].label}
        </div>
      ))}
    </div>
  );
};

const QUESTIONS: Partial<Record<ProcedureStage, string>> = {
  wywiad_lekarz: 'Tu dron ratowniczy. Pomoc jest w drodze. Jeśli potrzebujesz pomocy medycznej – podnieś OBIE RĘCE.',
  wywiad_jedzenie: 'Jeśli potrzebujesz wody lub jedzenia – podnieś JEDNĄ RĘKĘ.',
};

// ---------- Transmisja ----------

export const DroneCameraFeed: React.FC<{
  data: MissionData;
  drone: DroneRuntime;
  irOverride?: boolean | null;
  /** Wypełnia cały kontener zamiast proporcji 16:9 */
  fill?: boolean;
  /** Miejsce zajęte z prawej u dołu przez okno nałożone na obraz (np. mapę) */
  insetRight?: string;
}> = ({ data, drone, irOverride, fill, insetRight }) => {
  const irMode = irOverride ?? drone.hasThermal;
  const proc = drone.procedure ?? null;
  const det: Detection | null =
    proc?.det ?? data.detections.find((x) => x.id === (proc?.detectionId ?? (drone.phase === 'monitorowanie' ? drone.detectionId : undefined))) ?? null;
  const reveal = revealFor(drone);
  const airborne = !['baza', 'gotowy', 'czuwanie', 'wymiana_baterii', 'kalibracja', 'uziemiony'].includes(drone.phase);
  const stageInfo = proc ? PROCEDURE_STAGE_LABELS[proc.stage] : null;
  const progress = proc && stageInfo ? Math.max(0.05, (stageInfo.ticks - proc.ticks + 1) / stageInfo.ticks) : null;

  // Dron transportowy lecący do monitorowanej osoby
  let incoming: { name: string; fraction: number } | null = null;
  if (det && drone.phase === 'monitorowanie') {
    const dlv = data.deliveries.find((x) => x.detectionId === det.id && x.status === 'w_locie');
    const carrier = dlv && data.drones.find((x) => x.droneId === dlv.droneId);
    if (carrier) {
      const km = distKm(carrier, det);
      if (km < 0.6) incoming = { name: carrier.name, fraction: Math.max(0, Math.min(1, 1 - km / 0.6)) };
    }
  }

  const satellite = airborne && !drone.linkLost && !(det && (proc || drone.phase === 'monitorowanie'));
  let scene: React.ReactNode;
  if (!airborne) {
    scene = (
      <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-950 flex items-center justify-center">
        <svg viewBox="0 0 200 200" className="h-1/2 opacity-60">
          <circle cx="100" cy="100" r="80" fill="none" stroke="#facc15" strokeWidth="6" />
          <text x="100" y="128" textAnchor="middle" fill="#facc15" fontSize="84" fontWeight="900" fontFamily="sans-serif">
            H
          </text>
        </svg>
      </div>
    );
  } else if (det && (proc || drone.phase === 'monitorowanie')) {
    scene = <TargetScene det={det} irMode={irMode} reveal={reveal} deliveries={data.deliveries} incoming={incoming} speaking={!!proc && proc.stage.startsWith('wywiad')} />;
  } else {
    // Jeden, stale zamontowany widok z lotu – przy przejściu skanowanie → zbliżanie nie jest tworzony od nowa,
    // więc zdjęcia terenu nie znikają (wcześniej na chwilę wracał rysowany teren zastępczy)
    scene = (
      <>
        <FlightScene key="flight" drone={drone} ir={irMode} zoom={drone.phase === 'weryfikacja_celu'} scan={drone.phase === 'skanowanie'} />
        {drone.phase === 'weryfikacja_celu' && <Reticle ir={irMode} hot label="POTENCJALNY CEL – ZBLIŻANIE" sub="obniżanie pułapu do 25 m • klasyfikacja AI" />}
        {drone.phase === 'sprawdzanie_sygnalu' && <Reticle ir={irMode} label="SYGNAŁ CIEPLNY Z ROZPOZNANIA" sub={drone.activityDetail} />}
      </>
    );
  }

  const paused = !!data.paused;
  const delivery = drone.phase === 'dostawa' ? data.deliveries.find((x) => x.id === drone.deliveryId) : undefined;
  const lines = (drone.feedLog ?? []).slice(-5);
  const activity = drone.activity ?? PHASE_LABELS[drone.phase];
  const critical = det && reveal.done('kategoria') && det.criticality === 'krytyczny';

  return (
    <div className={`relative w-full ${fill ? 'h-full' : 'aspect-video'} rounded-2xl overflow-hidden bg-black font-mono text-white select-none ${paused ? 'cam-paused' : ''}`}>
      {scene}

      {paused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-1 opacity-90">
          <div className="flex gap-2">
            <span className="h-14 w-4 rounded bg-white/85" />
            <span className="h-14 w-4 rounded bg-white/85" />
          </div>
          <div className="rounded bg-black/70 px-2 py-0.5 text-xs font-extrabold tracking-[0.3em]">PAUZA</div>
        </div>
      )}

      {drone.linkLost && (
        <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-2 overflow-hidden">
          <svg className="absolute inset-0 w-full h-full opacity-40" style={{ animation: 'cam-noise 0.25s steps(2) infinite' }}>
            <filter id="cam-noise-f">
              <feTurbulence baseFrequency="0.9" numOctaves="2" />
            </filter>
            <rect width="100%" height="100%" filter="url(#cam-noise-f)" />
          </svg>
          <div className="relative text-2xl font-extrabold text-red-400 tracking-widest">BRAK SYGNAŁU</div>
          <div className="relative text-xs text-slate-300">Dron kontynuuje misję w trybie Offline Search (Edge AI) – ostatnia klatka {formatSim(data.simSeconds)}</div>
        </div>
      )}

      {/* Kolor błysku podany wprost – klasa bg-white jest przemalowywana w ciemnym motywie */}
      {proc?.stage === 'raport' && !paused && (
        <div key={`flash-${proc.startedSim}`} className="absolute inset-0 pointer-events-none" style={{ background: '#fff', animation: 'cam-flash 0.9s ease-out' }} />
      )}

      {/* Górny pasek */}
      <div className="absolute top-0 inset-x-0 flex items-start justify-between gap-2 p-2.5 text-[11px] bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2">
          {paused ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-extrabold text-[10px]">⏸ PAUZA • {formatSim(data.simSeconds)}</span>
          ) : (
            <>
              <span className="flex items-center gap-1 text-red-500 font-extrabold">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" style={{ animation: 'cam-blink 1s infinite' }} /> REC
              </span>
              <span className="px-1.5 py-0.5 rounded bg-red-600 font-extrabold text-[10px]">NA ŻYWO</span>
            </>
          )}
          <span className="font-extrabold">{drone.name}</span>
          <span className="text-slate-300">{irMode ? 'termowizja' : 'kamera'}</span>
        </div>
        <div className="flex items-center gap-3 tabular-nums">
          <span className={drone.battery < 30 ? 'text-red-400 font-bold' : ''}>BAT {Math.round(drone.linkLost ? drone.reportedBattery : drone.battery)}%</span>
          <span>ALT {Math.round(drone.altAgl)} m</span>
          <span>SPD {drone.speed.toFixed(1)} m/s</span>
          <span>HDG {String(Math.round(drone.heading)).padStart(3, '0')}°</span>
        </div>
      </div>

      {/* Bieżąca czynność */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 max-w-[70%]">
        <div className={`rounded-lg border px-3 py-1.5 text-center bg-black/70 backdrop-blur-sm ${critical ? 'border-red-500' : proc ? 'border-yellow-400/70' : 'border-white/20'}`}>
          <div className="text-[9px] tracking-[0.2em] text-slate-400">DRON WYKONUJE</div>
          <div className={`text-sm font-extrabold ${proc ? 'text-yellow-300' : 'text-white'}`}>▶ {activity}</div>
          {drone.activityDetail && <div className="text-[10px] text-slate-300">{drone.activityDetail}</div>}
          {progress !== null && (
            <div className="mt-1 h-1 rounded bg-slate-700 overflow-hidden">
              <div className="h-full bg-yellow-300 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
        {proc && QUESTIONS[proc.stage] && (
          <div className="mt-2 rounded-lg bg-pink-600/85 px-3 py-1.5 text-[11px] font-bold text-center">🔊 „{QUESTIONS[proc.stage]}”</div>
        )}
        {proc?.stage === 'raport' && (
          <div className="mt-2 rounded-lg bg-emerald-600/85 px-3 py-1.5 text-[11px] font-bold text-center">
            📷 Zdjęcie + pinezka GPS {det?.lat.toFixed(5)}, {det?.lng.toFixed(5)} → sztab C2
          </div>
        )}
      </div>

      {/* Panele analizy */}
      {det && airborne && (
        <div className="absolute top-10 right-2.5">
          <AnalysisPanel det={det} reveal={reveal} deliveries={data.deliveries} />
        </div>
      )}
      {proc && airborne && (
        <div className="absolute top-10 left-2.5">
          <StagesPanel drone={drone} />
        </div>
      )}
      {delivery && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-teal-700/85 px-3 py-1.5 text-[11px] font-bold">
          ŁADUNEK: {delivery.quantity} × {PAYLOAD_LABELS[delivery.payloadType]} ({delivery.weightKg} kg) • {drone.activityDetail}
        </div>
      )}

      {/* Celownik */}
      {airborne && !det && !drone.linkLost && drone.phase !== 'weryfikacja_celu' && drone.phase !== 'sprawdzanie_sygnalu' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative h-10 w-10">
            <div className="absolute left-1/2 top-0 h-full w-px bg-white/50" />
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/50" />
          </div>
        </div>
      )}

      {/* Dziennik i pozycja */}
      <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/85 via-black/60 to-transparent" style={insetRight ? { paddingRight: insetRight } : undefined}>
        <div className="space-y-0.5 mb-1.5">
          {lines.map((l, i) => (
            <div key={`${l.t}-${i}`} className={`text-[10.5px] leading-tight truncate ${LEVEL_TEXT[l.level]} ${i === lines.length - 1 ? 'font-bold' : 'opacity-80'}`}>
              <span className="text-slate-500">{formatSim(l.t)}</span> {l.text}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 tabular-nums">
          <span>
            GPS {drone.lat.toFixed(5)} {drone.lng.toFixed(5)} • {PHASE_LABELS[drone.phase]}
          </span>
          <span>
            {satellite && `${IMAGERY_ATTRIBUTION} • `}
            {formatSim(data.simSeconds)} • symulacja
          </span>
        </div>
      </div>
    </div>
  );
};

/** Zdjęcie przesłane przez drona do sztabu – kadr z naniesionymi wynikami analizy */
export const DetectionPhoto: React.FC<{ det: Detection; deliveries: Delivery[]; compact?: boolean }> = ({ det, deliveries, compact }) => {
  const a = det.assessment;
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black font-mono text-white">
      <TargetScene det={det} irMode={det.source === 'termowizja'} reveal={ALL_REVEALED} deliveries={deliveries} />
      <div className="absolute top-0 inset-x-0 flex justify-between gap-2 px-2 py-1 text-[9px] bg-black/60">
        <span>
          📷 {det.photo?.droneName ?? det.droneName} • {det.source === 'termowizja' ? 'FLIR IR' : 'RGB'}
          {det.photo ? ` • ${formatSim(det.photo.capturedAtSim)}` : ''}
        </span>
        <span>
          {det.lat.toFixed(5)}, {det.lng.toFixed(5)}
        </span>
      </div>
      {!compact && a && (
        <div className="absolute bottom-0 inset-x-0 px-2 py-1 text-[9px] bg-black/65 flex flex-wrap gap-x-3">
          <span className={det.criticality === 'krytyczny' ? 'text-red-400 font-bold' : 'text-amber-300 font-bold'}>
            {CRITICALITY_STYLES[det.criticality].label.toUpperCase()} • PK {det.pk}
          </span>
          {a.freeboardM !== null && <span>zapas {Math.round(a.freeboardM * 100)} cm</span>}
          {a.minutesToFlood !== null && <span className="text-red-300">zalanie ~{a.minutesToFlood} min</span>}
          <span>porwanie {a.sweepRiskPct}%</span>
          {det.medicalNeed && <span className="text-red-300">pomoc medyczna</span>}
        </div>
      )}
    </div>
  );
};

export default DroneCameraFeed;
