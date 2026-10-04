/**
 * Serializowany dostęp do stanu operacji. Symulator (co sekundę) i akcje zespołu
 * (weryfikator, logistyk, technik…) modyfikują ten sam dokument JSON – blokada per misja
 * gwarantuje, że żadna zmiana nie zostanie nadpisana.
 */
import { Mission, MissionData, MissionEvent, MissionEventLevel, normalizeMissionData } from '../models/Mission';

export class MissionActionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const locks = new Map<string, Promise<void>>();

export const withMission = async <T>(
  id: string,
  fn: (mission: Mission, data: MissionData) => Promise<T> | T
): Promise<{ mission: Mission; result: T } | null> => {
  const previous = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const chained = previous.then(() => current);
  locks.set(id, chained);
  await previous;
  try {
    const mission = await Mission.findByPk(id);
    if (!mission) return null;
    const data = normalizeMissionData(structuredClone(mission.data) as MissionData);
    const result = await fn(mission, data);
    mission.data = data;
    mission.changed('data', true);
    await mission.save();
    return { mission, result };
  } finally {
    release();
    if (locks.get(id) === chained) locks.delete(id);
  }
};

let eventCounter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(eventCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const MAX_EVENTS = 600;
const MAX_FEED_LINES = 14;

/** Dopisuje linię do nakładki transmisji z kamery drona (bez wpisu na oś czasu operacji) */
export const logFeed = (data: MissionData, droneId: string, level: MissionEventLevel, text: string) => {
  const d = data.drones.find((x) => x.droneId === droneId);
  if (!d) return;
  d.feedLog ??= [];
  d.feedLog.push({ t: data.simSeconds, level, text });
  if (d.feedLog.length > MAX_FEED_LINES) d.feedLog.splice(0, d.feedLog.length - MAX_FEED_LINES);
};

export const addEvent = (
  data: MissionData,
  level: MissionEventLevel,
  category: MissionEvent['category'],
  message: string,
  droneId?: string
) => {
  data.events.push({ id: newId('evt'), at: new Date().toISOString(), simSeconds: data.simSeconds, level, category, message, droneId });
  if (data.events.length > MAX_EVENTS) data.events.splice(0, data.events.length - MAX_EVENTS);
  if (droneId) {
    const d = data.drones.find((x) => x.droneId === droneId);
    // Komunikat w kamerze bez powtórzonej nazwy drona
    if (d) logFeed(data, droneId, level, message.startsWith(`${d.name}: `) ? message.slice(d.name.length + 2) : message);
  }
};
