/**
 * Pobieranie bieżących komunikatów meteorologicznych (Open-Meteo, bez klucza API)
 * oraz danych wysokościowych terenu. W razie braku łączności zwracane są dane zastępcze
 * wyraźnie oznaczone jako symulacja.
 */
import type { WeatherSnapshot } from '../models/Mission';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const TIMEOUT_MS = 6000;

const isTest = () => process.env.NODE_ENV === 'test';

const fetchJson = async (url: string): Promise<any> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

export const simulatedWeather = (lat: number, lng: number): WeatherSnapshot => ({
  lat,
  lng,
  temperature: 12,
  windSpeed: 5,
  windGust: 8,
  windDirection: 270,
  precipitation: 1.5,
  isDay: true,
  source: 'symulacja',
  fetchedAt: new Date().toISOString(),
});

export const fetchCurrentWeather = async (lat: number, lng: number): Promise<WeatherSnapshot> =>
  (await fetchLiveWeather(lat, lng)) ?? simulatedWeather(lat, lng);

/** Odczyt na żywo; null przy braku łączności (w trakcie operacji zachowujemy ostatni znany odczyt) */
export const fetchLiveWeather = async (lat: number, lng: number): Promise<WeatherSnapshot | null> => {
  if (isTest()) return simulatedWeather(lat, lng);
  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      current: 'temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day',
      wind_speed_unit: 'ms',
    });
    const data = await fetchJson(`${FORECAST_URL}?${params.toString()}`);
    const c = data?.current;
    if (!c) throw new Error('Brak sekcji current');
    return {
      lat,
      lng,
      temperature: Number(c.temperature_2m ?? 0),
      windSpeed: Number(c.wind_speed_10m ?? 0),
      windGust: Number(c.wind_gusts_10m ?? c.wind_speed_10m ?? 0),
      windDirection: c.wind_direction_10m === undefined ? undefined : Number(c.wind_direction_10m),
      // Open-Meteo podaje sumę opadu dla 15-minutowego interwału – przeliczenie na mm/h
      precipitation: Number(c.precipitation ?? 0) * (3600 / Number(c.interval || 3600)),
      isDay: Number(c.is_day ?? 1) === 1,
      source: 'open-meteo',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn(`⚠️ Nie udało się pobrać pogody (${err?.message}).`);
    return null;
  }
};

/** Wysokość terenu (m n.p.m.) dla listy punktów; null, jeśli dane niedostępne */
export const fetchElevations = async (points: { lat: number; lng: number }[]): Promise<number[] | null> => {
  if (points.length === 0) return [];
  if (isTest()) return points.map(() => 300);
  try {
    const result: number[] = [];
    for (let i = 0; i < points.length; i += 100) {
      const chunk = points.slice(i, i + 100);
      const params = new URLSearchParams({
        latitude: chunk.map((p) => p.lat.toFixed(5)).join(','),
        longitude: chunk.map((p) => p.lng.toFixed(5)).join(','),
      });
      const data = await fetchJson(`${ELEVATION_URL}?${params.toString()}`);
      if (!Array.isArray(data?.elevation)) throw new Error('Nieprawidłowa odpowiedź');
      result.push(...data.elevation.map((e: unknown) => Number(e) || 0));
    }
    return result;
  } catch (err: any) {
    console.warn(`⚠️ Nie udało się pobrać danych wysokościowych (${err?.message}).`);
    return null;
  }
};
