import { sequelize } from '../config/database';
import Municipality from './Municipality';
import Organization from './Organization';
import User from './User';
import AuditLog from './AuditLog';
import Drone from './Drone';
import Mission from './Mission';

// Relacje Municipality <-> Organization
Municipality.hasMany(Organization, {
  foreignKey: 'municipalityId',
  as: 'organizations',
  onDelete: 'CASCADE',
});
Organization.belongsTo(Municipality, {
  foreignKey: 'municipalityId',
  as: 'municipality',
});

// Relacje Organization <-> User
Organization.hasMany(User, {
  foreignKey: 'organizationId',
  as: 'users',
  onDelete: 'CASCADE',
});
User.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// Relacje Organization <-> Drone
Organization.hasMany(Drone, {
  foreignKey: 'organizationId',
  as: 'drones',
});
Drone.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

// Relacje User <-> Mission (twórca operacji)
User.hasMany(Mission, {
  foreignKey: 'createdById',
  as: 'missions',
});
Mission.belongsTo(User, {
  foreignKey: 'createdById',
  as: 'createdBy',
});

export * from './Municipality';
export * from './Organization';
export * from './User';
export * from './AuditLog';
export * from './Drone';
export * from './Mission';
export { sequelize, AuditLog, Drone, Mission };


