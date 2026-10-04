import React, { useEffect, useMemo, useRef } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CRITICALITY_STYLES,
  Delivery,
  Detection,
  DroneRuntime,
  LatLng,
  PAYLOAD_LABELS,
  PHASE_LABELS,
  PriorityZone,
  SearchSignal,
  Sector,
} from '../../types/drones';

export type MapDrawMode = 'area' | 'nfz' | 'base' | 'priority' | 'hotspot' | null;

interface MissionMapProps {
  base?: { lat: number; lng: number } | null;
  radioRangeKm?: number;
  area?: LatLng[];
  noFlyZones?: LatLng[][];
  draft?: LatLng[];
  drawMode?: MapDrawMode;
  onMapClick?: (lat: number, lng: number) => void;
  sectors?: Sector[];
  showWaypoints?: boolean;
  drones?: DroneRuntime[];
  showTracks?: boolean;
  detections?: Detection[];
  deliveries?: Delivery[];
  highlightDetectionId?: string | null;
  onDetectionClick?: (id: string) => void;
  onDroneClick?: (droneId: string) => void;
  selectedDroneId?: string | null;
  tracks?: { id: string; color: string; points: LatLng[] }[];
  /** Mapa prawdopodobieństwa: komórki [lat, lng, waga] */
  priorityCells?: [number, number, number][];
  priorityCellM?: number;
  priorityRange?: [number, number];
  priorityZones?: PriorityZone[];
  waterways?: LatLng[][];
  signals?: SearchSignal[];
  height?: string;
  fitKey?: string;
}

const baseIcon = L.divIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:12px;background:#0f172a;border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.45);color:#fff;font-weight:800;font-size:11px;font-family:Inter,sans-serif">S0</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const droneIcon = (d: DroneRuntime, selected = false) => {
  const color = d.category === 'zwiadowczy' ? '#4f46e5' : '#0d9488';
  const lost = d.linkLost;
  const ring = d.phase === 'powrot' ? '#f59e0b' : d.phase === 'dostawa' ? '#10b981' : '#ffffff';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:30px;height:30px;opacity:${lost ? 0.55 : 1}">
      ${selected ? '<span style="position:absolute;inset:-7px;border-radius:9999px;border:3px solid #facc15;box-shadow:0 0 10px #facc15"></span>' : ''}
      <div style="position:absolute;inset:0;border-radius:9999px;background:${lost ? '#64748b' : color};border:3px solid ${ring};box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">
        <svg width="14" height="14" viewBox="0 0 24 24" style="transform:rotate(${d.heading}deg)"><path d="M12 2 L19 20 L12 16 L5 20 Z" fill="#fff"/></svg>
      </div>
      ${lost ? '<div style="position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:9999px;background:#dc2626;color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff">!</div>' : ''}
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

const detectionIcon = (det: Detection, highlighted: boolean) => {
  const color = det.status === 'odrzucony' ? '#94a3b8' : CRITICALITY_STYLES[det.criticality].color;
  const size = highlighted ? 34 : 26;
  const pulse = det.status !== 'odrzucony' && det.criticality === 'krytyczny' && det.rescueStatus !== 'ewakuowano';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      ${pulse ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${color};opacity:.25;animation:drone-ping 1.4s cubic-bezier(0,0,.2,1) infinite"></span>` : ''}
      <div style="position:absolute;inset:0;border-radius:9999px 9999px 9999px 2px;transform:rotate(-45deg);background:${color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35)"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:11px;font-family:Inter,sans-serif">${det.persons}</div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
};

const ClickHandler: React.FC<{ onClick?: (lat: number, lng: number) => void; active: boolean }> = ({ onClick, active }) => {
  const map = useMapEvents({
    click(e) {
      if (active && onClick) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = active ? 'crosshair' : '';
  }, [active, map]);
  return null;
};

/** Przelicza rozmiar mapy, gdy zmienia się jej kontener (okno nałożone, pokazanie po ukryciu) */
const SizeWatcher: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
};

const FitController: React.FC<{ points: LatLng[]; fitKey?: string }> = ({ points, fitKey }) => {
  const map = useMap();
  const done = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (done.current === fitKey || points.length === 0) return;
    done.current = fitKey;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
  }, [fitKey, points, map]);
  return null;
};

export const MissionMap: React.FC<MissionMapProps> = ({
  base,
  radioRangeKm,
  area = [],
  noFlyZones = [],
  draft = [],
  drawMode = null,
  onMapClick,
  sectors = [],
  showWaypoints = true,
  drones = [],
  showTracks = true,
  detections = [],
  deliveries = [],
  highlightDetectionId,
  onDetectionClick,
  onDroneClick,
  selectedDroneId,
  tracks = [],
  priorityCells = [],
  priorityCellM = 0,
  priorityRange,
  priorityZones = [],
  waterways = [],
  signals = [],
  height = '480px',
  fitKey,
}) => {
  const fitPoints = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = [...area];
    if (base) pts.push([base.lat, base.lng]);
    return pts;
  }, [area, base]);

  const center: LatLng = base ? [base.lat, base.lng] : area[0] ?? [50.438, 16.6548];
  // Podczas rysowania warstwy nie przechwytują kliknięć – trafiają one do mapy
  const drawing = drawMode !== null;
  const layerKey = drawing ? 'draw' : 'view';

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs" style={{ height }}>
      <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom preferCanvas>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onClick={onMapClick} active={drawMode !== null} />
        <SizeWatcher />
        <FitController points={fitPoints} fitKey={fitKey ?? `${area.length}-${base?.lat}`} />

        {base && radioRangeKm ? (
          <Circle
            key={`radio-${layerKey}`}
            interactive={!drawing}
            center={[base.lat, base.lng]}
            radius={radioRangeKm * 1000}
            pathOptions={{ color: '#6366f1', weight: 1.5, dashArray: '6 6', fillOpacity: 0.03 }}
          />
        ) : null}

        {priorityCells.length > 0 && priorityCellM > 0 && (() => {
          const [lo, hi] = priorityRange ?? [Math.min(...priorityCells.map((c) => c[2])), Math.max(...priorityCells.map((c) => c[2]))];
          return priorityCells.map(([lat, lng, w], i) => {
            const f = hi > lo ? (w - lo) / (hi - lo) : 0;
            if (f < 0.05) return null;
            const dLat = priorityCellM / 110540 / 2;
            const dLng = priorityCellM / (111320 * Math.cos((lat * Math.PI) / 180)) / 2;
            const color = f > 0.66 ? '#dc2626' : f > 0.33 ? '#f97316' : '#facc15';
            return (
              <Rectangle
                key={`pc-${i}`}
                bounds={[
                  [lat - dLat, lng - dLng],
                  [lat + dLat, lng + dLng],
                ]}
                interactive={false}
                pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.12 + 0.33 * f }}
              />
            );
          });
        })()}

        {waterways.map((wline, i) => (
          <Polyline key={`ww-${i}`} positions={wline} interactive={false} pathOptions={{ color: '#0284c7', weight: 3, opacity: 0.55 }} />
        ))}

        {priorityZones.map((z) => (
          <Polygon
            key={`pz-${z.id}-${layerKey}`}
            interactive={!drawing}
            positions={z.polygon}
            pathOptions={{ color: z.level === 'wysoki' ? '#dc2626' : '#f97316', weight: 2, dashArray: '6 4', fillOpacity: 0.05 }}
          >
            {!drawing && <Tooltip sticky>Strefa priorytetowa – {z.level === 'wysoki' ? 'wysoki' : 'średni'} priorytet{z.label ? `: ${z.label}` : ''}</Tooltip>}
          </Polygon>
        ))}

        {area.length >= 3 && (
          <Polygon
            key={`area-${layerKey}`}
            interactive={!drawing}
            positions={area}
            pathOptions={
              sectors.length
                ? { color: '#0f172a', weight: 2, dashArray: '4 6', fillOpacity: 0 }
                : { color: '#4f46e5', weight: 3, fillColor: '#6366f1', fillOpacity: 0.15 }
            }
          >
            {!drawing && <Tooltip sticky>Strefa poszukiwań</Tooltip>}
          </Polygon>
        )}

        {noFlyZones.map((z, i) => (
          <Polygon
            key={`nfz-${i}-${layerKey}`}
            interactive={!drawing}
            positions={z}
            pathOptions={{ color: '#dc2626', weight: 2, fillColor: '#dc2626', fillOpacity: 0.22, dashArray: '2 4' }}
          >
            {!drawing && <Tooltip sticky>Strefa zakazu lotów (No-Fly Zone)</Tooltip>}
          </Polygon>
        ))}

        {draft.length > 0 && (
          <>
            <Polyline positions={draft} pathOptions={{ color: drawMode === 'nfz' ? '#dc2626' : drawMode === 'hotspot' ? '#f97316' : '#4f46e5', weight: 3, dashArray: '6 4' }} />
            {draft.map((p, i) => (
              <CircleMarker key={`dr-${i}`} center={p} radius={5} pathOptions={{ color: '#fff', weight: 2, fillColor: drawMode === 'nfz' ? '#dc2626' : '#4f46e5', fillOpacity: 1 }} />
            ))}
          </>
        )}

        {sectors.map((s) => (
          <React.Fragment key={s.id}>
            <Polygon
              key={`sec-${layerKey}`}
              interactive={!drawing}
              positions={s.polygon}
              pathOptions={{ color: s.color, weight: 2, fillColor: s.color, fillOpacity: 0.12 }}
            >
              {!drawing && (
              <Tooltip sticky>
                <div className="text-xs">
                  <b>Sektor {s.index + 1}</b> – {s.droneName}
                  <br />
                  {s.areaKm2} km² • {s.altitudeAgl} m AGL (echelon {s.echelon + 1})
                </div>
              </Tooltip>
              )}
            </Polygon>
            {showWaypoints &&
              ([1, 2] as const).map((pass) => {
                const pts = s.waypoints.filter((w) => (w.pass ?? 2) === pass).map((w) => [w.lat, w.lng] as LatLng);
                if (pts.length < 2) return null;
                return (
                  <Polyline
                    key={`wp-${pass}-${layerKey}`}
                    interactive={!drawing}
                    positions={pts}
                    pathOptions={{ color: s.color, weight: pass === 1 ? 1.5 : 1.5, opacity: pass === 1 ? 0.55 : 0.85, dashArray: pass === 1 ? '5 5' : undefined }}
                  />
                );
              })}
          </React.Fragment>
        ))}

        {showTracks &&
          drones
            .filter((d) => d.track.length > 1)
            .map((d) => (
              <Polyline
                key={`tr-${d.droneId}`}
                positions={d.track}
                pathOptions={{ color: d.category === 'zwiadowczy' ? '#4338ca' : '#0f766e', weight: 3, opacity: 0.8 }}
              />
            ))}

        {tracks
          .filter((t) => t.points.length > 1)
          .map((t) => (
            <Polyline key={`xt-${t.id}`} positions={t.points} pathOptions={{ color: t.color, weight: 3, opacity: 0.85 }} />
          ))}

        {deliveries
          .filter((x) => x.status === 'w_locie' && x.droneId)
          .map((x) => {
            const d = drones.find((dr) => dr.droneId === x.droneId);
            if (!d) return null;
            return <Polyline key={`dl-${x.id}`} positions={[[d.lat, d.lng], [x.lat, x.lng]]} pathOptions={{ color: '#10b981', weight: 2, dashArray: '4 6' }} />;
          })}

        {signals
          .filter((sg) => sg.status === 'nowy' || sg.status === 'sprawdzany')
          .map((sg) => (
            <CircleMarker
              key={sg.id}
              center={[sg.lat, sg.lng]}
              radius={7}
              pathOptions={{ color: '#fff', weight: 2, fillColor: sg.status === 'sprawdzany' ? '#f59e0b' : '#64748b', fillOpacity: 0.95 }}
            >
              <Tooltip>
                Sygnał cieplny z rozpoznania ({sg.droneName}) – {sg.status === 'sprawdzany' ? 'sprawdzany' : 'czeka na sprawdzenie'}
              </Tooltip>
            </CircleMarker>
          ))}

        {detections.map((det) => (
          <Marker
            key={det.id}
            position={[det.lat, det.lng]}
            icon={detectionIcon(det, det.id === highlightDetectionId)}
            eventHandlers={{ click: () => onDetectionClick?.(det.id) }}
            zIndexOffset={det.criticality === 'krytyczny' ? 900 : 800}
          >
            <Popup>
              <div className="text-xs space-y-1 min-w-[190px]">
                <div className="font-bold text-sm">
                  {det.persons} os. • {CRITICALITY_STYLES[det.criticality].label} (PK {det.pk})
                </div>
                <div>
                  {det.source === 'termowizja' ? 'FLIR' : 'RGB / OpenCV'} • {det.droneName} • pewność {Math.round(det.confidence * 100)}%
                </div>
                <div>
                  Woda {det.waterDepthM} m, nurt {det.currentSpeedMs} m/s
                </div>
                <div>
                  Weryfikacja: <b>{det.status}</b> • Ewakuacja: <b>{det.rescueStatus}</b>
                </div>
                {deliveries
                  .filter((x) => x.detectionId === det.id)
                  .map((x) => (
                    <div key={x.id}>
                      📦 {PAYLOAD_LABELS[x.payloadType]}: {x.status}
                    </div>
                  ))}
                <div className="text-slate-400">
                  {det.lat.toFixed(5)}, {det.lng.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {drones
          .filter((d) => !['baza', 'gotowy', 'czuwanie', 'kalibracja', 'wymiana_baterii'].includes(d.phase) || d.lat !== base?.lat)
          .map((d) => {
            const pos: LatLng = d.linkLost ? [d.reportedLat, d.reportedLng] : [d.lat, d.lng];
            return (
              <Marker
                key={`dr-${d.droneId}`}
                position={pos}
                icon={droneIcon(d, d.droneId === selectedDroneId)}
                zIndexOffset={1000}
                eventHandlers={onDroneClick ? { click: () => onDroneClick(d.droneId) } : undefined}
              >
                <Tooltip direction="top" offset={[0, -14]}>
                  <div className="text-xs">
                    <b>{d.name}</b> • {PHASE_LABELS[d.phase]}
                    <br />
                    {d.linkLost ? 'BRAK TELEMETRII – ostatnia znana pozycja' : `Bateria ${Math.round(d.battery)}% • ${Math.round(d.altAgl)} m AGL • ${d.speed.toFixed(0)} m/s`}
                    {d.activity && (
                      <>
                        <br />▶ {d.activity}
                      </>
                    )}
                    {onDroneClick && (
                      <>
                        <br />
                        <span className="text-indigo-600 font-semibold">Kliknij – kamera drona</span>
                      </>
                    )}
                  </div>
                </Tooltip>
              </Marker>
            );
          })}

        {base && <Marker position={[base.lat, base.lng]} icon={baseIcon} zIndexOffset={500}><Tooltip>Strefa Zero – mobilne centrum dowodzenia</Tooltip></Marker>}
      </MapContainer>
    </div>
  );
};

export default MissionMap;
