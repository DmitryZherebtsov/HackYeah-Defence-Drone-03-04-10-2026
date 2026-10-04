import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'System Koordynacji Kryzysowej - API',
    version: '1.0.0',
    description:
      'Dokumentacja REST API oraz interaktywny panel Swagger UI do testowania endpointów autoryzacji, floty dronów, operacji dronowych oraz panelu administratora.',
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Serwer lokalny (Development)',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Wprowadź token JWT uzyskany podczas logowania w formacie: Bearer <token>',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '66bf8a1e2f8b1c0012345678' },
          firstName: { type: 'string', example: 'Jan' },
          lastName: { type: 'string', example: 'Kowalski' },
          email: { type: 'string', example: 'jan.kowalski@example.com' },
          phone: { type: 'string', example: '+48123456789' },
          role: { type: 'string', enum: ['admin', 'koordynator', 'czlonek'], example: 'czlonek' },
          organization: { type: 'string', example: '66bf8a1e2f8b1c0012345679' },
          isVerified: { type: 'boolean', example: false },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'password', 'phone', 'organization'],
        properties: {
          firstName: { type: 'string', example: 'Jan' },
          lastName: { type: 'string', example: 'Kowalski' },
          email: { type: 'string', example: 'jan.kowalski@example.com' },
          password: { type: 'string', minLength: 6, example: 'tajnehaslo123' },
          phone: { type: 'string', example: '+48123456789' },
          organization: { type: 'string', description: 'ID organizacji w bazie', example: '66bf8a1e2f8b1c0012345679' },
          role: { type: 'string', enum: ['admin', 'koordynator', 'czlonek'], default: 'czlonek', example: 'czlonek' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'jan.kowalski@example.com' },
          password: { type: 'string', example: 'tajnehaslo123' },
        },
      },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Autoryzacja (Auth)'],
        summary: 'Rejestracja nowego użytkownika',
        description: 'Tworzy nowe konto z isVerified: false. Nie zwraca tokenu – wymagana jest weryfikacja przez administratora.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Użytkownik zarejestrowany pomyślnie, oczekuje na weryfikację.',
          },
          400: { description: 'Brakujące wymagane pola.' },
          409: { description: 'Użytkownik z tym adresem email już istnieje.' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Autoryzacja (Auth)'],
        summary: 'Logowanie użytkownika',
        description: 'Weryfikuje email oraz hasło, po czym zwraca token JWT.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Zalogowano pomyślnie. Zwrócono token JWT i profil użytkownika.',
          },
          400: { description: 'Brak adresu email lub hasła.' },
          401: { description: 'Nieprawidłowe dane logowania.' },
        },
      },
    },
    '/api/drones': {
      get: {
        tags: ['Flota dronów'],
        summary: 'Lista floty dronów (granice pogodowe, krzywa baterii, sensory)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Lista dronów' }, 401: { description: 'Brak autoryzacji' } },
      },
    },
    '/api/drones/evaluate': {
      get: {
        tags: ['Flota dronów'],
        summary: 'Ocena floty w bieżącej pogodzie (Wzór A i Wzór B)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'lat', required: true, schema: { type: 'number' } },
          { in: 'query', name: 'lng', required: true, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Pogoda i ocena każdego drona' } },
      },
    },
    '/api/missions': {
      get: {
        tags: ['Operacje dronowe'],
        summary: 'Lista operacji dronowych',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Lista operacji' } },
      },
    },
    '/api/missions/{id}/report': {
      get: {
        tags: ['Operacje dronowe'],
        summary: 'Raport operacji (JSON); wersja Excel pod /report.xlsx',
        security: [{ BearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Raport' }, 404: { description: 'Nie znaleziono operacji' } },
      },
    },
    '/api/admin/users/pending': {
      get: {
        tags: ['Panel Administratora (Admin)'],
        summary: 'Lista użytkowników oczekujących na weryfikację',
        description: 'Zwraca użytkowników z isVerified: false. Dostępne wyłącznie dla roli admin.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Lista niezweryfikowanych użytkowników.' },
          401: { description: 'Brak autoryzacji.' },
          403: { description: 'Brak uprawnień administratora lub konto niezweryfikowane.' },
        },
      },
    },
    '/api/admin/users/{id}/verify': {
      patch: {
        tags: ['Panel Administratora (Admin)'],
        summary: 'Weryfikacja użytkownika (isVerified: true)',
        description: 'Zmienia status isVerified na true dla wybranego użytkownika. Wymaga roli admin.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'ID użytkownika (ObjectId)',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Użytkownik został pomyślnie zweryfikowany.' },
          401: { description: 'Brak autoryzacji.' },
          403: { description: 'Brak uprawnień administratora.' },
          404: { description: 'Użytkownik nie został znaleziony.' },
        },
      },
    },
  },
};

/**
 * Konfiguruje Swagger UI na ścieżce /api-docs
 */
export const setupSwagger = (app: Application): void => {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: block; }',
      customSiteTitle: 'System Koordynacji Kryzysowej - API Docs',
    })
  );
};
