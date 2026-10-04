import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/protect';
import { Drone, DRONE_CATEGORIES, DRONE_FLEET_STATUSES, Organization } from '../models';
import { DroneSpec, analyzeDrone } from '../services/flightMath';
import { fetchCurrentWeather } from '../services/weatherService';
import { recordAuditLog } from '../services/auditService';

export const toDroneSpec = (d: Drone): DroneSpec => ({
  id: d.id,
  name: d.name,
  model: d.model,
  category: d.category,
  maxWindSpeed: d.maxWindSpeed,
  ipRating: d.ipRating,
  minTemp: d.minTemp,
  maxTemp: d.maxTemp,
  batteryCurve: d.batteryCurve,
  hasThermal: d.hasThermal,
  hasRgb: d.hasRgb,
  hasSpeaker: d.hasSpeaker,
  cameraFovDeg: d.cameraFovDeg,
  cruiseSpeed: d.cruiseSpeed,
  maxPayloadKg: d.maxPayloadKg,
  radioRangeKm: d.radioRangeKm,
});

const EDITABLE_FIELDS = [
  'name',
  'model',
  'category',
  'status',
  'maxWindSpeed',
  'ipRating',
  'minTemp',
  'maxTemp',
  'batteryCurve',
  'hasThermal',
  'hasRgb',
  'hasSpeaker',
  'cameraFovDeg',
  'cruiseSpeed',
  'maxPayloadKg',
  'radioRangeKm',
  'weightKg',
  'notes',
] as const;

const canManageFleet = (req: AuthenticatedRequest) => req.user?.role === 'admin' || req.user?.role === 'koordynator';

const canManageDrone = (req: AuthenticatedRequest, drone: Drone) =>
  req.user?.role === 'admin' || (req.user?.role === 'koordynator' && (!drone.organizationId || drone.organizationId === req.user.organizationId));

const pickFields = (body: any) => {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) if (body[key] !== undefined) out[key] = body[key];
  if (Array.isArray(out.batteryCurve)) {
    out.batteryCurve = (out.batteryCurve as any[])
      .map((p) => ({ temp: Number(p.temp), minutes: Number(p.minutes) }))
      .sort((a, b) => a.temp - b.temp);
  }
  return out;
};

const validateLimits = (fields: Record<string, unknown>, existing?: Drone): string | null => {
  const minTemp = Number(fields.minTemp ?? existing?.minTemp);
  const maxTemp = Number(fields.maxTemp ?? existing?.maxTemp);
  if (!Number.isNaN(minTemp) && !Number.isNaN(maxTemp) && minTemp >= maxTemp) {
    return 'Minimalna temperatura operacyjna musi być niższa od maksymalnej';
  }
  if (fields.category && !DRONE_CATEGORIES.includes(fields.category as any)) return 'Nieprawidłowa kategoria drona';
  if (fields.status && !DRONE_FLEET_STATUSES.includes(fields.status as any)) return 'Nieprawidłowy status drona';
  return null;
};

/**
 * @desc    Lista floty dronów
 * @route   GET /api/drones
 */
export const getDrones = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const drones = await Drone.findAll({
      include: [{ model: Organization, as: 'organization', attributes: ['id', 'name'] }],
      order: [
        ['category', 'DESC'],
        ['name', 'ASC'],
      ],
    });
    res.status(200).json({ success: true, drones });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Błąd podczas pobierania floty', error: error.message });
  }
};

/**
 * @desc    Ocena floty w bieżących warunkach pogodowych (Wzór A i Wzór B)
 * @route   GET /api/drones/evaluate?lat=&lng=
 */
export const evaluateDrones = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      res.status(400).json({ success: false, message: 'Wymagane parametry lat i lng' });
      return;
    }
    const weather = await fetchCurrentWeather(lat, lng);
    const drones = await Drone.findAll({ order: [['name', 'ASC']] });
    const evaluations = drones.map((d) =>
      analyzeDrone(toDroneSpec(d), weather, 0, {
        available: d.status === 'dostepny',
        reason: d.status === 'serwis' ? 'W serwisie' : d.status === 'w_misji' ? 'Przydzielony do innej operacji' : undefined,
      })
    );
    res.status(200).json({ success: true, weather, evaluations });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Błąd podczas oceny floty', error: error.message });
  }
};

/**
 * @desc    Dodanie drona do floty
 * @route   POST /api/drones
 */
export const createDrone = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!canManageFleet(req)) {
      res.status(403).json({ success: false, message: 'Zarządzanie flotą wymaga roli koordynatora lub administratora' });
      return;
    }
    const fields = pickFields(req.body);
    const err = validateLimits(fields);
    if (err) {
      res.status(400).json({ success: false, message: err });
      return;
    }
    const organizationId = req.user!.role === 'admin' && req.body.organizationId !== undefined ? req.body.organizationId || null : req.user!.organizationId;
    const drone = await Drone.create({ ...(fields as any), organizationId });
    await recordAuditLog({
      action: 'drone_created',
      entityType: 'drone',
      entityId: drone.id,
      user: req.user!,
      details: `Dodano drona ${drone.name} (${drone.model}, ${drone.category}) do floty`,
      newState: drone.toJSON(),
    });
    res.status(201).json({ success: true, message: 'Dron został dodany do floty', drone });
  } catch (error: any) {
    const status = error.name === 'SequelizeValidationError' ? 400 : 500;
    res.status(status).json({
      success: false,
      message: status === 400 ? error.errors?.map((e: any) => e.message).join(', ') : 'Błąd podczas dodawania drona',
      error: error.message,
    });
  }
};

/**
 * @desc    Aktualizacja parametrów drona
 * @route   PUT /api/drones/:id
 */
export const updateDrone = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const drone = await Drone.findByPk(req.params.id);
    if (!drone) {
      res.status(404).json({ success: false, message: 'Nie znaleziono drona' });
      return;
    }
    if (!canManageDrone(req, drone)) {
      res.status(403).json({ success: false, message: 'Brak uprawnień do edycji tego drona' });
      return;
    }
    const fields = pickFields(req.body);
    const err = validateLimits(fields, drone);
    if (err) {
      res.status(400).json({ success: false, message: err });
      return;
    }
    if (drone.status === 'w_misji' && fields.status && fields.status !== 'w_misji') {
      res.status(400).json({ success: false, message: 'Dron bierze udział w operacji – status zmieni się po jej zakończeniu' });
      return;
    }
    const previousState = drone.toJSON();
    await drone.update(fields as any);
    await recordAuditLog({
      action: 'drone_updated',
      entityType: 'drone',
      entityId: drone.id,
      user: req.user!,
      details: `Zaktualizowano parametry drona ${drone.name}`,
      previousState,
      newState: drone.toJSON(),
    });
    res.status(200).json({ success: true, message: 'Parametry drona zostały zaktualizowane', drone });
  } catch (error: any) {
    const status = error.name === 'SequelizeValidationError' ? 400 : 500;
    res.status(status).json({
      success: false,
      message: status === 400 ? error.errors?.map((e: any) => e.message).join(', ') : 'Błąd podczas aktualizacji drona',
      error: error.message,
    });
  }
};

/**
 * @desc    Usunięcie drona z floty
 * @route   DELETE /api/drones/:id
 */
export const deleteDrone = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const drone = await Drone.findByPk(req.params.id);
    if (!drone) {
      res.status(404).json({ success: false, message: 'Nie znaleziono drona' });
      return;
    }
    if (!canManageDrone(req, drone)) {
      res.status(403).json({ success: false, message: 'Brak uprawnień do usunięcia tego drona' });
      return;
    }
    if (drone.status === 'w_misji') {
      res.status(400).json({ success: false, message: 'Nie można usunąć drona biorącego udział w operacji' });
      return;
    }
    await drone.destroy();
    res.status(200).json({ success: true, message: 'Dron został usunięty z floty' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Błąd podczas usuwania drona', error: error.message });
  }
};
