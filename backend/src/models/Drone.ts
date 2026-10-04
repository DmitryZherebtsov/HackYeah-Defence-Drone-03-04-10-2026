import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type DroneCategory = 'zwiadowczy' | 'dostawczy';
export type DroneFleetStatus = 'dostepny' | 'w_misji' | 'serwis';

export const DRONE_CATEGORIES: DroneCategory[] = ['zwiadowczy', 'dostawczy'];
export const DRONE_FLEET_STATUSES: DroneFleetStatus[] = ['dostepny', 'w_misji', 'serwis'];

/** Punkt krzywej spadku baterii: czas lotu (min) w danej temperaturze (°C) */
export interface BatteryCurvePoint {
  temp: number;
  minutes: number;
}

export interface DroneAttributes {
  id: string;
  name: string;
  model: string;
  category: DroneCategory;
  status: DroneFleetStatus;
  organizationId?: string | null;
  // Granice pogodowe
  maxWindSpeed: number; // m/s (porywy)
  ipRating: string; // np. IP55
  minTemp: number; // °C
  maxTemp: number; // °C
  // Krzywa spadku baterii
  batteryCurve: BatteryCurvePoint[];
  // Wyposażenie (sensory)
  hasThermal: boolean;
  hasRgb: boolean;
  hasSpeaker: boolean;
  cameraFovDeg: number;
  // Osiągi
  cruiseSpeed: number; // m/s
  maxPayloadKg: number;
  radioRangeKm: number;
  weightKg: number;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DroneCreationAttributes
  extends Optional<
    DroneAttributes,
    'id' | 'status' | 'organizationId' | 'hasRgb' | 'hasSpeaker' | 'notes' | 'weightKg' | 'createdAt' | 'updatedAt'
  > {}

export class Drone extends Model<DroneAttributes, DroneCreationAttributes> implements DroneAttributes {
  declare id: string;
  declare name: string;
  declare model: string;
  declare category: DroneCategory;
  declare status: DroneFleetStatus;
  declare organizationId: string | null;
  declare maxWindSpeed: number;
  declare ipRating: string;
  declare minTemp: number;
  declare maxTemp: number;
  declare batteryCurve: BatteryCurvePoint[];
  declare hasThermal: boolean;
  declare hasRgb: boolean;
  declare hasSpeaker: boolean;
  declare cameraFovDeg: number;
  declare cruiseSpeed: number;
  declare maxPayloadKg: number;
  declare radioRangeKm: number;
  declare weightKg: number;
  declare notes: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Drone.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: 'Nazwa drona jest wymagana' } },
    },
    model: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: 'Model drona jest wymagany' } },
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: { args: [DRONE_CATEGORIES], msg: 'Nieprawidłowa kategoria drona' } },
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'dostepny',
      validate: { isIn: { args: [DRONE_FLEET_STATUSES], msg: 'Nieprawidłowy status drona' } },
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
    },
    maxWindSpeed: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: { min: { args: [1], msg: 'Maksymalna prędkość wiatru musi być dodatnia' } },
    },
    ipRating: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'IP00',
      validate: { is: { args: /^IP[0-6X][0-9X]$/i, msg: 'Klasa szczelności w formacie IPxx, np. IP55' } },
    },
    minTemp: { type: DataTypes.FLOAT, allowNull: false },
    maxTemp: { type: DataTypes.FLOAT, allowNull: false },
    batteryCurve: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      validate: {
        isValidCurve(value: unknown) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error('Krzywa baterii musi zawierać co najmniej jeden punkt');
          }
          for (const p of value) {
            if (typeof p?.temp !== 'number' || typeof p?.minutes !== 'number' || p.minutes <= 0) {
              throw new Error('Każdy punkt krzywej baterii wymaga temperatury i dodatniego czasu lotu');
            }
          }
        },
      },
    },
    hasThermal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    hasRgb: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    hasSpeaker: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cameraFovDeg: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 60 },
    cruiseSpeed: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: { min: { args: [1], msg: 'Prędkość przelotowa musi być dodatnia' } },
    },
    maxPayloadKg: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    radioRangeKm: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 8 },
    weightKg: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'drones',
    timestamps: true,
  }
);

export default Drone;
