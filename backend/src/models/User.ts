import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type UserRole = 'admin' | 'koordynator' | 'czlonek';
export const USER_ROLES: UserRole[] = ['admin', 'koordynator', 'czlonek'];

export interface UserAttributes {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phone: string;
  role: UserRole;
  organizationId: string;
  isVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserCreationAttributes
  extends Optional<UserAttributes, 'id' | 'role' | 'isVerified' | 'createdAt' | 'updatedAt'> {}

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  declare id: string;
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare password: string;
  declare phone: string;
  declare role: UserRole;
  declare organizationId: string;
  declare isVerified: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Imię jest wymagane' },
      },
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Nazwisko jest wymagane' },
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: { msg: 'Podaj poprawny adres email' },
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: {
          args: [6, 255],
          msg: 'Hasło musi mieć minimum 6 znaków',
        },
      },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Numer telefonu jest wymagany' },
      },
    },
    role: {
      type: DataTypes.ENUM('admin', 'koordynator', 'czlonek'),
      defaultValue: 'czlonek',
      allowNull: false,
      validate: {
        isIn: {
          args: [USER_ROLES],
          msg: 'Nieprawidłowa rola użytkownika',
        },
      },
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
  }
);

export default User;
