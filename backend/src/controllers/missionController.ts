import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/protect';
import {
  Drone,
  LatLng,
  Mission,
  MissionData,
  MissionRole,
  Organization,
  User,
  PriorityZone,
  createInitialMissionData,
  emptyAssignments,
  normalizeMissionData,
} from '../models';
import { computePriorityGrid, fetchMapFeatures, gridCells } from '../services/priorityService';
import { toDroneSpec } from './droneController';
import { analyzeDrone, composeFleet, weatherCoefficient } from '../services/flightMath';
import { applyTerrain, areaCentroidLatLng, planSectors, polygonAreaKm2 } from '../services/missionPlanner';
import { fetchCurrentWeather } from '../services/weatherService';
import { MissionActionError, addEvent, newId, withMission } from '../services/missionStore';
import {
  PAYLOAD_LABELS,
  TIME_SCALE,
  TIME_SCALES,
  applyWeather,
  createRuntime,
  currentWeather,
  generateHiddenTargets,
  isAirborne,
  orderReturn,
  releaseFleet,
} from '../services/missionSimulator';
import { haversineKm, LocalProjection, pointInPolygon } from '../services/geo';
import { recordAuditLog } from '../services/auditService';
import { buildMissionReport, buildMissionWorkbook } from '../services/reportService';

const ROLE_LABELS: Record<MissionRole, string> = {
  dowodca: 'Koordynator Operacyjny (Dowódca)',
  weryfikator: 'Weryfikator AI',
  technik: 'Technik Lądowiska (Pit-Stop)',
  logistyk: 'Logistyk Zrzutu',
  ratownik: 'Mobilny Zespół Ratowniczy',
};
const ROLES = Object.keys(ROLE_LABELS) as MissionRole[];

const userName = (u: { firstName?: string; lastName?: string }) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();

const isCommander = (m: Mission, data: MissionData, user: User) =>
  user.role === 'admin' || m.createdById === user.id || data.assignments.dowodca.some((p) => p.userId === user.id);

const userRoles = (m: Mission, data: MissionData, user: User): MissionRole[] => {
  const roles = ROLES.filter((r) => (data.assignments[r] ?? []).some((p) => p.userId === user.id));
  if (isCommander(m, data, user) && !roles.includes('dowodca')) roles.unshift('dowodca');
  return roles;
};

/** Dowódca ma uprawnienia wszystkich ról; pozostali – tylko przydzielonych */
const requireRole = (m: Mission, data: MissionData, user: User, roles: MissionRole[]) => {
  if (isCommander(m, data, user)) return;
  if (roles.some((r) => data.assignments[r].some((p) => p.userId === user.id))) return;
  throw new MissionActionError(403, `Akcja wymaga roli: ${roles.map((r) => ROLE_LABELS[r]).join(' / ')}`);
};

const requireStatus = (m: Mission, statuses: Mission['status'][], message: string) => {
  if (!statuses.includes(m.status)) throw new MissionActionError(400, message);
};

/** Dane do przeglądarki: bez prawdy terenowej symulacji, siatka priorytetów jako lista komórek */
const publicData = (d: MissionData) => {
  const { hidden: _hidden, mapFeatures, priorityGrid, ...rest } = d;
  return {
    ...rest,
    // Potrzeby osoby (odpowiedzi na pytania z głośnika) to prawda terenowa – nie trafiają do przeglądarki przed wywiadem
    drones: rest.drones.map((x) => (x.procedure?.needs ? { ...x, procedure: { ...x.procedure, needs: undefined } } : x)),
    mapFeatures: mapFeatures
      ? { waterways: mapFeatures.waterways, buildingsCount: mapFeatures.buildings.length, source: mapFeatures.source, fetchedAt: mapFeatures.fetchedAt }
      : null,
    priorityGrid: priorityGrid
      ? {
          cellM: priorityGrid.cellM,
          minWeight: priorityGrid.minWeight,
          maxWeight: priorityGrid.maxWeight,
          uniform: priorityGrid.uniform,
          sources: priorityGrid.sources,
          cells: gridCells(priorityGrid).map((c) => [c.lat, c.lng, c.w]),
        }
      : null,
  };
};

const serializeMission = (m: Mission, user: User) => {
  const json = m.toJSON() as any;
  const data = normalizeMissionData(m.data);
  return {
    ...json,
    data: publicData(data),
    timeScale: data.timeScale ?? TIME_SCALE,
    permissions: {
      isCommander: isCommander(m, data, user),
      roles: userRoles(m, data, user),
    },
  };
};

const handleError = (res: Response, error: any, fallback: string) => {
  if (error instanceof MissionActionError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ success: false, message: fallback, error: error?.message });
};

/** Wykonuje akcję na operacji w blokadzie i odsyła zaktualizowany stan */
const missionAction = async (
  req: AuthenticatedRequest,
  res: Response,
  fallback: string,
  fn: (m: Mission, data: MissionData, user: User) => Promise<string | void> | string | void
) => {
  try {
    const user = req.user!;
    const out = await withMission(req.params.id, (m, data) => fn(m, data, user));
    if (!out) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    res.status(200).json({ success: true, message: out.result || 'Zapisano', mission: serializeMission(out.mission, user) });
  } catch (error) {
    handleError(res, error, fallback);
  }
};

const parseLatLngList = (value: unknown): LatLng[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((p: any) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.lat), Number(p?.lng)]))
    .filter((p) => !Number.isNaN(p[0]) && !Number.isNaN(p[1])) as LatLng[];
};

// ============================================================
// LISTA / TWORZENIE
// ============================================================

/** @route GET /api/missions */
export const getMissions = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const missions = await Mission.findAll({
      include: [
        { model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    const list = missions.map((m) => {
      const d = normalizeMissionData(m.data);
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        status: m.status,
        createdAt: m.createdAt,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        createdBy: (m as any).createdBy,
        base: d.base,
        areaKm2: polygonAreaKm2(d.area),
        drones: d.selectedDroneIds.length,
        sectors: d.sectors.length,
        detections: d.detections.filter((x) => x.status !== 'odrzucony').length,
        persons: d.detections.filter((x) => x.status !== 'odrzucony').reduce((s, x) => s + x.persons, 0),
        searchMode: d.searchMode,
        weather: currentWeather(d),
      };
    });
    res.status(200).json({ success: true, missions: list });
  } catch (error) {
    handleError(res, error, 'Błąd podczas pobierania operacji');
  }
};

/** @route POST /api/missions */
export const createMission = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    if (user.role !== 'admin' && user.role !== 'koordynator') {
      res.status(403).json({ success: false, message: 'Operację może utworzyć koordynator lub administrator' });
      return;
    }
    const { name, description } = req.body;
    const lat = Number(req.body.base?.lat);
    const lng = Number(req.body.base?.lng);
    const radioRangeKm = Number(req.body.radioRangeKm ?? 5);
    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
      res.status(400).json({ success: false, message: 'Wymagana nazwa operacji oraz lokalizacja Strefy Zero (base.lat, base.lng)' });
      return;
    }
    if (!(radioRangeKm > 0 && radioRangeKm <= 50)) {
      res.status(400).json({ success: false, message: 'Zasięg łączności MESH musi mieścić się w przedziale 0–50 km' });
      return;
    }
    const data = createInitialMissionData({ lat, lng, name: req.body.base?.name }, radioRangeKm);
    data.assignments.dowodca.push({ userId: user.id, name: userName(user) });
    addEvent(data, 'info', 'system', `Utworzono operację „${name}”. Dowódca: ${userName(user)}.`);
    const mission = await Mission.create({ name, description: description || null, createdById: user.id, data });
    await recordAuditLog({
      action: 'mission_created',
      entityType: 'mission',
      entityId: mission.id,
      user,
      details: `Utworzono operację dronową „${name}”`,
    });
    res.status(201).json({ success: true, message: 'Operacja utworzona', mission: serializeMission(mission, user) });
  } catch (error) {
    handleError(res, error, 'Błąd podczas tworzenia operacji');
  }
};

/** @route GET /api/missions/assignable-users */
export const getAssignableUsers = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await User.findAll({
      where: { isVerified: true },
      attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
      include: [{ model: Organization, as: 'organization', attributes: ['id', 'name', 'type'] }],
      order: [['lastName', 'ASC']],
    });
    res.status(200).json({ success: true, users });
  } catch (error) {
    handleError(res, error, 'Błąd podczas pobierania użytkowników');
  }
};

/** @route GET /api/missions/:id */
export const getMission = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const mission = await Mission.findByPk(req.params.id, {
      include: [
        { model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
    });
    if (!mission) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    res.status(200).json({ success: true, mission: serializeMission(mission, req.user!) });
  } catch (error) {
    handleError(res, error, 'Błąd podczas pobierania operacji');
  }
};

/** @route DELETE /api/missions/:id */
export const deleteMission = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const mission = await Mission.findByPk(req.params.id);
    if (!mission) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    if (!isCommander(mission, mission.data, req.user!)) {
      res.status(403).json({ success: false, message: 'Operację może usunąć dowódca lub administrator' });
      return;
    }
    if (mission.status === 'aktywna' || mission.status === 'powrot') {
      res.status(400).json({ success: false, message: 'Nie można usunąć trwającej operacji – najpierw ją zakończ' });
      return;
    }
    if (mission.status === 'przygotowanie') await releaseFleet(mission.data);
    await mission.destroy();
    res.status(200).json({ success: true, message: 'Operacja usunięta' });
  } catch (error) {
    handleError(res, error, 'Błąd podczas usuwania operacji');
  }
};

// ============================================================
// KROK 2–3: POGODA, WZÓR A / B, KOMPLETOWANIE FLOTY
// ============================================================

/** @route PUT /api/missions/:id/base */
export const updateBase = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zapisu Strefy Zero', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['planowanie'], 'Strefę Zero można zmienić tylko na etapie planowania');
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) throw new MissionActionError(400, 'Nieprawidłowe współrzędne');
    data.base = { lat, lng, name: req.body.name ?? data.base.name };
    if (req.body.radioRangeKm !== undefined) {
      const r = Number(req.body.radioRangeKm);
      if (!(r > 0 && r <= 50)) throw new MissionActionError(400, 'Zasięg łączności MESH musi mieścić się w przedziale 0–50 km');
      data.radioRangeKm = r;
    }
    data.sectors = [];
    data.planStats = undefined;
    return 'Zapisano Strefę Zero';
  });

/** @route POST /api/missions/:id/analyze */
export const analyzeFleet = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const existing = await Mission.findByPk(req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    // Pobranie pogody poza blokadą (zapytanie sieciowe)
    const weather = existing.data.weatherOverride ?? (await fetchCurrentWeather(existing.data.base.lat, existing.data.base.lng));
    const drones = await Drone.findAll({ order: [['name', 'ASC']] });

    await missionAction(req, res, 'Błąd podczas analizy floty', (m, data, user) => {
      requireRole(m, data, user, ['dowodca']);
      requireStatus(m, ['planowanie'], 'Analizę floty wykonuje się na etapie planowania');
      data.weather = weather;
      data.weatherHistory.push(weather);
      const transitKm = data.area.length >= 3 ? haversineKm(data.base, areaCentroidLatLng(data.area)) : 0;
      data.fleetAnalysis = drones.map((d) =>
        analyzeDrone(toDroneSpec(d), weather, transitKm, {
          available: d.status === 'dostepny',
          reason: d.status === 'serwis' ? 'W serwisie' : d.status === 'w_misji' ? 'Przydzielony do innej operacji' : undefined,
        })
      );
      const fleet = composeFleet(data.fleetAnalysis, polygonAreaKm2(data.area), weather.isDay, (data.searchMode ?? 'dwuprzebiegowy') === 'dwuprzebiegowy');
      data.selectedDroneIds = fleet.selectedDroneIds;
      data.fleetSummary = { scouts: fleet.scouts, delivery: fleet.delivery, rationale: fleet.rationale };
      data.sectors = [];
      data.planStats = undefined;
      const blocked = data.fleetAnalysis.filter((a) => !a.weather.canFly).length;
      addEvent(
        data,
        blocked > 0 ? 'ostrzezenie' : 'info',
        'pogoda',
        `Komunikat meteo (${weather.source}): ${weather.temperature.toFixed(1)}°C, wiatr ${weather.windSpeed.toFixed(1)} m/s (porywy ${weather.windGust.toFixed(1)}), opad ${weather.precipitation.toFixed(1)} mm/h. Zablokowano ${blocked} dronów, flota: ${fleet.scouts} zwiad. + ${fleet.delivery} dost.`
      );
      return 'Przeanalizowano flotę w bieżących warunkach';
    });
  } catch (error) {
    handleError(res, error, 'Błąd podczas analizy floty');
  }
};

/** @route PUT /api/missions/:id/fleet */
export const updateFleet = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zapisu floty', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['planowanie'], 'Skład floty można zmienić tylko na etapie planowania');
    const ids: string[] = Array.isArray(req.body.selectedDroneIds) ? req.body.selectedDroneIds : [];
    const blocked = ids.filter((id) => {
      const a = data.fleetAnalysis.find((x) => x.droneId === id);
      return !a || !a.available || !a.weather.canFly;
    });
    if (blocked.length > 0) throw new MissionActionError(400, 'Nie można wybrać dronów zablokowanych przez warunki pogodowe lub niedostępnych');
    data.selectedDroneIds = ids;
    data.sectors = [];
    data.planStats = undefined;
    return 'Zapisano skład floty';
  });

// ============================================================
// KROK 4: STREFA I TRASY
// ============================================================

/** @route PUT /api/missions/:id/area */
export const updateArea = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zapisu strefy', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['planowanie'], 'Strefę można zmienić tylko na etapie planowania');
    const area = parseLatLngList(req.body.area);
    if (area.length > 0 && area.length < 3) throw new MissionActionError(400, 'Strefa musi mieć co najmniej 3 wierzchołki');
    const areaKm2 = polygonAreaKm2(area);
    if (areaKm2 > 60) throw new MissionActionError(400, `Strefa ${areaKm2} km² jest zbyt duża – podziel ją na kilka operacji (maks. 60 km²)`);
    data.area = area;
    data.noFlyZones = Array.isArray(req.body.noFlyZones)
      ? req.body.noFlyZones.map(parseLatLngList).filter((z: LatLng[]) => z.length >= 3)
      : data.noFlyZones;
    data.priorityGrid = computePriorityGrid(data.area, data.priorityZones, data.mapFeatures);
    data.sectors = [];
    data.planStats = undefined;
    return `Zapisano strefę poszukiwań (${areaKm2} km²)`;
  });

/** @route POST /api/missions/:id/plan */
export const generatePlan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const existing = await Mission.findByPk(req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    const src = existing.data;
    if (!src.weather) throw new MissionActionError(400, 'Najpierw pobierz pogodę i przeanalizuj flotę');
    if (src.area.length < 3) throw new MissionActionError(400, 'Najpierw wyznacz strefę poszukiwań na mapie');
    const weather = currentWeather(src)!;
    normalizeMissionData(src);
    const grid = computePriorityGrid(src.area, src.priorityZones, src.mapFeatures);
    const drones = await Drone.findAll({ where: { id: src.selectedDroneIds } });
    const scouts = drones
      .filter((d) => d.category === 'zwiadowczy')
      .map((d) => ({ spec: toDroneSpec(d), analysis: analyzeDrone(toDroneSpec(d), weather, 0) }))
      .filter((s) => s.analysis.weather.canFly);

    let plan;
    try {
      plan = planSectors({
        base: src.base,
        radioRangeKm: src.radioRangeKm,
        area: src.area,
        noFlyZones: src.noFlyZones,
        weather,
        scouts,
        searchMode: src.searchMode,
        priorityGrid: grid,
      });
    } catch (e: any) {
      throw new MissionActionError(400, e.message);
    }
    const terrain = await applyTerrain(plan.sectors);

    await missionAction(req, res, 'Błąd podczas generowania planu', (m, data, user) => {
      requireRole(m, data, user, ['dowodca']);
      requireStatus(m, ['planowanie'], 'Plan można wygenerować tylko na etapie planowania');
      data.priorityGrid = grid;
      data.sectors = plan.sectors;
      data.planWarnings = [...plan.warnings, ...terrain.warnings];
      data.planStats = {
        ...plan.stats,
        terrainMin: terrain.terrainMin,
        terrainMax: terrain.terrainMax,
        terrainSource: terrain.source,
        plannedAt: new Date().toISOString(),
      };
      addEvent(
        data,
        'info',
        'plan',
        `Wygenerowano ${plan.sectors.length} podwarstw (${plan.stats.coveredKm2} km², ${data.searchMode}), oczekiwany czas dotarcia nad miejsce pobytu osoby ${plan.stats.expectedFindMinutes} min.`
      );
      return `Wygenerowano plan lotu dla ${plan.sectors.length} dronów`;
    });
  } catch (error) {
    handleError(res, error, 'Błąd podczas generowania planu');
  }
};

// ============================================================
// MAPA PRIORYTETÓW I TRYB PRZESZUKANIA
// ============================================================

const parseZones = (value: unknown): PriorityZone[] =>
  Array.isArray(value)
    ? value
        .map((z: any) => ({
          id: typeof z?.id === 'string' ? z.id : newId('pz'),
          polygon: parseLatLngList(z?.polygon),
          level: z?.level === 'sredni' ? ('sredni' as const) : ('wysoki' as const),
          label: typeof z?.label === 'string' ? z.label.slice(0, 80) : undefined,
        }))
        .filter((z) => z.polygon.length >= 3)
    : [];

/** @route PUT /api/missions/:id/priority */
export const updatePriority = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zapisu mapy priorytetów', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['planowanie'], 'Mapę priorytetów można zmienić tylko na etapie planowania');
    if (req.body.zones !== undefined) data.priorityZones = parseZones(req.body.zones);
    if (req.body.searchMode !== undefined) {
      if (!['jednoprzebiegowy', 'dwuprzebiegowy'].includes(req.body.searchMode)) throw new MissionActionError(400, 'Nieprawidłowy tryb przeszukania');
      data.searchMode = req.body.searchMode;
    }
    if (req.body.clearFeatures) data.mapFeatures = null;
    data.priorityGrid = computePriorityGrid(data.area, data.priorityZones, data.mapFeatures);
    data.sectors = [];
    data.planStats = undefined;
    return 'Zapisano mapę priorytetów';
  });

/** @route POST /api/missions/:id/priority/auto */
export const autoPriority = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const existing = await Mission.findByPk(req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    if (existing.data.area.length < 3) throw new MissionActionError(400, 'Najpierw wyznacz strefę poszukiwań');
    let features;
    try {
      features = await fetchMapFeatures(existing.data.area);
    } catch (e: any) {
      throw new MissionActionError(502, `Nie udało się pobrać danych z OpenStreetMap (${e?.message ?? 'błąd sieci'}) – spróbuj ponownie lub zaznacz strefy ręcznie.`);
    }
    await missionAction(req, res, 'Błąd podczas wyznaczania priorytetów', (m, data, user) => {
      requireRole(m, data, user, ['dowodca']);
      requireStatus(m, ['planowanie'], 'Mapę priorytetów można zmienić tylko na etapie planowania');
      data.mapFeatures = features;
      data.priorityGrid = computePriorityGrid(data.area, data.priorityZones, features);
      data.sectors = [];
      data.planStats = undefined;
      addEvent(
        data,
        'info',
        'plan',
        `Mapa priorytetów z OpenStreetMap: ${features.waterways.length} cieków wodnych, ${features.buildings.length} budynków.`
      );
      return `Wyznaczono priorytety: ${features.waterways.length} cieków wodnych, ${features.buildings.length} budynków`;
    });
  } catch (error) {
    handleError(res, error, 'Błąd podczas wyznaczania priorytetów');
  }
};

// ============================================================
// KROK 5: ZESPÓŁ
// ============================================================

/** @route PUT /api/missions/:id/assignments */
export const updateAssignments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const requested: Record<string, string[]> = {};
    for (const r of ROLES) requested[r] = Array.isArray(req.body[r]) ? req.body[r].map(String) : [];
    const allIds = [...new Set(Object.values(requested).flat())];
    const users = await User.findAll({
      where: { id: allIds, isVerified: true },
      include: [{ model: Organization, as: 'organization', attributes: ['name'] }],
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    await missionAction(req, res, 'Błąd podczas przydziału zespołu', (m, data, user) => {
      requireRole(m, data, user, ['dowodca']);
      requireStatus(m, ['planowanie', 'przygotowanie', 'aktywna'], 'Zespół zakończonej operacji nie może być zmieniany');
      const next = emptyAssignments();
      for (const r of ROLES) {
        next[r] = requested[r]
          .filter((id) => byId.has(id))
          .map((id) => {
            const u = byId.get(id)!;
            return { userId: u.id, name: userName(u), organizationName: (u as any).organization?.name };
          });
      }
      if (next.dowodca.length === 0) throw new MissionActionError(400, 'Operacja musi mieć co najmniej jednego dowódcę');
      data.assignments = next;
      addEvent(
        data,
        'info',
        'zespol',
        `Przydział ról: ${ROLES.map((r) => `${ROLE_LABELS[r]} – ${next[r].length}`).join(', ')}.`
      );
      return 'Zapisano przydział ról';
    });
  } catch (error) {
    handleError(res, error, 'Błąd podczas przydziału zespołu');
  }
};

// ============================================================
// KROK 2: PRZYGOTOWANIE FLOTY I PROCEDURA PRZEDSTARTOWA
// ============================================================

/** @route POST /api/missions/:id/prepare */
export const prepareMission = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const existing = await Mission.findByPk(req.params.id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    const drones = await Drone.findAll({ where: { id: existing.data.selectedDroneIds } });

    await missionAction(req, res, 'Błąd podczas przygotowania operacji', async (m, data, user) => {
      requireRole(m, data, user, ['dowodca']);
      requireStatus(m, ['planowanie'], 'Operacja została już przygotowana');
      if (data.sectors.length === 0) throw new MissionActionError(400, 'Najpierw wygeneruj plan tras (krok 4)');
      const busy = drones.filter((d) => d.status !== 'dostepny');
      if (busy.length > 0) throw new MissionActionError(400, `Drony niedostępne: ${busy.map((d) => d.name).join(', ')}`);
      if (!drones.some((d) => d.category === 'dostawczy')) {
        addEvent(data, 'ostrzezenie', 'plan', 'Flota nie zawiera drona dostawczego – zrzuty będą niemożliwe.');
      }
      data.drones = drones.map((d) => {
        const sector = data.sectors.find((s) => s.droneId === d.id);
        return createRuntime(toDroneSpec(d), data.base, data.fleetAnalysis.find((a) => a.droneId === d.id), sector?.id ?? null);
      });
      await Drone.update({ status: 'w_misji' }, { where: { id: drones.map((d) => d.id) } });
      m.status = 'przygotowanie';
      addEvent(data, 'info', 'system', `Flota (${drones.length} dronów) załadowana – przygotowanie Strefy Zero.`);
      return 'Operacja w fazie przygotowania';
    });
  } catch (error) {
    handleError(res, error, 'Błąd podczas przygotowania operacji');
  }
};

/** @route POST /api/missions/:id/back-to-planning */
export const backToPlanning = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas powrotu do planowania', async (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['przygotowanie'], 'Do planowania można wrócić tylko przed startem operacji');
    await releaseFleet(data);
    data.drones = [];
    data.checklist.forEach((c) => {
      c.done = false;
      c.doneBy = undefined;
      c.doneAt = undefined;
    });
    m.status = 'planowanie';
    addEvent(data, 'info', 'system', 'Powrót do etapu planowania – flota zwolniona.');
    return 'Powrót do planowania';
  });

/** @route PATCH /api/missions/:id/checklist/:itemId */
export const toggleChecklist = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas aktualizacji procedury', (m, data, user) => {
    requireRole(m, data, user, ['dowodca', 'technik']);
    requireStatus(m, ['przygotowanie'], 'Procedura przedstartowa dotyczy etapu przygotowania');
    const item = data.checklist.find((c) => c.id === req.params.itemId);
    if (!item) throw new MissionActionError(404, 'Nie znaleziono punktu procedury');
    if (item.automatic) throw new MissionActionError(400, 'Ten punkt realizuje automatycznie system C2');
    item.done = req.body.done !== false;
    item.doneBy = item.done ? userName(user) : undefined;
    item.doneAt = item.done ? new Date().toISOString() : undefined;
    if (item.done) addEvent(data, 'sukces', 'zespol', `${item.label} – potwierdził(a) ${userName(user)}.`);
    return 'Zaktualizowano procedurę';
  });

/** @route POST /api/missions/:id/calibrate */
export const calibrateFleet = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas kalibracji', (m, data, user) => {
    requireRole(m, data, user, ['dowodca', 'technik']);
    requireStatus(m, ['przygotowanie'], 'Kalibrację wykonuje się w fazie przygotowania');
    const infra = data.checklist.filter((c) => ['rtk', 'mesh'].includes(c.id));
    if (infra.some((c) => !c.done)) throw new MissionActionError(400, 'Najpierw rozstaw anteny RTK i wzmacniacze MESH');
    for (const d of data.drones) {
      if (d.calibrated) continue;
      d.phase = 'kalibracja';
      d.taskTicks = 2 + Math.floor(Math.random() * 3);
    }
    addEvent(data, 'info', 'dron', 'Rozpoczęto kalibrację floty (IMU, kompas, gimbal) i łączenie z serwerem C2.');
    return 'Rozpoczęto kalibrację';
  });

/** @route POST /api/missions/:id/start */
export const startMission = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas startu operacji', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['przygotowanie'], 'Operację można rozpocząć po przygotowaniu Strefy Zero');
    const missing = data.checklist.filter((c) => !c.done);
    if (missing.length > 0) throw new MissionActionError(400, `Niezakończona procedura przedstartowa: ${missing.map((c) => c.label).join('; ')}`);
    const w = currentWeather(data);
    if (w) {
      for (const d of data.drones) {
        const b = weatherCoefficient(d.spec, w);
        d.groundedByWeather = !b.canFly;
        if (!b.canFly) d.phase = 'uziemiony';
      }
    }
    m.status = 'aktywna';
    m.startedAt = new Date();
    data.lastWeatherCheckSim = data.simSeconds;
    data.startedAtSim = data.simSeconds;
    if (data.hidden.length === 0) data.hidden = generateHiddenTargets(data);
    addEvent(data, 'sukces', 'system', `Plan operacyjny zatwierdzony przez ${userName(user)} – autonomiczny start dronów zwiadowczych.`);
    return 'Operacja rozpoczęta';
  });

// ============================================================
// KROK 6–8: DOWODZENIE W TRAKCIE LOTU
// ============================================================

/** @route POST /api/missions/:id/end */
export const endMission = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas kończenia operacji', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['aktywna'], 'Operacja nie jest aktywna');
    data.paused = false;
    m.status = 'powrot';
    for (const d of data.drones) orderReturn(data, d, 'rozkaz_koordynatora');
    const reason = String(req.body.reason || '').trim();
    addEvent(data, 'ostrzezenie', 'system', `Rozkaz zakończenia poszukiwań (${userName(user)})${reason ? `: ${reason}` : ''} – wszystkie drony wracają do Strefy Zero.`);
    return 'Wydano rozkaz powrotu floty';
  });

/** @route POST /api/missions/:id/pause – wstrzymanie / wznowienie symulacji ({ paused: boolean }) */
export const pauseMission = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas wstrzymywania operacji', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['przygotowanie', 'aktywna', 'powrot'], 'Operacja nie jest w toku');
    const paused = req.body.paused === undefined ? !data.paused : Boolean(req.body.paused);
    if (paused === !!data.paused) return paused ? 'Operacja jest już wstrzymana' : 'Operacja trwa';
    data.paused = paused;
    data.pausedBy = paused ? userName(user) : null;
    data.pausedAt = paused ? new Date().toISOString() : null;
    addEvent(data, 'info', 'system', paused ? `Symulacja wstrzymana przez ${userName(user)}.` : `Symulacja wznowiona przez ${userName(user)}.`);
    return paused ? 'Symulacja wstrzymana' : 'Symulacja wznowiona';
  });

/** @route POST /api/missions/:id/speed – tempo symulacji ({ timeScale: 1 | 2 | 5 | 10 | 20 }) */
export const setSimulationSpeed = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zmiany tempa symulacji', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['przygotowanie', 'aktywna', 'powrot'], 'Operacja nie jest w toku');
    const scale = Number(req.body.timeScale);
    if (!(TIME_SCALES as readonly number[]).includes(scale)) throw new MissionActionError(400, `Dozwolone tempo: ${TIME_SCALES.map((s) => `×${s}`).join(', ')}`);
    data.timeScale = scale;
    return scale === 1 ? 'Symulacja w czasie rzeczywistym' : `Tempo symulacji ×${scale}`;
  });

/** @route POST /api/missions/:id/weather-override */
export const overrideWeather = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zmiany pogody', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['planowanie', 'przygotowanie', 'aktywna'], 'Operacja zakończona');
    if (req.body.clear) {
      data.weatherOverride = null;
      data.lastWeatherCheckSim = -1e9; // wymuś pobranie pogody w najbliższym ticku
      addEvent(data, 'info', 'pogoda', 'Wyłączono symulację pogody – powrót do danych meteorologicznych na żywo.');
      if (data.weather && m.status === 'aktywna') applyWeather(data, data.weather);
      return 'Przywrócono dane pogodowe na żywo';
    }
    const base = currentWeather(data) ?? { temperature: 10, windSpeed: 3, windGust: 5, precipitation: 0, isDay: true };
    const num = (v: unknown, fallback: number) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
    const snapshot = {
      lat: data.base.lat,
      lng: data.base.lng,
      temperature: num(req.body.temperature, base.temperature),
      windSpeed: num(req.body.windSpeed, base.windSpeed),
      windGust: num(req.body.windGust, base.windGust),
      windDirection: num(req.body.windDirection, (base as any).windDirection ?? 270),
      precipitation: num(req.body.precipitation, base.precipitation),
      isDay: req.body.isDay === undefined ? base.isDay : Boolean(req.body.isDay),
      source: 'reczna' as const,
      fetchedAt: new Date().toISOString(),
    };
    data.weatherOverride = snapshot;
    addEvent(
      data,
      'ostrzezenie',
      'pogoda',
      `Symulacja zmiany pogody: ${snapshot.temperature}°C, wiatr ${snapshot.windSpeed} m/s (porywy ${snapshot.windGust}), opad ${snapshot.precipitation} mm/h.`
    );
    if (m.status === 'aktywna') applyWeather(data, snapshot);
    return 'Zastosowano symulowane warunki pogodowe';
  });

/** @route POST /api/missions/:id/recommendations/:recId */
export const decideRecommendation = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas decyzji', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    const rec = data.recommendations.find((r) => r.id === req.params.recId);
    if (!rec) throw new MissionActionError(404, 'Nie znaleziono rekomendacji');
    if (rec.status !== 'oczekuje') throw new MissionActionError(400, 'Decyzja została już podjęta');
    const approve = req.body.approve !== false;
    rec.status = approve ? 'zatwierdzona' : 'odrzucona';
    rec.decidedBy = userName(user);
    rec.decidedAt = new Date().toISOString();
    if (approve && rec.type === 'uziemienie_floty') {
      for (const d of data.drones) {
        d.groundedByWeather = true;
        if (isAirborne(d)) orderReturn(data, d, 'uziemienie_floty');
        else if (d.phase === 'gotowy') d.phase = 'uziemiony';
      }
      addEvent(data, 'krytyczny', 'pogoda', `Dowódca ${userName(user)} zatwierdził uziemienie floty – wszystkie drony wracają i pozostają w bazie do poprawy pogody.`);
    } else {
      addEvent(data, 'info', 'system', `Dowódca ${userName(user)} odrzucił rekomendację: ${rec.title}.`);
    }
    return approve ? 'Rekomendacja zatwierdzona' : 'Rekomendacja odrzucona';
  });

/** 6.3 – dynamiczna modyfikacja trasy: priorytet w punkcie strefy */
/** @route POST /api/missions/:id/priority */
export const setPriorityPoint = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zmiany priorytetu', (m, data, user) => {
    requireRole(m, data, user, ['dowodca']);
    requireStatus(m, ['aktywna'], 'Priorytet można zmienić w trakcie operacji');
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) throw new MissionActionError(400, 'Nieprawidłowe współrzędne');
    const proj = new LocalProjection(lat, lng);
    const pXY = proj.toXY([lat, lng]);
    const sector =
      data.sectors.find((s) => pointInPolygon(pXY, s.polygon.map((p) => proj.toXY(p)))) ??
      [...data.sectors].sort((a, b) => {
        const da = Math.min(...a.waypoints.map((w) => haversineKm(w, { lat, lng })));
        const db = Math.min(...b.waypoints.map((w) => haversineKm(w, { lat, lng })));
        return da - db;
      })[0];
    if (!sector) throw new MissionActionError(400, 'Brak sektorów w planie');
    const drone = data.drones.find((d) => d.sectorId === sector.id);
    if (!drone || drone.sectorDone || drone.sectorReassigned) throw new MissionActionError(400, 'Sektor nie jest już skanowany przez przydzielonego drona');
    if (drone.linkLost) throw new MissionActionError(400, `${drone.name} nie ma łączności – nie można przesłać nowych punktów trasy`);
    const remaining = sector.waypoints.slice(drone.scanIndex);
    if (remaining.length === 0) throw new MissionActionError(400, 'Sektor został już przeskanowany');
    let best = 0;
    remaining.forEach((w, i) => {
      if (haversineKm(w, { lat, lng }) < haversineKm(remaining[best], { lat, lng })) best = i;
    });
    const skipped = remaining.slice(0, best);
    drone.scanIndex += best;
    drone.extraWaypoints = [...skipped, ...drone.extraWaypoints];
    if (drone.phase === 'skanowanie' || drone.phase === 'przelot') {
      drone.phase = 'przelot';
      drone.target = { lat: sector.waypoints[drone.scanIndex].lat, lng: sector.waypoints[drone.scanIndex].lng };
    }
    addEvent(data, 'info', 'plan', `Zmiana priorytetu w sektorze ${sector.index + 1} – ${drone.name} odebrał zaktualizowane waypointy bez powrotu do bazy.`, drone.droneId);
    return `Priorytet przekazany do ${drone.name}`;
  });

// ----- Weryfikator AI -----

/** @route POST /api/missions/:id/detections/:detId/verify */
export const verifyDetection = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas weryfikacji', (m, data, user) => {
    requireRole(m, data, user, ['weryfikator']);
    const det = data.detections.find((d) => d.id === req.params.detId);
    if (!det) throw new MissionActionError(404, 'Nie znaleziono detekcji');
    if (det.status !== 'wstepny') throw new MissionActionError(400, 'Detekcja została już zweryfikowana');
    const confirm = req.body.decision !== 'odrzuc';
    det.verifiedBy = userName(user);
    det.verifiedAt = new Date().toISOString();
    if (confirm) {
      const persons = Number(req.body.persons);
      if (persons > 0) det.persons = Math.round(persons);
      det.status = 'potwierdzony';
      det.history.push(`Zweryfikowano przez ${userName(user)} – potwierdzono ${det.persons} os. Pineska przekazana zespołom ratowniczym.`);
      addEvent(data, 'sukces', 'detekcja', `Weryfikator AI ${userName(user)} potwierdził ${det.persons} os. (${det.criticality}) – pineska GPS dla zespołów ratowniczych.`);
    } else {
      det.status = 'odrzucony';
      data.stats.falseAlarmsVerifier++;
      det.history.push(`Odrzucono jako fałszywy alarm AI (${userName(user)}).`);
      for (const dlv of data.deliveries) {
        if (dlv.detectionId === det.id && ['oczekuje_autoryzacji', 'oczekuje_zaladunku', 'oczekuje_drona'].includes(dlv.status)) dlv.status = 'odrzucona';
      }
      addEvent(data, 'info', 'detekcja', `Weryfikator AI ${userName(user)} odrzucił fałszywy alarm sztucznej inteligencji.`);
    }
    return confirm ? 'Detekcja potwierdzona' : 'Fałszywy alarm odrzucony';
  });

/** @route POST /api/missions/:id/detections/:detId/deliveries */
export const requestDelivery = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas zlecania dostawy', (m, data, user) => {
    requireRole(m, data, user, ['weryfikator']);
    requireStatus(m, ['aktywna'], 'Dostawy można zlecać w trakcie operacji');
    const det = data.detections.find((d) => d.id === req.params.detId);
    if (!det) throw new MissionActionError(404, 'Nie znaleziono detekcji');
    if (det.status === 'odrzucony') throw new MissionActionError(400, 'Detekcja została odrzucona');
    const payloadType = req.body.payloadType;
    if (!['kamizelki', 'apteczka', 'woda_jedzenie'].includes(payloadType)) throw new MissionActionError(400, 'Nieprawidłowy rodzaj ładunku');
    const quantity = payloadType === 'kamizelki' ? Math.max(2, det.persons) : det.persons;
    const weightKg = payloadType === 'kamizelki' ? quantity : payloadType === 'apteczka' ? 1.5 : Math.min(8, 2.5 * det.persons);
    data.deliveries.push({
      id: newId('dlv'),
      detectionId: det.id,
      lat: det.lat,
      lng: det.lng,
      payloadType,
      quantity,
      weightKg,
      status: 'oczekuje_zaladunku',
      automatic: false,
      createdAt: new Date().toISOString(),
      authorizedBy: userName(user),
    });
    addEvent(data, 'info', 'dostawa', `Weryfikator AI zlecił dostawę: ${PAYLOAD_LABELS[payloadType as keyof typeof PAYLOAD_LABELS]} – oczekuje na załadunek.`);
    return 'Dostawa zlecona';
  });

/** @route POST /api/missions/:id/deliveries/:delId/authorize */
export const authorizeDelivery = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas autoryzacji', (m, data, user) => {
    requireRole(m, data, user, ['weryfikator']);
    const dlv = data.deliveries.find((d) => d.id === req.params.delId);
    if (!dlv) throw new MissionActionError(404, 'Nie znaleziono dostawy');
    if (dlv.status !== 'oczekuje_autoryzacji') throw new MissionActionError(400, 'Dostawa nie oczekuje na autoryzację');
    const approve = req.body.approve !== false;
    dlv.status = approve ? 'oczekuje_zaladunku' : 'odrzucona';
    dlv.authorizedBy = userName(user);
    addEvent(
      data,
      approve ? 'info' : 'ostrzezenie',
      'dostawa',
      approve
        ? `Weryfikator AI autoryzował dostawę (${PAYLOAD_LABELS[dlv.payloadType]}) – przekazano do Logistyka Zrzutu.`
        : `Weryfikator AI odrzucił żądanie dostawy (${PAYLOAD_LABELS[dlv.payloadType]}).`
    );
    return approve ? 'Dostawa autoryzowana' : 'Dostawa odrzucona';
  });

// ----- Logistyk Zrzutu -----

/** @route POST /api/missions/:id/deliveries/:delId/load */
export const loadDelivery = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas potwierdzania załadunku', (m, data, user) => {
    requireRole(m, data, user, ['logistyk']);
    const dlv = data.deliveries.find((d) => d.id === req.params.delId);
    if (!dlv) throw new MissionActionError(404, 'Nie znaleziono dostawy');
    if (dlv.status !== 'oczekuje_zaladunku') throw new MissionActionError(400, 'Dostawa nie oczekuje na załadunek');
    dlv.status = 'oczekuje_drona';
    dlv.loadedBy = userName(user);
    addEvent(data, 'info', 'dostawa', `${userName(user)} podczepił ładunek (${dlv.quantity} × ${PAYLOAD_LABELS[dlv.payloadType]}) – dron dostawczy startuje przy pierwszej okazji.`);
    return 'Załadunek potwierdzony';
  });

// ----- Technik Lądowiska -----

/** @route POST /api/missions/:id/drones/:droneId/battery-swap */
export const swapBattery = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas wymiany baterii', (m, data, user) => {
    requireRole(m, data, user, ['technik']);
    const d = data.drones.find((x) => x.droneId === req.params.droneId);
    if (!d) throw new MissionActionError(404, 'Dron nie bierze udziału w operacji');
    if (isAirborne(d)) throw new MissionActionError(400, 'Dron jest w powietrzu');
    if (d.phase === 'uziemiony' && d.battery > 5 && d.groundedByWeather) throw new MissionActionError(400, 'Dron uziemiony z powodu pogody');
    d.battery = 100;
    d.reportedBattery = 100;
    if (d.phase === 'wymiana_baterii' || (d.phase === 'uziemiony' && !d.groundedByWeather)) d.phase = 'gotowy';
    addEvent(data, 'sukces', 'zespol', `${userName(user)}: wymiana akumulatora – ${d.name} gotowy do kolejnego wylotu.`, d.droneId);
    return `Wymieniono akumulator w ${d.name}`;
  });

// ----- Mobilne Zespoły Ratownicze -----

/** @route POST /api/missions/:id/detections/:detId/rescue */
export const updateRescue = (req: AuthenticatedRequest, res: Response) =>
  missionAction(req, res, 'Błąd podczas aktualizacji statusu ewakuacji', (m, data, user) => {
    requireRole(m, data, user, ['ratownik']);
    const det = data.detections.find((d) => d.id === req.params.detId);
    if (!det) throw new MissionActionError(404, 'Nie znaleziono pineski');
    if (det.status === 'odrzucony') throw new MissionActionError(400, 'Pineska została odrzucona przez Weryfikatora');
    const status = req.body.status;
    if (!['oczekuje', 'w_drodze', 'ewakuowano'].includes(status)) throw new MissionActionError(400, 'Nieprawidłowy status');
    det.rescueStatus = status;
    det.rescueTeam = String(req.body.team || userName(user));
    const label = status === 'w_drodze' ? 'zespół w drodze' : status === 'ewakuowano' ? 'osoby ewakuowane' : 'oczekuje';
    det.history.push(`${det.rescueTeam}: ${label}.`);
    addEvent(data, status === 'ewakuowano' ? 'sukces' : 'info', 'zespol', `${det.rescueTeam}: ${label} (${det.lat.toFixed(4)}, ${det.lng.toFixed(4)}).`);
    return 'Zaktualizowano status ewakuacji';
  });

// ============================================================
// KROK 8.1: RAPORT
// ============================================================

/** @route GET /api/missions/:id/report */
export const getReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const mission = await Mission.findByPk(req.params.id, {
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] }],
    });
    if (!mission) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    res.status(200).json({ success: true, report: buildMissionReport(mission) });
  } catch (error) {
    handleError(res, error, 'Błąd podczas generowania raportu');
  }
};

/** @route GET /api/missions/:id/report.xlsx */
export const getReportXlsx = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const mission = await Mission.findByPk(req.params.id, {
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'firstName', 'lastName'] }],
    });
    if (!mission) {
      res.status(404).json({ success: false, message: 'Nie znaleziono operacji' });
      return;
    }
    const workbook = await buildMissionWorkbook(mission);
    const safeName = mission.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`raport_${safeName}.xlsx`)}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    handleError(res, error, 'Błąd podczas generowania raportu Excel');
  }
};
