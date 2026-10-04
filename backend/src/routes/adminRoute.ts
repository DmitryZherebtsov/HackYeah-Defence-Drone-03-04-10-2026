import { Router } from 'express';
import {
  getPendingUsers,
  verifyUser,
  rejectUser,
  getAllUsers,
  createUser,
  updateUser,
  assignUserOrganization,
  deleteUser,
  getAllOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getAllMunicipalities,
  getAuditLogs,
  revertAuditLog,
} from '../controllers/adminController';
import { protect } from '../middleware/protect';
import { adminOnly } from '../middleware/adminOnly';

const router = Router();

// Wszystkie trasy w adminRoute wymagają uwierzytelnienia (protect) oraz uprawnień administratora (adminOnly)
router.use(protect, adminOnly);

// 1. Weryfikacja służb / kont oczekujących
router.get('/users/pending', getPendingUsers);
router.patch('/users/:id/verify', verifyUser);
router.delete('/users/:id/reject', rejectUser);

// 2. CRUD i zarządzanie pracownikami (Users)
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.patch('/users/:id/assign-organization', assignUserOrganization);
router.delete('/users/:id', deleteUser);

// 3. CRUD i zarządzanie organizacjami (Organizations)
router.get('/organizations', getAllOrganizations);
router.post('/organizations', createOrganization);
router.put('/organizations/:id', updateOrganization);
router.delete('/organizations/:id', deleteOrganization);

// 4. Pomocnicze: lista gmin
router.get('/municipalities', getAllMunicipalities);

// 5. Dziennik Zdarzeń (Audit & Activity Logs) i Odwoływanie Zmian (Rollback)
router.get('/logs', getAuditLogs);
router.post('/logs/:id/revert', revertAuditLog);

export default router;

