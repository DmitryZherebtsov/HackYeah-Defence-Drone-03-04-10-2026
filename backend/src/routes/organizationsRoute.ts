import { Router } from 'express';
import { getOrganizations } from '../controllers/organizationController';

const router = Router();

// GET /api/organizations - Publiczna lista organizacji (m.in. do rejestracji)
router.get('/', getOrganizations);

export default router;
