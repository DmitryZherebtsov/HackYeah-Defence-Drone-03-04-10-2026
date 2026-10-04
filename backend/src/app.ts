import path from 'path';
import fs from 'fs';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import routes from './routes';
import { setupSwagger } from './config/swagger';

const app: Application = express();

// Podstawowe middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfiguracja Swagger UI pod adresem /api-docs
setupSwagger(app);

// Główne trasy API
app.use('/api', routes);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Jeśli zbudowano frontend (npm run build we frontend/), serwujemy go z tego
// samego serwera/portu — jeden darmowy hosting, bez CORS między domenami.
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
const hasFrontendBuild = fs.existsSync(frontendDistPath);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  app.get('/', (req: Request, res: Response) => {
    res.redirect('/api-docs');
  });
}

export default app;
