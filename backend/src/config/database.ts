import { Sequelize } from 'sequelize';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Bezwzględna ścieżka do pliku database.sqlite w katalogu backend
const dbStoragePath = path.resolve(__dirname, '../../database.sqlite');

const dbPath =
  process.env.NODE_ENV === 'test'
    ? ':memory:'
    : (process.env.DB_STORAGE && path.isAbsolute(process.env.DB_STORAGE)
        ? process.env.DB_STORAGE
        : dbStoragePath);

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[SQLITE] ${msg}`) : false,
});
