import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type OrganizationType = 'samorzad' | 'sluzby' | 'ngo';
export const ORGANIZATION_TYPES: OrganizationType[] = ['samorzad', 'sluzby', 'ngo'];

export interface OrganizationAttributes {
  id: string;
  name: string;
  type: OrganizationType;
  municipalityId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrganizationCreationAttributes
  extends Optional<OrganizationAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export class Organization
  extends Model<OrganizationAttributes, OrganizationCreationAttributes>
  implements OrganizationAttributes
{
  declare id: string;
  declare name: string;
  declare type: OrganizationType;
  declare municipalityId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Organization.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Nazwa organizacji jest wymagana' },
      },
    },
    type: {
      type: DataTypes.ENUM('samorzad', 'sluzby', 'ngo'),
      allowNull: false,
      validate: {
        isIn: {
          args: [ORGANIZATION_TYPES],
          msg: 'Nieprawidłowy typ organizacji',
        },
      },
    },
    municipalityId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'municipalities',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    tableName: 'organizations',
    timestamps: true,
  }
);

export default Organization;
