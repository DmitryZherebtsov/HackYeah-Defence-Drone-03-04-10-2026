import { Router } from 'express';
import { protect } from '../middleware/protect';
import { createDrone, deleteDrone, evaluateDrones, getDrones, updateDrone } from '../controllers/droneController';

const router = Router();

router.use(protect);

router.get('/', getDrones);
router.get('/evaluate', evaluateDrones);
router.post('/', createDrone);
router.put('/:id', updateDrone);
router.delete('/:id', deleteDrone);

export default router;
