import { Router } from 'express';
import { register, login } from '../controllers/authController';

const router = Router();

// POST /api/auth/register - Rejestracja użytkownika
router.post('/register', register);

// POST /api/auth/login - Logowanie użytkownika
router.post('/login', login);

export default router;
