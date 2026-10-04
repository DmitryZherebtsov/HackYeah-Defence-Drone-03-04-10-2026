/**
 * Kroki 2–3 planu: Wzór A (możliwości lotu) i Wzór B (współczynnik powodzenia lotu w danej pogodzie),
 * automatyczne kompletowanie floty oraz ocena Poziomu Krytyczności (PK) z kroku 7.
 */
import type { BatteryCurvePoint, DroneCategory } from '../models/Drone';
import type {
  CapabilityEvaluation,
  Criticality,
  FleetAnalysisItem,
  WeatherEvaluation,
  WeatherSnapshot,
} from '../models/Mission';

export interface DroneSpec {
  id: string;
  name: string;
  model: string;
  category: DroneCategory;
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
}

export const RTH_RESERVE = 0.2; // obowiązkowa rezerwa baterii na powrót
export const IMAGE_OVERLAP = 0.2; // zakładka pasów skanowania
export const MIN_FLIGHT_COEFFICIENT = 0.35; // poniżej tej wartości Wzoru B lot jest blokowany
export const DEFAULT_SCAN_AGL = 60; // m
export const ECHELON_STEP_M = 15; // różnica wysokości sąsiednich sektorów
export const MAX_AGL_M = 120; // limit kategorii otwartej
export const SECTOR_BUFFER_M = 20; // bufor bezpieczeństwa między sektorami
/** Zapas czasu baterii na obsługę detekcji w locie (zawis, wywiad gestami, monitorowanie zrzutu) */
export const DETECTION_CONTINGENCY = 0.15;
/** Nadwyżka pokrycia floty ponad strefę – pozwala wyrównać czasy powrotu wszystkich dronów */
export const FLEET_COVERAGE_MARGIN = 1.25;
export const LIFE_VEST_KG = 1.0;
export const MIN_VESTS_PER_DROP = 2;

/** Dopuszczalna intensywność opadu (mm/h) na podstawie drugiej cyfry klasy IP */
export const rainLimitForIp = (ip: string): number => {
  const digit = ip?.toUpperCase().match(/^IP[0-6X]([0-9X])$/)?.[1];
  const table: Record<string, number> = { X: 0, '0': 0, '1': 0.5, '2': 1, '3': 2.5, '4': 7.5, '5': 15, '6': 30, '7': 50, '8': 50, '9': 50 };
  return table[digit ?? '0'] ?? 0;
};

/** Krzywa spadku baterii – interpolacja liniowa czasu lotu dla temperatury */
export const flightMinutesAtTemp = (curve: BatteryCurvePoint[], temp: number): number => {
  if (!curve || curve.length === 0) return 0;
  const pts = [...curve].sort((a, b) => a.temp - b.temp);
  if (temp <= pts[0].temp) return pts[0].minutes;
  if (temp >= pts[pts.length - 1].temp) return pts[pts.length - 1].minutes;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (temp >= a.temp && temp <= b.temp) {
      const t = (temp - a.temp) / (b.temp - a.temp || 1);
      return a.minutes + t * (b.minutes - a.minutes);
    }
  }
  return pts[pts.length - 1].minutes;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * WZÓR B – współczynnik powodzenia lotu w bieżących warunkach pogodowych.
 *   B = f_wiatr · f_opad · f_temp,  gdzie:
 *   f_wiatr = 1 − 0.6·(porywy / Vmax)²
 *   f_opad  = 1 − 0.4·(opad / limit_IP)
 *   f_temp  = 1 − 0.3·max(0, 1 − odległość_od_granicy / 5°C)
 * Przekroczenie dowolnej granicy twardej (wiatr, IP, zakres temperatur, noc bez termowizji) ⇒ B = 0.
 */
export const weatherCoefficient = (drone: DroneSpec, w: WeatherSnapshot): WeatherEvaluation => {
  const reasons: string[] = [];
  const rainLimit = rainLimitForIp(drone.ipRating);
  const gust = Math.max(w.windGust, w.windSpeed);

  if (gust > drone.maxWindSpeed) {
    reasons.push(`Porywy wiatru ${round(gust, 1)} m/s przekraczają limit ${drone.maxWindSpeed} m/s`);
  }
  if (w.precipitation > rainLimit) {
    reasons.push(
      rainLimit === 0
        ? `Opad ${round(w.precipitation, 1)} mm/h – ${drone.ipRating} nie dopuszcza lotu w deszczu`
        : `Opad ${round(w.precipitation, 1)} mm/h przekracza limit ${drone.ipRating} (${rainLimit} mm/h)`
    );
  }
  if (w.temperature < drone.minTemp || w.temperature > drone.maxTemp) {
    reasons.push(`Temperatura ${round(w.temperature, 1)}°C poza zakresem ${drone.minTemp}…${drone.maxTemp}°C`);
  }
  if (!w.isDay && drone.category === 'zwiadowczy' && !drone.hasThermal) {
    reasons.push('Noc – dron zwiadowczy bez termowizji nie wykona poszukiwań');
  }

  const fWind = 1 - 0.6 * clamp(gust / drone.maxWindSpeed, 0, 1) ** 2;
  const fRain = rainLimit > 0 ? 1 - 0.4 * clamp(w.precipitation / rainLimit, 0, 1) : w.precipitation > 0 ? 0 : 1;
  const tempMargin = Math.min(w.temperature - drone.minTemp, drone.maxTemp - w.temperature);
  const fTemp = 1 - 0.3 * clamp(1 - tempMargin / 5, 0, 1);

  let coefficient = reasons.length > 0 ? 0 : clamp(fWind * fRain * fTemp, 0, 1);
  if (reasons.length === 0 && coefficient < MIN_FLIGHT_COEFFICIENT) {
    reasons.push(`Współczynnik powodzenia lotu ${round(coefficient)} poniżej progu ${MIN_FLIGHT_COEFFICIENT}`);
  }
  coefficient = round(coefficient, 3);

  return { coefficient, canFly: reasons.length === 0, reasons, rainLimitMmH: rainLimit };
};

/** Efektywny udźwig w danych warunkach – silny wiatr ogranicza bezpieczny ładunek */
export const effectivePayloadKg = (drone: DroneSpec, w: WeatherSnapshot): number => {
  if (drone.maxPayloadKg <= 0) return 0;
  const gust = Math.max(w.windGust, w.windSpeed);
  return round(drone.maxPayloadKg * (1 - 0.5 * clamp(gust / drone.maxWindSpeed, 0, 1)), 2);
};

export const swathWidthM = (altitudeAgl: number, fovDeg: number): number =>
  2 * altitudeAgl * Math.tan(((fovDeg / 2) * Math.PI) / 180) * (1 - IMAGE_OVERLAP);

export const scanSpeedFor = (drone: Pick<DroneSpec, 'cruiseSpeed'>): number => Math.min(drone.cruiseSpeed * 0.7, 10);

/** Czas lotu (min) przy pełnej baterii w bieżących warunkach */
export const effectiveFlightMinutes = (drone: DroneSpec, w: WeatherSnapshot, payloadKg = 0): number => {
  const base = flightMinutesAtTemp(drone.batteryCurve, w.temperature);
  const windFactor = 1 - 0.35 * clamp(w.windSpeed / drone.maxWindSpeed, 0, 1);
  const payloadFactor = drone.maxPayloadKg > 0 ? 1 - 0.25 * clamp(payloadKg / drone.maxPayloadKg, 0, 1) : 1;
  return base * windFactor * payloadFactor;
};

/**
 * WZÓR A – możliwości lotu drona na określonym terytorium.
 *   T_eff  = T_bat(temp) · (1 − 0.35·wiatr/Vmax) · (1 − 0.25·ładunek/udźwig)
 *   T_scan = T_eff·(1 − rezerwa_RTH) − 2·d_transit / V_przelot
 *   pas    = 2·h·tan(FOV/2)·(1 − zakładka)
 *   A      = T_scan · V_skan · pas   [km²]
 */
export const flightCapability = (
  drone: DroneSpec,
  w: WeatherSnapshot,
  transitKm: number,
  altitudeAgl = DEFAULT_SCAN_AGL
): CapabilityEvaluation => {
  const baseMinutes = flightMinutesAtTemp(drone.batteryCurve, w.temperature);
  const effectiveMinutes = effectiveFlightMinutes(drone, w);
  const reserveMinutes = effectiveMinutes * RTH_RESERVE;
  const transitMinutes = (2 * transitKm * 1000) / drone.cruiseSpeed / 60;
  const scanMinutes = Math.max(0, effectiveMinutes - reserveMinutes - transitMinutes);
  const scanSpeed = scanSpeedFor(drone);
  const swathM = swathWidthM(altitudeAgl, drone.cameraFovDeg);
  const areaKm2 = drone.category === 'zwiadowczy' ? (scanMinutes * 60 * scanSpeed * swathM) / 1e6 : 0;
  const rangeKm = ((effectiveMinutes * (1 - RTH_RESERVE)) * 60 * drone.cruiseSpeed) / 2 / 1000;

  return {
    baseMinutes: round(baseMinutes, 1),
    effectiveMinutes: round(effectiveMinutes, 1),
    reserveMinutes: round(reserveMinutes, 1),
    transitMinutes: round(transitMinutes, 1),
    scanMinutes: round(scanMinutes, 1),
    scanSpeed: round(scanSpeed, 1),
    swathM: round(swathM, 1),
    areaKm2: round(areaKm2, 3),
    rangeKm: round(rangeKm, 2),
    effectivePayloadKg: effectivePayloadKg(drone, w),
  };
};

export const analyzeDrone = (
  drone: DroneSpec,
  w: WeatherSnapshot,
  transitKm: number,
  availability: { available: boolean; reason?: string } = { available: true }
): FleetAnalysisItem => {
  const weather = weatherCoefficient(drone, w);
  const capability = flightCapability(drone, w, transitKm);
  if (drone.category === 'dostawczy' && weather.canFly && capability.effectivePayloadKg < LIFE_VEST_KG * MIN_VESTS_PER_DROP) {
    weather.canFly = false;
    weather.reasons.push(
      `Bezpieczny udźwig przy obecnym wietrze ${capability.effectivePayloadKg} kg – za mało na zrzut ${MIN_VESTS_PER_DROP} kamizelek`
    );
  }
  const k = drone.category === 'zwiadowczy' ? capability.areaKm2 * weather.coefficient : capability.effectivePayloadKg * weather.coefficient;
  return {
    droneId: drone.id,
    name: drone.name,
    model: drone.model,
    category: drone.category,
    hasThermal: drone.hasThermal,
    weather,
    capability,
    flightCoefficient: round(weather.canFly ? k : 0, 3),
    available: availability.available,
    unavailableReason: availability.reason,
  };
};

/**
 * Krok 2 – automatyczne kompletowanie floty: liczba zwiadowców wynika z wielkości strefy
 * i pokrycia pojedynczego drona, a dostawczych – z proporcji 1 na 2 zwiadowców (min. 1).
 * W nocy preferowane są maszyny z termowizją.
 */
export const composeFleet = (
  analysis: FleetAnalysisItem[],
  areaKm2: number,
  isDay: boolean,
  twoPass = false
): { selectedDroneIds: string[]; scouts: number; delivery: number; rationale: string[] } => {
  const rationale: string[] = [];
  const eligible = analysis.filter((a) => a.available && a.weather.canFly);
  const scouts = eligible
    .filter((a) => a.category === 'zwiadowczy')
    .sort((a, b) => Number(b.hasThermal) - Number(a.hasThermal) || b.flightCoefficient - a.flightCoefficient);
  const delivery = eligible.filter((a) => a.category === 'dostawczy').sort((a, b) => b.flightCoefficient - a.flightCoefficient);

  const blocked = analysis.filter((a) => !a.weather.canFly).length;
  if (blocked > 0) rationale.push(`${blocked} dron(ów) zablokowano – nie sprostają bieżącym warunkom pogodowym.`);

  let chosenScouts: FleetAnalysisItem[] = [];
  if (scouts.length > 0) {
    if (areaKm2 > 0) {
      let covered = 0;
      // Pokrycie liczone z zapasem na obsługę detekcji – tak samo jak w planowaniu sektorów
      for (const s of scouts) {
        if (covered >= areaKm2 * FLEET_COVERAGE_MARGIN && chosenScouts.length > 0) break;
        chosenScouts.push(s);
        // Tryb dwuprzebiegowy: rozpoznanie + przeszukanie dokładne zużywają ok. 1,6× więcej baterii
        covered += (s.capability.areaKm2 * (1 - DETECTION_CONTINGENCY)) / (twoPass ? 1.6 : 1);
      }
      rationale.push(
        `Strefa ${round(areaKm2)} km² – wybrano ${chosenScouts.length} zwiadowców o łącznym pokryciu ${round(covered)} km² na jedno wyjście (z zapasem na detekcje i wyrównanie powrotów).`
      );
      if (twoPass) rationale.push('Tryb dwuprzebiegowy (szybkie rozpoznanie + przeszukanie dokładne) – flota dobrana z zapasem na dwa przeloty.');
      if (covered < areaKm2) rationale.push('Pokrycie mniejsze niż strefa – sektory wymagają kilku wylotów z wymianą baterii (Pit-Stop).');
    } else {
      chosenScouts = scouts;
      rationale.push('Strefa nie jest jeszcze wyznaczona – wstępnie wybrano wszystkie sprawne drony zwiadowcze.');
    }
    if (!isDay) rationale.push('Operacja nocna – priorytet dla jednostek z termowizją (FLIR).');
  } else {
    rationale.push('Brak drona zwiadowczego zdolnego do lotu w obecnych warunkach.');
  }

  const deliveryCount = Math.min(delivery.length, Math.max(1, Math.ceil(chosenScouts.length / 2)));
  const chosenDelivery = delivery.slice(0, deliveryCount);
  if (chosenDelivery.length > 0) {
    rationale.push(`Dobrano ${chosenDelivery.length} dron(y) dostawcze zdolne do bezpiecznego zrzutu kamizelek przy obecnej pogodzie.`);
  } else {
    rationale.push('Brak drona dostawczego zdolnego do zrzutu – dostawy przejmą zespoły naziemne.');
  }

  return {
    selectedDroneIds: [...chosenScouts, ...chosenDelivery].map((a) => a.droneId),
    scouts: chosenScouts.length,
    delivery: chosenDelivery.length,
    rationale,
  };
};

/**
 * Krok 7.1.2 – Poziom Krytyczności (PK):
 *   zanurzenie = głębokość / wzrost
 *   PK = 0.45·min(1, zanurzenie/0.8) + 0.30·min(1, nurt/2 m/s) + 0.25·ryzyko_pozycji
 *   Ryzyko zawalenia budynku ⇒ PK ≥ 0.9.   PK ≥ 0.6 – krytyczny, ≥ 0.3 – umiarkowany.
 */
export const criticalityLevel = (input: {
  waterDepthM: number;
  currentSpeedMs: number;
  personHeightM: number;
  position: 'w_wodzie' | 'na_dachu' | 'na_podwyzszeniu';
  collapseRisk: boolean;
}): { pk: number; criticality: Criticality } => {
  const submersion = input.waterDepthM / Math.max(0.5, input.personHeightM);
  const positionRisk = input.position === 'w_wodzie' ? 1 : input.position === 'na_podwyzszeniu' ? 0.45 : 0.25;
  let pk = 0.45 * clamp(submersion / 0.8, 0, 1) + 0.3 * clamp(input.currentSpeedMs / 2, 0, 1) + 0.25 * positionRisk;
  if (input.collapseRisk) pk = Math.max(pk, 0.9);
  pk = round(clamp(pk, 0, 1), 2);
  const criticality: Criticality = pk >= 0.6 ? 'krytyczny' : pk >= 0.3 ? 'umiarkowany' : 'niski';
  return { pk, criticality };
};

/** Wzrost wzorcowy przyjmowany przez drona do przeliczenia skali obrazu (średni wzrost dorosłego) */
export const REFERENCE_HEIGHT_M = 1.7;
/** Osoba w wodzie – intensywność D·V, przy której człowiek traci stabilność */
export const PERSON_DV_THRESHOLD = 0.5;

const pkToCriticality = (pk: number): Criticality => (pk >= 0.6 ? 'krytyczny' : pk >= 0.3 ? 'umiarkowany' : 'niski');

/** Szansa porwania obiektu przez nurt: krzywa logistyczna względem krytycznej intensywności D·V */
export const sweepRiskPct = (dv: number, threshold: number) => Math.round(100 / (1 + Math.exp(-(dv / Math.max(0.1, threshold) - 1) * 4)));

/**
 * Ocena sytuacji osoby na podstawie pomiarów drona i prognozy hydrologicznej:
 *  - osoba w wodzie ⇒ zawsze kategoria krytyczna,
 *  - poza wodą: zapas do zalania (oszacowany ze skali wzrostu) porównany z prognozowanym przyborem
 *    wody do kulminacji ⇒ czas do zalania obiektu,
 *  - intensywność przepływu D·V (głębokość × prędkość nurtu) przy kulminacji ⇒ ryzyko porwania obiektu,
 *  - zgłoszona potrzeba pomocy medycznej ⇒ PK = 1.
 *   PK = 0.5·zalanie + 0.35·porwanie + 0.15·ryzyko_pozycji (budynek grożący zawaleniem ⇒ PK ≥ 0.9)
 */
export const assessVictim = (input: {
  position: 'w_wodzie' | 'na_dachu' | 'na_podwyzszeniu';
  waterDepthM: number;
  currentSpeedMs: number;
  personHeightM: number;
  collapseRisk: boolean;
  freeboardM: number | null;
  dvThreshold: number;
  riseCmH: number;
  peakInH: number;
  medical?: boolean;
}) => {
  const inWater = input.position === 'w_wodzie';
  const forecastRiseCm = Math.round(Math.max(0, input.riseCmH) * Math.max(0, input.peakInH));
  const dvNow = round(input.waterDepthM * input.currentSpeedMs, 2);
  const dvPeak = round((input.waterDepthM + forecastRiseCm / 100) * input.currentSpeedMs, 2);
  const threshold = inWater ? PERSON_DV_THRESHOLD : input.dvThreshold;
  const sweep = sweepRiskPct(dvPeak, threshold);
  const reasons: string[] = [];
  let minutesToFlood: number | null = null;
  let pk: number;

  if (inWater) {
    pk = Math.max(0.85, criticalityLevel(input).pk);
    reasons.push('osoba w wodzie – kategoria krytyczna');
    if (sweep >= 50) reasons.push(`nurt może porwać osobę (D·V ${dvPeak} m²/s)`);
  } else {
    const freeCm = Math.max(0, (input.freeboardM ?? 0) * 100);
    if (input.riseCmH > 0 && freeCm <= forecastRiseCm) minutesToFlood = Math.round((freeCm / input.riseCmH) * 60);
    const floodScore =
      minutesToFlood === null ? 0.25 * clamp(forecastRiseCm / Math.max(1, freeCm), 0, 1) : clamp(1 - (minutesToFlood - 30) / 330, 0.3, 1);
    const positionRisk = input.position === 'na_podwyzszeniu' ? 0.6 : 0.3;
    pk = 0.5 * floodScore + 0.35 * (sweep / 100) + 0.15 * positionRisk;
    if (minutesToFlood !== null) reasons.push(`zalanie obiektu za ~${minutesToFlood} min`);
    if (sweep >= 50) reasons.push(`ryzyko porwania obiektu ${sweep}%`);
    if (input.collapseRisk) {
      pk = Math.max(pk, 0.9);
      reasons.push('ryzyko zawalenia budynku');
    }
  }
  if (input.medical) {
    pk = 1;
    reasons.push('zgłoszona potrzeba pomocy medycznej');
  }
  pk = round(clamp(pk, 0, 1), 2);
  const dangerous = inWater || sweep >= 50 || input.collapseRisk || (minutesToFlood !== null && minutesToFlood <= 180) || (!input.medical && pk >= 0.6);
  return { forecastRiseCm, minutesToFlood, dvNow, dvPeak, dvThreshold: threshold, sweepRiskPct: sweep, pk, criticality: pkToCriticality(pk), dangerous, reasons };
};
