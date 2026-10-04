import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type AuditLogAction =
  | 'user_verified'
  | 'user_rejected'
  | 'user_updated'
  | 'user_deleted'
  | 'drone_created'
  | 'drone_updated'
  | 'mission_created'
  | 'revert_action';

export interface AuditLogAttributes {
  id: string;
  action: AuditLogAction | string;
  entityType: 'user' | 'organization' | 'drone' | 'mission' | string;
  entityId: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  details: string;
  previousState?: any;
  newState?: any;
  isReverted: boolean;
  revertedAt?: Date | null;
  revertedByUserId?: string | null;
  revertedByUserName?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuditLogCreationAttributes
  extends Optional<
    AuditLogAttributes,
    | 'id'
    | 'userId'
    | 'userName'
    | 'userEmail'
    | 'organizationId'
    | 'organizationName'
    | 'previousState'
    | 'newState'
    | 'isReverted'
    | 'revertedAt'
    | 'revertedByUserId'
    | 'revertedByUserName'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  declare id: string;
  declare action: AuditLogAction | string;
  declare entityType: string;
  declare entityId: string;
  declare userId: string | null;
  declare userName: string | null;
  declare userEmail: string | null;
  declare organizationId: string | null;
  declare organizationName: string | null;
  declare details: string;
  declare previousState: any;
  declare newState: any;
  declare isReverted: boolean;
  declare revertedAt: Date | null;
  declare revertedByUserId: string | null;
  declare revertedByUserName: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

AuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entityId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    organizationName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    previousState: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    newState: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    isReverted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    revertedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revertedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    revertedByUserName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: true,
  }
);

export default AuditLog;
