export type LatLng = [number, number];
export type DroneCategory = 'zwiadowczy' | 'dostawczy';
export type DroneFleetStatus = 'dostepny' | 'w_misji' | 'serwis';

export interface BatteryCurvePoint {
  temp: number;
  minutes: number;
}

export interface Drone {
  id: string;
  name: string;
  model: string;
  category: DroneCategory;
  status: DroneFleetStatus;
  organizationId?: string | null;
  organization?: { id: string; name: string } | null;
  maxWindSpeed: number;
  ipRating: string;
  minTemp: number;
  maxTemp: number;
  batteryCurve: BatteryCurvePoint[];
  hasThermal: boolean;
  hasRgb: boolean;
  hasSpeaker: boolean;
  cameraFovDeg: number;
  cruiseSpeed: number;
  maxPayloadKg: number;
  radioRangeKm: number;
  weightKg: number;
  notes?: string | null;
}

export interface WeatherSnapshot {
  lat: number;
  lng: number;
  temperature: number;
  windSpeed: number;
  windGust: number;
  windDirection?: number;
  precipitation: number;
  isDay: boolean;
  source: 'open-meteo' | 'symulacja' | 'reczna';
  fetchedAt: string;
}

export interface FleetAnalysisItem {
  droneId: string;
  name: string;
  model: string;
  category: DroneCategory;
  hasThermal: boolean;
  weather: { coefficient: number; canFly: boolean; reasons: string[]; rainLimitMmH: number };
  capability: {
    baseMinutes: number;
    effectiveMinutes: number;
    reserveMinutes: number;
    transitMinutes: number;
    scanMinutes: number;
    scanSpeed: number;
    swathM: number;
    areaKm2: number;
    rangeKm: number;
    effectivePayloadKg: number;
  };
  flightCoefficient: number;
  available: boolean;
  unavailableReason?: string;
}

export interface Waypoint {
  lat: number;
  lng: number;
  altAgl: number;
  altAmsl: number;
  elevation: number;
  pass?: 1 | 2;
  turnS?: number;
  fast?: boolean;
}

export interface Sector {
  id: string;
  index: number;
  droneId: string;
  droneName: string;
  color: string;
  polygon: LatLng[];
  areaKm2: number;
  altitudeAgl: number;
  echelon: number;
  waypoints: Waypoint[];
  pathLengthKm: number;
  scanMinutes?: number;
  transitInKm?: number;
  returnKm?: number;
  estimatedMinutes: number;
  sorties: number;
  rangeCorrected: boolean;
  uncoveredKm2: number;
  distanceFromBaseKm: number;
  flightCoefficient: number;
  sweepDeg?: number[];
  turns?: number;
  pass1Km?: number;
  pass2Km?: number;
  expectedFindMinutes?: number;
  t50Minutes?: number;
  t80Minutes?: number;
  notes: string[];
}

export type SearchMode = 'jednoprzebiegowy' | 'dwuprzebiegowy';

export interface PriorityZone {
  id: string;
  polygon: LatLng[];
  level: 'wysoki' | 'sredni';
  label?: string;
}

export interface SearchSignal {
  id: string;
  droneId: string;
  droneName: string;
  lat: number;
  lng: number;
  detectedAtSim: number;
  status: 'nowy' | 'sprawdzany' | 'potwierdzony' | 'falszywy';
}

export type MissionRole = 'dowodca' | 'weryfikator' | 'technik' | 'logistyk' | 'ratownik';
export interface AssignedPerson {
  userId: string;
  name: string;
  organizationName?: string;
}
export type MissionAssignments = Record<MissionRole, AssignedPerson[]>;

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  done: boolean;
  automatic: boolean;
  doneBy?: string;
  doneAt?: string;
}

export type DronePhase =
  | 'baza'
  | 'kalibracja'
  | 'gotowy'
  | 'przelot'
  | 'skanowanie'
  | 'weryfikacja_celu'
  | 'analiza'
  | 'wywiad'
  | 'monitorowanie'
  | 'dostawa'
  | 'sprawdzanie_sygnalu'
  | 'powrot'
  | 'wymiana_baterii'
  | 'uziemiony'
  | 'czuwanie';

export interface DroneRuntime {
  droneId: string;
  name: string;
  model: string;
  category: DroneCategory;
  sectorId: string | null;
  phase: DronePhase;
  lat: number;
  lng: number;
  altAgl: number;
  battery: number;
  speed: number;
  heading: number;
  hasThermal: boolean;
  hasSpeaker: boolean;
  effectiveMinutes: number;
  scanIndex: number;
  extraWaypoints: Waypoint[];
  sectorDone: boolean;
  calibrated: boolean;
  connected: boolean;
  linkLost: boolean;
  sectorReassigned: boolean;
  lastTelemetryAt: string;
  reportedLat: number;
  reportedLng: number;
  reportedBattery: number;
  returnReason?: string | null;
  sorties: number;
  distanceKm: number;
  flightSeconds: number;
  track: LatLng[];
  groundedByWeather: boolean;
  target: { lat: number; lng: number } | null;
  detectionId?: string | null;
  deliveryId?: string | null;
  activity?: string;
  activityDetail?: string;
  feedLog?: FeedLine[];
  procedure?: DroneProcedure | null;
}

export type ProcedureStage = 'pozycja' | 'pomiar' | 'prognoza' | 'kategoria' | 'raport' | 'wywiad_lekarz' | 'wywiad_jedzenie' | 'decyzja';

export interface DroneProcedure {
  stage: ProcedureStage;
  ticks: number;
  stages: ProcedureStage[];
  det: Detection | null;
  detectionId: string;
  startedSim: number;
}

export interface FeedLine {
  t: number;
  level: 'info' | 'sukces' | 'ostrzezenie' | 'krytyczny';
  text: string;
}

export const PROCEDURE_STAGE_LABELS: Record<ProcedureStage, { label: string; ticks: number }> = {
  pozycja: { label: 'Pozycja osoby', ticks: 2 },
  pomiar: { label: 'Pomiar skali i zapasu do zalania', ticks: 3 },
  prognoza: { label: 'Prognoza wody i nurt', ticks: 3 },
  kategoria: { label: 'Kategoria ewakuacji', ticks: 2 },
  raport: { label: 'Zdjęcie + GPS do sztabu', ticks: 2 },
  wywiad_lekarz: { label: 'Pytanie: pomoc medyczna', ticks: 3 },
  wywiad_jedzenie: { label: 'Pytanie: woda i żywność', ticks: 3 },
  decyzja: { label: 'Decyzja o dostawach', ticks: 2 },
};

export type Criticality = 'krytyczny' | 'umiarkowany' | 'niski';

export interface VictimAssessment {
  referenceHeightM: number;
  pxPerM: number;
  personPx: number;
  freeboardPx: number | null;
  freeboardM: number | null;
  objectLabel: string;
  riseCmH: number;
  peakInH: number;
  forecastRiseCm: number;
  minutesToFlood: number | null;
  dvNow: number;
  dvPeak: number;
  dvThreshold: number;
  sweepRiskPct: number;
  pkInitial: number;
  criticalityInitial: Criticality;
  pk: number;
  criticality: Criticality;
  dangerous: boolean;
  reasons: string[];
}

export interface Detection {
  id: string;
  droneId: string;
  droneName: string;
  sectorId: string | null;
  lat: number;
  lng: number;
  detectedAt: string;
  source: 'termowizja' | 'rgb';
  confidence: number;
  persons: number;
  animals: number;
  waterDepthM: number;
  currentSpeedMs: number;
  personHeightM: number;
  position: 'w_wodzie' | 'na_dachu' | 'na_podwyzszeniu';
  collapseRisk: boolean;
  pk: number;
  criticality: Criticality;
  status: 'wstepny' | 'potwierdzony' | 'odrzucony';
  offline: boolean;
  gesture: 'lekarz' | 'woda_jedzenie' | 'brak' | null;
  interviewStatus: 'nie_dotyczy' | 'w_toku' | 'zakonczony';
  verifiedBy?: string;
  rescueStatus: 'oczekuje' | 'w_drodze' | 'ewakuowano';
  rescueTeam?: string;
  history: string[];
  assessment?: VictimAssessment;
  medicalNeed?: boolean | null;
  foodNeed?: boolean | null;
  photo?: { capturedAtSim: number; altAgl: number; heading: number; droneName: string } | null;
}

export type DeliveryStatus = 'oczekuje_autoryzacji' | 'oczekuje_zaladunku' | 'oczekuje_drona' | 'w_locie' | 'zrzucono' | 'odrzucona';

export interface Delivery {
  id: string;
  detectionId: string;
  lat: number;
  lng: number;
  payloadType: 'kamizelki' | 'apteczka' | 'woda_jedzenie';
  quantity: number;
  weightKg: number;
  status: DeliveryStatus;
  automatic: boolean;
  droneId?: string | null;
  droneName?: string | null;
  createdAt: string;
  authorizedBy?: string;
  loadedBy?: string;
  droppedAt?: string;
}

export interface Recommendation {
  id: string;
  type: 'uziemienie_floty' | 'wstrzymanie_dostaw';
  title: string;
  details: string;
  status: 'oczekuje' | 'zatwierdzona' | 'odrzucona';
  createdAt: string;
  decidedBy?: string;
}

export interface MissionEvent {
  id: string;
  at: string;
  simSeconds: number;
  level: 'info' | 'sukces' | 'ostrzezenie' | 'krytyczny';
  category: string;
  message: string;
  droneId?: string;
}

export interface MissionData {
  base: { lat: number; lng: number; name?: string };
  radioRangeKm: number;
  area: LatLng[];
  noFlyZones: LatLng[][];
  weather: WeatherSnapshot | null;
  weatherOverride: WeatherSnapshot | null;
  weatherHistory: WeatherSnapshot[];
  fleetAnalysis: FleetAnalysisItem[];
  selectedDroneIds: string[];
  fleetSummary?: { scouts: number; delivery: number; rationale: string[] };
  sectors: Sector[];
  planWarnings: string[];
  searchMode: SearchMode;
  priorityZones: PriorityZone[];
  mapFeatures: { waterways: LatLng[][]; buildingsCount: number; source: string; fetchedAt: string } | null;
  priorityGrid: { cellM: number; minWeight: number; maxWeight: number; uniform: boolean; sources: string[]; cells: [number, number, number][] } | null;
  signals: SearchSignal[];
  planStats?: {
    areaKm2: number;
    coveredKm2: number;
    uncoveredKm2: number;
    expectedFindMinutes?: number;
    baselineExpectedFindMinutes?: number;
    finishMinutes?: number;
    finishSpreadMinutes?: number;
    terrainMin: number;
    terrainMax: number;
    terrainSource: 'open-meteo' | 'brak';
    plannedAt: string;
  };
  assignments: MissionAssignments;
  checklist: ChecklistItem[];
  drones: DroneRuntime[];
  detections: Detection[];
  deliveries: Delivery[];
  recommendations: Recommendation[];
  events: MissionEvent[];
  simSeconds: number;
  floodForecast?: { baseRiseCmH: number; riseCmH: number; peakInH: number; issuedAtSim: number; source: string };
  paused?: boolean;
  pausedBy?: string | null;
  pausedAt?: string | null;
  stats: { vests: number; medkits: number; foodWater: number; falseAlarmsOnboard: number; falseAlarmsVerifier: number };
}

export type MissionStatus = 'planowanie' | 'przygotowanie' | 'aktywna' | 'powrot' | 'zakonczona';

export interface Mission {
  id: string;
  name: string;
  description?: string | null;
  status: MissionStatus;
  createdById: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  data: MissionData;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  timeScale: number;
  permissions: { isCommander: boolean; roles: MissionRole[] };
}

export interface MissionListItem {
  id: string;
  name: string;
  description?: string | null;
  status: MissionStatus;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  createdBy?: { firstName: string; lastName: string };
  base: { lat: number; lng: number; name?: string };
  areaKm2: number;
  drones: number;
  sectors: number;
  detections: number;
  persons: number;
  weather: WeatherSnapshot | null;
  searchMode?: SearchMode;
}

export const MISSION_STATUS_LABELS: Record<MissionStatus, { label: string; cls: string }> = {
  planowanie: { label: 'Planowanie', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  przygotowanie: { label: 'Przygotowanie Strefy Zero', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  aktywna: { label: 'Operacja w toku', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  powrot: { label: 'Powrót floty', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  zakonczona: { label: 'Zakończona', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

export const PHASE_LABELS: Record<DronePhase, string> = {
  baza: 'W bazie',
  kalibracja: 'Kalibracja',
  gotowy: 'Gotowy',
  przelot: 'Przelot (transit)',
  skanowanie: 'Skanowanie',
  weryfikacja_celu: 'Weryfikacja celu',
  analiza: 'Analiza sytuacji',
  wywiad: 'Wywiad głośnikowy',
  monitorowanie: 'Monitorowanie',
  dostawa: 'Lot ze zrzutem',
  sprawdzanie_sygnalu: 'Sprawdzanie sygnału',
  powrot: 'Powrót (RTH)',
  wymiana_baterii: 'Czeka na Pit-Stop',
  uziemiony: 'Uziemiony',
  czuwanie: 'Czuwanie',
};

export const ROLE_LABELS: Record<MissionRole, { label: string; description: string }> = {
  dowodca: {
    label: 'Koordynator Operacyjny (Dowódca)',
    description: 'Nadzoruje system C2 i zatwierdza krytyczne rekomendacje, np. uziemienie floty.',
  },
  weryfikator: {
    label: 'Weryfikator AI (Operator Detekcji)',
    description: 'Weryfikuje alerty „Krytyczne” i „Umiarkowane”, wyklucza fałszywe alarmy, autoryzuje dostawy.',
  },
  technik: {
    label: 'Technik Lądowiska (Pit-Stop)',
    description: 'Wymienia akumulatory w powracających dronach i nadzoruje stacje ładowania.',
  },
  logistyk: {
    label: 'Logistyk Zrzutu',
    description: 'Podczepia kamizelki, wodę lub jedzenie do dronów dostawczych po autoryzacji żądania.',
  },
  ratownik: {
    label: 'Mobilne Zespoły Ratownicze',
    description: 'WOPR, Straż Pożarna – otrzymują zwalidowane pineski GPS z priorytetem ewakuacji.',
  },
};

export const CRITICALITY_STYLES: Record<Criticality, { label: string; cls: string; color: string }> = {
  krytyczny: { label: 'Krytyczny', cls: 'bg-red-50 text-red-700 border-red-200', color: '#dc2626' },
  umiarkowany: { label: 'Umiarkowany', cls: 'bg-amber-50 text-amber-700 border-amber-200', color: '#f59e0b' },
  niski: { label: 'Niski', cls: 'bg-sky-50 text-sky-700 border-sky-200', color: '#0284c7' },
};

export const PAYLOAD_LABELS: Record<Delivery['payloadType'], string> = {
  kamizelki: 'Kamizelki ratunkowe',
  apteczka: 'Pakiet medyczny',
  woda_jedzenie: 'Woda i żywność',
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  oczekuje_autoryzacji: 'Czeka na autoryzację',
  oczekuje_zaladunku: 'Czeka na załadunek',
  oczekuje_drona: 'Czeka na drona',
  w_locie: 'W locie',
  zrzucono: 'Zrzucono',
  odrzucona: 'Odrzucona',
};

export const apiError = (err: any, fallback: string): string => err?.response?.data?.message || fallback;

export const SEARCH_MODE_LABELS: Record<SearchMode, { label: string; description: string }> = {
  jednoprzebiegowy: {
    label: 'Jeden przelot dokładny',
    description: 'Jedna dokładna żmija na 60–75 m. Najkrótszy łączny czas, ale dalsze miejsca są sprawdzane dopiero pod koniec.',
  },
  dwuprzebiegowy: {
    label: 'Rozpoznanie + przeszukanie dokładne',
    description: 'Najpierw szybki przelot termowizją na ~110 m po całym sektorze (sygnały w pierwszych minutach), potem dokładne sprawdzenie sygnałów i stref priorytetowych.',
  },
};

/** Kierunek wiatru jako tekst, np. „z W (270°)” */
export const windFromLabel = (deg?: number) => {
  if (deg === undefined || deg === null) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const pl: Record<string, string> = { N: 'pn.', NE: 'pn.-wsch.', E: 'wsch.', SE: 'pd.-wsch.', S: 'pd.', SW: 'pd.-zach.', W: 'zach.', NW: 'pn.-zach.' };
  return `z ${pl[dirs[Math.round(deg / 45) % 8]]} (${Math.round(deg)}°)`;
};
