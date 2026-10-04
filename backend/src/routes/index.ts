import { Router } from 'express';
import authRoutes from './authRoute';
import adminRoutes from './adminRoute';
import organizationsRoutes from './organizationsRoute';
import dronesRoutes from './dronesRoute';
import missionsRoutes from './missionsRoute';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/organizations', organizationsRoutes);
router.use('/drones', dronesRoutes);
router.use('/missions', missionsRoutes);

export default router;
export { authRoutes, adminRoutes, organizationsRoutes, dronesRoutes, missionsRoutes };
