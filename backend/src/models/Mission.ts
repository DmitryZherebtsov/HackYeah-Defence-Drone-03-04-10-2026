import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { DroneCategory } from './Drone';
import type { DroneSpec } from '../services/flightMath';

export type MissionStatus = 'planowanie' | 'przygotowanie' | 'aktywna' | 'powrot' | 'zakonczona';
export type LatLng = [number, number];

export interface WeatherSnapshot {
  lat: number;
  lng: number;
  temperature: number; // °C
  windSpeed: number; // m/s
  windGust: number; // m/s
  /** Kierunek, z którego wieje wiatr (°, meteorologicznie: 0 = z północy) */
  windDirection?: number;
  precipitation: number; // mm/h
  isDay: boolean;
  source: 'open-meteo' | 'symulacja' | 'reczna';
  fetchedAt: string;
}

/** Wynik Wzoru B – współczynnik powodzenia lotu w danych warunkach pogodowych */
export interface WeatherEvaluation {
  coefficient: number; // 0..1
  canFly: boolean;
  reasons: string[];
  rainLimitMmH: number;
}

/** Wynik Wzoru A – możliwości lotu drona na terytorium */
export interface CapabilityEvaluation {
  baseMinutes: number; // z krzywej baterii dla bieżącej temperatury
  effectiveMinutes: number; // po uwzględnieniu wiatru i ładunku
  reserveMinutes: number; // rezerwa RTH
  transitMinutes: number; // przelot baza -> sektor -> baza
  scanMinutes: number; // czas faktycznego skanowania
  scanSpeed: number; // m/s
  swathM: number; // szerokość pasa skanowania
  areaKm2: number; // pokrycie na jedno wyjście (sortie)
  rangeKm: number; // zasięg lotu w jedną stronę
  effectivePayloadKg: number;
}

export interface FleetAnalysisItem {
  droneId: string;
  name: string;
  model: string;
  category: DroneCategory;
  hasThermal: boolean;
  weather: WeatherEvaluation;
  capability: CapabilityEvaluation;
  /** Koeficjent możliwości lotu K = A * B, służy do ważenia podziału strefy */
  flightCoefficient: number;
  available: boolean;
  unavailableReason?: string;
}

export interface Waypoint {
  lat: number;
  lng: number;
  altAgl: number; // wysokość nad terenem
  altAmsl: number; // wysokość bezwzględna
  elevation: number; // wysokość terenu
  /** 1 – szybkie rozpoznanie (wyżej, termowizja), 2 – przeszukanie dokładne */
  pass?: 1 | 2;
  /** Czas zawrotu przed tym punktem [s] */
  turnS?: number;
  /** Odcinek przejściowy do tego punktu pokonywany z prędkością przelotową */
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
  scanMinutes: number;
  transitInKm: number;
  returnKm: number;
  /** Łączny czas pracy drona do powrotu po ostatnim wylocie (z wymianami baterii) */
  estimatedMinutes: number;
  sorties: number;
  rangeCorrected: boolean;
  uncoveredKm2: number;
  distanceFromBaseKm: number;
  flightCoefficient: number;
  /** Kierunek linii skanowania dla przelotów (° od północy) */
  sweepDeg?: number[];
  turns?: number;
  pass1Km?: number;
  pass2Km?: number;
  /** Oczekiwany czas do przeszukania miejsca, w którym przebywa osoba (ważony mapą priorytetów) */
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

export interface MapFeatures {
  waterways: LatLng[][];
  buildings: LatLng[];
  source: 'openstreetmap';
  fetchedAt: string;
}

/** Siatka prawdopodobieństwa przebywania osób (mapa priorytetów) */
export interface PriorityGrid {
  cellM: number;
  lat0: number;
  lng0: number;
  minX: number;
  minY: number;
  nx: number;
  ny: number;
  /** Wagi komórek (wiersz po wierszu), 0 poza strefą */
  weights: number[];
  minWeight: number;
  maxWeight: number;
  uniform: boolean;
  sources: string[];
}

/** Ukryta w symulacji osoba lub fałszywe źródło ciepła („prawda terenowa”) */
export interface HiddenTarget {
  id: string;
  kind: 'osoba' | 'zrodlo_ciepla';
  lat: number;
  lng: number;
  persons: number;
  waterDepthM: number;
  currentSpeedMs: number;
  personHeightM: number;
  position: 'w_wodzie' | 'na_dachu' | 'na_podwyzszeniu';
  collapseRisk: boolean;
  /** Wysokość powierzchni, na której stoi osoba, nad lustrem wody [m] (0 – osoba w wodzie) */
  surfaceAboveWaterM?: number;
  /** Rodzaj obiektu, na którym przebywa osoba (dach budynku, samochód, drzewo…) */
  objectLabel?: string;
  /** Krytyczna intensywność przepływu D·V [m²/s], przy której obiekt zostaje porwany/zniszczony */
  dvThreshold?: number;
  /** Lokalny mnożnik prognozowanego przyboru wody (koryto, zagłębienie terenu) */
  riseFactor?: number;
  /** Faktyczne potrzeby osoby – dron poznaje je dopiero z odpowiedzi na pytania z głośnika */
  needsMedical?: boolean;
  needsFood?: boolean;
  /** Przebiegi sensorów, które już minęły ten punkt (dronId:pass) */
  sensed: string[];
  signalled: boolean;
  resolved: boolean;
  foundAtSim?: number;
}

export interface SearchSignal {
  id: string;
  targetId: string;
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

export interface MissionAssignments {
  dowodca: AssignedPerson[];
  weryfikator: AssignedPerson[];
  technik: AssignedPerson[];
  logistyk: AssignedPerson[];
  ratownik: AssignedPerson[];
}

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

/** Kolejne kroki procedury drona przy odnalezionej osobie (widoczne w transmisji z kamery) */
export type ProcedureStage = 'pozycja' | 'pomiar' | 'prognoza' | 'kategoria' | 'raport' | 'wywiad_lekarz' | 'wywiad_jedzenie' | 'decyzja';

export interface DroneProcedure {
  stage: ProcedureStage;
  ticks: number;
  stages: ProcedureStage[];
  /** Detekcja przed wysłaniem do sztabu (po etapie „raport” – tylko detectionId) */
  det: Detection | null;
  detectionId: string;
  startedSim: number;
  /** Potrzeby odnalezionej osoby (prawda terenowa), ujawniane gestami w trakcie wywiadu */
  needs?: { medical: boolean; food: boolean };
}

/** Linia dziennika nakładki na obraz z kamery */
export interface FeedLine {
  t: number;
  level: MissionEventLevel;
  text: string;
}

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
  battery: number; // %
  speed: number; // m/s
  heading: number; // deg
  cruiseSpeed: number;
  maxPayloadKg: number;
  hasThermal: boolean;
  hasSpeaker: boolean;
  radioRangeKm: number;
  effectiveMinutes: number; // pełna bateria w bieżących warunkach
  scanIndex: number; // indeks kolejnego punktu trasy skanowania
  extraWaypoints: Waypoint[]; // punkty przejęte od innych dronów
  sectorDone: boolean;
  calibrated: boolean;
  connected: boolean;
  linkLost: boolean;
  linkLostSinceSim?: number;
  sectorReassigned: boolean;
  lastTelemetryAt: string;
  taskTicks: number; // licznik zadań zawisu
  detectionId?: string | null;
  deliveryId?: string | null;
  returnReason?: string | null;
  offlineBuffer: Detection[]; // detekcje zapisane w trybie offline (przekazywane po lądowaniu)
  target: { lat: number; lng: number } | null;
  candidate: { lat: number; lng: number; falseAlarm: boolean; source: 'termowizja' | 'rgb'; targetId?: string; signalId?: string } | null;
  /** Sygnały z szybkiego rozpoznania do sprawdzenia w przeszukaniu dokładnym */
  signalQueue: string[];
  /** Pozostały czas trwającego zawrotu [s] */
  turnPendingS?: number;
  // Ostatnia telemetria odebrana przez C2 (zamrożona po utracie łączności)
  reportedLat: number;
  reportedLng: number;
  reportedBattery: number;
  batterySwapWaitTicks: number;
  sorties: number;
  distanceKm: number;
  flightSeconds: number;
  track: LatLng[];
  groundedByWeather: boolean;
  spec: DroneSpec;
  /** Bieżąca czynność drona – podpis w transmisji z kamery */
  activity?: string;
  activityDetail?: string;
  feedLog?: FeedLine[];
  procedure?: DroneProcedure | null;
}

export type Criticality = 'krytyczny' | 'umiarkowany' | 'niski';

/** Prognoza hydrologiczna dla strefy (przybór wody do kulminacji fali) */
export interface FloodForecast {
  baseRiseCmH: number;
  riseCmH: number;
  peakInH: number;
  issuedAtSim: number;
  source: string;
}

/** Analiza sytuacji osoby wykonana przez drona na miejscu */
export interface VictimAssessment {
  referenceHeightM: number;
  /** Skala obrazu po zbliżeniu (piksele na metr) */
  pxPerM: number;
  personPx: number;
  /** Odległość stopy osoby → lustro wody w pikselach (null – osoba w wodzie) */
  freeboardPx: number | null;
  /** Oszacowany zapas do zalania obiektu [m] */
  freeboardM: number | null;
  objectLabel: string;
  riseCmH: number;
  peakInH: number;
  forecastRiseCm: number;
  /** Za ile minut woda dojdzie do stóp osoby (null – nie przed kulminacją) */
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
  pk: number; // Poziom Krytyczności 0..1
  criticality: Criticality;
  status: 'wstepny' | 'potwierdzony' | 'odrzucony';
  offline: boolean;
  gesture: 'lekarz' | 'woda_jedzenie' | 'brak' | null;
  interviewStatus: 'nie_dotyczy' | 'w_toku' | 'zakonczony';
  verifiedBy?: string;
  verifiedAt?: string;
  rescueStatus: 'oczekuje' | 'w_drodze' | 'ewakuowano';
  rescueTeam?: string;
  history: string[];
  assessment?: VictimAssessment;
  /** Odpowiedzi na pytania z głośnika (null – nie zadano) */
  medicalNeed?: boolean | null;
  foodNeed?: boolean | null;
  /** Kadr z kamery przesłany do sztabu razem z pinezką */
  photo?: { capturedAtSim: number; altAgl: number; heading: number; droneName: string } | null;
}

export type DeliveryStatus =
  | 'oczekuje_autoryzacji'
  | 'oczekuje_zaladunku'
  | 'oczekuje_drona'
  | 'w_locie'
  | 'zrzucono'
  | 'odrzucona';

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
  decidedAt?: string;
}

export type MissionEventLevel = 'info' | 'sukces' | 'ostrzezenie' | 'krytyczny';

export interface MissionEvent {
  id: string;
  at: string;
  simSeconds: number;
  level: MissionEventLevel;
  category: 'system' | 'pogoda' | 'dron' | 'detekcja' | 'dostawa' | 'lacznosc' | 'zespol' | 'plan';
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
  mapFeatures: MapFeatures | null;
  priorityGrid: PriorityGrid | null;
  /** Prawda terenowa symulacji – nigdy nie jest wysyłana do przeglądarki */
  hidden: HiddenTarget[];
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
  /** Czas symulacji w chwili startu operacji */
  startedAtSim?: number;
  /** Liczba kolejnych ticków bez aktywności floty (zabezpieczenie przed zawieszeniem operacji) */
  idleTicks?: number;
  lastWeatherCheckSim: number;
  floodForecast?: FloodForecast;
  /** Symulacja wstrzymana przez dowódcę – stan operacji zamrożony do wznowienia */
  paused?: boolean;
  /** Tempo symulacji: ile sekund operacji mija w 1 s czasu rzeczywistego (domyślnie 20) */
  timeScale?: number;
  pausedBy?: string | null;
  pausedAt?: string | null;
  stats: {
    vests: number;
    medkits: number;
    foodWater: number;
    falseAlarmsOnboard: number;
    falseAlarmsVerifier: number;
  };
}

export interface MissionAttributes {
  id: string;
  name: string;
  description?: string | null;
  status: MissionStatus;
  createdById: string;
  data: MissionData;
  startedAt?: Date | null;
  endedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MissionCreationAttributes
  extends Optional<
    MissionAttributes,
    'id' | 'description' | 'status' | 'startedAt' | 'endedAt' | 'createdAt' | 'updatedAt'
  > {}

export class Mission extends Model<MissionAttributes, MissionCreationAttributes> implements MissionAttributes {
  declare id: string;
  declare name: string;
  declare description: string | null;
  declare status: MissionStatus;
  declare createdById: string;
  declare data: MissionData;
  declare startedAt: Date | null;
  declare endedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Mission.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: 'Nazwa operacji jest wymagana' } },
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'planowanie' },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    data: { type: DataTypes.JSON, allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'missions',
    timestamps: true,
  }
);

export const DEFAULT_CHECKLIST = (): ChecklistItem[] => [
  {
    id: 'zaladunek',
    label: 'Załadunek floty i wyjazd do Strefy Zero',
    description: 'Wozy z mobilnym centrum dowodzenia i wyselekcjonowaną flotą docierają na bezpieczną krawędź strefy zalewowej.',
    done: false,
    automatic: false,
  },
  {
    id: 'rtk',
    label: 'Rozstawienie anten kierunkowych RTK',
    description: 'Stacja bazowa RTK zapewnia precyzyjne pozycjonowanie dronów.',
    done: false,
    automatic: false,
  },
  {
    id: 'mesh',
    label: 'Uruchomienie wzmacniaczy sygnału (MESH)',
    description: 'Topologia MESH gwarantuje ciągłość łączności na obszarze bez zasilania.',
    done: false,
    automatic: false,
  },
  {
    id: 'kalibracja',
    label: 'Kalibracja dronów (IMU, kompas, gimbal)',
    description: 'Procedura przedstartowa wykonywana automatycznie dla każdej maszyny.',
    done: false,
    automatic: true,
  },
  {
    id: 'polaczenie',
    label: 'Połączenie floty z serwerem C2',
    description: 'Wszystkie drony zgłaszają telemetrię i oczekują na przydział sektorów.',
    done: false,
    automatic: true,
  },
];

export const emptyAssignments = (): MissionAssignments => ({
  dowodca: [],
  weryfikator: [],
  technik: [],
  logistyk: [],
  ratownik: [],
});

export const createInitialMissionData = (
  base: { lat: number; lng: number; name?: string },
  radioRangeKm: number
): MissionData => ({
  base,
  radioRangeKm,
  area: [],
  noFlyZones: [],
  weather: null,
  weatherOverride: null,
  weatherHistory: [],
  fleetAnalysis: [],
  selectedDroneIds: [],
  sectors: [],
  planWarnings: [],
  searchMode: 'dwuprzebiegowy',
  priorityZones: [],
  mapFeatures: null,
  priorityGrid: null,
  hidden: [],
  signals: [],
  assignments: emptyAssignments(),
  checklist: DEFAULT_CHECKLIST(),
  drones: [],
  detections: [],
  deliveries: [],
  recommendations: [],
  events: [],
  simSeconds: 0,
  lastWeatherCheckSim: 0,
  stats: { vests: 0, medkits: 0, foodWater: 0, falseAlarmsOnboard: 0, falseAlarmsVerifier: 0 },
});

/** Uzupełnia pola dodane w nowszych wersjach systemu (operacje zapisane wcześniej) */
export const normalizeMissionData = (d: MissionData): MissionData => {
  d.searchMode ??= 'jednoprzebiegowy';
  d.priorityZones ??= [];
  d.mapFeatures ??= null;
  d.priorityGrid ??= null;
  d.hidden ??= [];
  d.signals ??= [];
  for (const r of d.drones ?? []) {
    r.signalQueue ??= [];
    r.feedLog ??= [];
  }
  return d;
};

export default Mission;
