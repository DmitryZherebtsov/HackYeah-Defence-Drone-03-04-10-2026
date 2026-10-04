import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface MunicipalityAttributes {
  id: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MunicipalityCreationAttributes
  extends Optional<MunicipalityAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export class Municipality
  extends Model<MunicipalityAttributes, MunicipalityCreationAttributes>
  implements MunicipalityAttributes
{
  declare id: string;
  declare name: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Municipality.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: { msg: 'Nazwa gminy jest wymagana' },
      },
    },
  },
  {
    sequelize,
    tableName: 'municipalities',
    timestamps: true,
  }
);

export default Municipality;
