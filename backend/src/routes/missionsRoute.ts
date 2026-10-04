import { Router } from 'express';
import { protect } from '../middleware/protect';
import {
  analyzeFleet,
  authorizeDelivery,
  backToPlanning,
  calibrateFleet,
  createMission,
  decideRecommendation,
  deleteMission,
  endMission,
  generatePlan,
  getAssignableUsers,
  getMission,
  getMissions,
  getReport,
  getReportXlsx,
  loadDelivery,
  overrideWeather,
  pauseMission,
  prepareMission,
  requestDelivery,
  setPriorityPoint,
  setSimulationSpeed,
  startMission,
  swapBattery,
  toggleChecklist,
  updateArea,
  updatePriority,
  autoPriority,
  updateAssignments,
  updateBase,
  updateFleet,
  updateRescue,
  verifyDetection,
} from '../controllers/missionController';

const router = Router();

router.use(protect);

router.get('/', getMissions);
router.post('/', createMission);
router.get('/assignable-users', getAssignableUsers);
router.get('/:id', getMission);
router.delete('/:id', deleteMission);

// Planowanie (kroki 2–5)
router.put('/:id/base', updateBase);
router.post('/:id/analyze', analyzeFleet);
router.put('/:id/fleet', updateFleet);
router.put('/:id/area', updateArea);
router.put('/:id/priority', updatePriority);
router.post('/:id/priority/auto', autoPriority);
router.post('/:id/plan', generatePlan);
router.put('/:id/assignments', updateAssignments);

// Przygotowanie Strefy Zero (krok 2)
router.post('/:id/prepare', prepareMission);
router.post('/:id/back-to-planning', backToPlanning);
router.patch('/:id/checklist/:itemId', toggleChecklist);
router.post('/:id/calibrate', calibrateFleet);
router.post('/:id/start', startMission);

// Dowodzenie w trakcie lotu (kroki 6–8)
router.post('/:id/end', endMission);
router.post('/:id/pause', pauseMission);
router.post('/:id/speed', setSimulationSpeed);
router.post('/:id/weather-override', overrideWeather);
router.post('/:id/recommendations/:recId', decideRecommendation);
router.post('/:id/priority', setPriorityPoint);
router.post('/:id/detections/:detId/verify', verifyDetection);
router.post('/:id/detections/:detId/deliveries', requestDelivery);
router.post('/:id/detections/:detId/rescue', updateRescue);
router.post('/:id/deliveries/:delId/authorize', authorizeDelivery);
router.post('/:id/deliveries/:delId/load', loadDelivery);
router.post('/:id/drones/:droneId/battery-swap', swapBattery);

// Raport (krok 8.1)
router.get('/:id/report', getReport);
router.get('/:id/report.xlsx', getReportXlsx);

export default router;
