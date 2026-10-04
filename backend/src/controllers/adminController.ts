import { Response } from 'express';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { User, Organization, Municipality, AuditLog, Mission } from '../models';
import { AuthenticatedRequest } from '../middleware/protect';
import { recordAuditLog } from '../services/auditService';

/**
 * @desc    Pobiera listę użytkowników oczekujących na weryfikację (isVerified: false)
 * @route   GET /api/admin/users/pending
 * @access  Private (wymaga protect i adminOnly)
 */
export const getPendingUsers = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const pendingUsers = await User.findAll({
      where: { isVerified: false },
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Organization,
          as: 'organization',
          include: [
            {
              model: Municipality,
              as: 'municipality',
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json({
      success: true,
      count: pendingUsers.length,
      data: pendingUsers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas pobierania użytkowników oczekujących na weryfikację.',
      error: error.message,
    });
  }
};

/**
 * @desc    Weryfikuje użytkownika (zmienia isVerified na true)
 * @route   PATCH /api/admin/users/:id/verify
 * @access  Private (wymaga protect i adminOnly)
 */
export const verifyUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Użytkownik o podanym identyfikatorze nie został znaleziony.',
      });
      return;
    }

    user.isVerified = true;
    await user.save();

    const updatedUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Organization,
          as: 'organization',
          include: [
            {
              model: Municipality,
              as: 'municipality',
            },
          ],
        },
      ],
    });

    // Rejestracja w Audit Log
    recordAuditLog({
      action: 'user_verified',
      entityType: 'user',
      entityId: user.id,
      user: req.user,
      details: `Weryfikacja i aktywacja konta służb dla użytkownika ${user.firstName} ${user.lastName} (${user.email})`,
      previousState: { isVerified: false },
      newState: { isVerified: true },
    });

    res.status(200).json({
      success: true,
      message: 'Użytkownik został pomyślnie zweryfikowany.',
      data: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas weryfikacji użytkownika.',
      error: error.message,
    });
  }
};

/**
 * @desc    Odrzuca weryfikację użytkownika (usuwa konto oczekujące)
 * @route   DELETE /api/admin/users/:id/reject
 * @access  Private (wymaga protect i adminOnly)
 */
export const rejectUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Użytkownik o podanym identyfikatorze nie został znaleziony.',
      });
      return;
    }

    const userData = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    };

    await user.destroy();

    // Rejestracja w Audit Log
    recordAuditLog({
      action: 'user_rejected',
      entityType: 'user',
      entityId: id,
      user: req.user,
      details: `Odrzucenie wniosku rejestracji i usunięcie konta użytkownika ${userData.firstName} ${userData.lastName} (${userData.email})`,
      previousState: userData,
      newState: null,
    });

    res.status(200).json({
      success: true,
      message: 'Wniosek o rejestrację został odrzucony, a konto usunięte.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas odrzucania użytkownika.',
      error: error.message,
    });
  }
};

/**
 * ============================================================================
 * CRUD PRACOWNIKÓW / UŻYTKOWNIKÓW (USERS)
 * ============================================================================
 */

/**
 * @desc    Pobiera wszystkich użytkowników/pracowników systemu
 * @route   GET /api/admin/users
 * @access  Private (adminOnly)
 */
export const getAllUsers = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Organization,
          as: 'organization',
          include: [
            {
              model: Municipality,
              as: 'municipality',
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas pobierania listy pracowników.',
      error: error.message,
    });
  }
};

/**
 * @desc    Tworzy nowego pracownika w systemie
 * @route   POST /api/admin/users
 * @access  Private (adminOnly)
 */
export const createUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { firstName, lastName, email, password, phone, role, organizationId, isVerified } = req.body;

    if (!firstName || !lastName || !email || !password || !phone || !organizationId) {
      res.status(400).json({
        success: false,
        message: 'Wszystkie podstawowe pola oraz organizacja są wymagane.',
      });
      return;
    }

    const existingUser = await User.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'Użytkownik o podanym adresie e-mail już istnieje.',
      });
      return;
    }

    const org = await Organization.findByPk(organizationId);
    if (!org) {
      res.status(404).json({
        success: false,
        message: 'Wybrana organizacja nie istnieje.',
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone: phone.trim(),
      role: role || 'czlonek',
      organizationId,
      isVerified: isVerified === undefined ? true : Boolean(isVerified),
    });

    const populatedUser = await User.findByPk(newUser.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Organization,
          as: 'organization',
          include: [
            {
              model: Municipality,
              as: 'municipality',
            },
          ],
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: 'Pracownik został pomyślnie utworzony.',
      data: populatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas tworzenia pracownika.',
      error: error.message,
    });
  }
};

/**
 * @desc    Aktualizuje dane pracownika
 * @route   PUT /api/admin/users/:id
 * @access  Private (adminOnly)
 */
export const updateUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, role, organizationId, isVerified, password } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Pracownik o podanym ID nie został odnaleziony.',
      });
      return;
    }

    if (email && email.toLowerCase().trim() !== user.email) {
      const existing = await User.findOne({
        where: { email: email.toLowerCase().trim() },
      });
      if (existing && existing.id !== user.id) {
        res.status(409).json({
          success: false,
          message: 'Inny użytkownik korzysta już z tego adresu e-mail.',
        });
        return;
      }
      user.email = email.toLowerCase().trim();
    }

    if (firstName) user.firstName = firstName.trim();
    if (lastName) user.lastName = lastName.trim();
    if (phone) user.phone = phone.trim();
    if (role) user.role = role;
    if (isVerified !== undefined) user.isVerified = Boolean(isVerified);

    if (organizationId) {
      const org = await Organization.findByPk(organizationId);
      if (!org) {
        res.status(404).json({
          success: false,
          message: 'Wybrana organizacja nie istnieje.',
        });
        return;
      }
      user.organizationId = organizationId;
    }

    if (password && password.trim().length >= 6) {
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();

    const populatedUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Organization,
          as: 'organization',
          include: [
            {
              model: Municipality,
              as: 'municipality',
            },
          ],
        },
      ],
    });

    res.status(200).json({
      success: true,
      message: 'Dane pracownika zostały pomyślnie zaktualizowane.',
      data: populatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas aktualizacji pracownika.',
      error: error.message,
    });
  }
};

/**
 * @desc    Szybkie przypisanie pracownika do organizacji
 * @route   PATCH /api/admin/users/:id/assign-organization
 * @access  Private (adminOnly)
 */
export const assignUserOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { organizationId } = req.body;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        message: 'Identyfikator organizacji jest wymagany.',
      });
      return;
    }

    const [user, org] = await Promise.all([
      User.findByPk(id),
      Organization.findByPk(organizationId),
    ]);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Użytkownik nie został odnaleziony.',
      });
      return;
    }

    if (!org) {
      res.status(404).json({
        success: false,
        message: 'Organizacja nie została odnaleziona.',
      });
      return;
    }

    user.organizationId = org.id;
    await user.save();

    const populatedUser = await User.findByPk(user.id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Organization,
          as: 'organization',
          include: [
            {
              model: Municipality,
              as: 'municipality',
            },
          ],
        },
      ],
    });

    res.status(200).json({
      success: true,
      message: `Pracownik został pomyślnie przypisany do organizacji "${org.name}".`,
      data: populatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas przypisywania pracownika do organizacji.',
      error: error.message,
    });
  }
};

/**
 * @desc    Usuwa konto pracownika z systemu
 * @route   DELETE /api/admin/users/:id
 * @access  Private (adminOnly)
 */
export const deleteUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Użytkownik o podanym identyfikatorze nie został znaleziony.',
      });
      return;
    }

    await user.destroy();

    res.status(200).json({
      success: true,
      message: 'Konto pracownika zostało pomyślnie usunięte z systemu.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas usuwania pracownika.',
      error: error.message,
    });
  }
};

/**
 * ============================================================================
 * CRUD ORGANIZACJI (ORGANIZATIONS)
 * ============================================================================
 */

/**
 * @desc    Pobiera wszystkie organizacje wraz z przypisanymi pracownikami
 * @route   GET /api/admin/organizations
 * @access  Private (adminOnly)
 */
export const getAllOrganizations = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const organizations = await Organization.findAll({
      include: [
        {
          model: Municipality,
          as: 'municipality',
        },
        {
          model: User,
          as: 'users',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'role', 'isVerified'],
        },
      ],
      order: [['name', 'ASC']],
    });

    res.status(200).json({
      success: true,
      count: organizations.length,
      data: organizations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas pobierania listy organizacji.',
      error: error.message,
    });
  }
};

/**
 * @desc    Tworzy nową organizację w systemie
 * @route   POST /api/admin/organizations
 * @access  Private (adminOnly)
 */
export const createOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { name, type, municipalityId, municipalityName } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: 'Nazwa organizacji jest wymagana.',
      });
      return;
    }

    let targetMunicipalityId = municipalityId;

    if (!targetMunicipalityId && municipalityName && municipalityName.trim()) {
      const [muni] = await Municipality.findOrCreate({
        where: { name: municipalityName.trim() },
        defaults: { name: municipalityName.trim() },
      });
      targetMunicipalityId = muni.id;
    }

    if (!targetMunicipalityId) {
      const defaultMuni = await Municipality.findOne();
      if (defaultMuni) {
        targetMunicipalityId = defaultMuni.id;
      } else {
        const newMuni = await Municipality.create({ name: 'Ogólnokrajowa' });
        targetMunicipalityId = newMuni.id;
      }
    }

    const newOrg = await Organization.create({
      name: name.trim(),
      type: type || 'sluzby',
      municipalityId: targetMunicipalityId,
    });

    const populatedOrg = await Organization.findByPk(newOrg.id, {
      include: [
        {
          model: Municipality,
          as: 'municipality',
        },
        {
          model: User,
          as: 'users',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'role', 'isVerified'],
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: 'Organizacja została pomyślnie zarejestrowana w systemie.',
      data: populatedOrg,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas tworzenia organizacji.',
      error: error.message,
    });
  }
};

/**
 * @desc    Aktualizuje organizację
 * @route   PUT /api/admin/organizations/:id
 * @access  Private (adminOnly)
 */
export const updateOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, type, municipalityId } = req.body;

    const org = await Organization.findByPk(id);
    if (!org) {
      res.status(404).json({
        success: false,
        message: 'Organizacja o podanym identyfikatorze nie istnieje.',
      });
      return;
    }

    if (name) org.name = name.trim();
    if (type) org.type = type;
    if (municipalityId) org.municipalityId = municipalityId;

    await org.save();

    const populatedOrg = await Organization.findByPk(org.id, {
      include: [
        {
          model: Municipality,
          as: 'municipality',
        },
        {
          model: User,
          as: 'users',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'role', 'isVerified'],
        },
      ],
    });

    res.status(200).json({
      success: true,
      message: 'Dane organizacji zostały pomyślnie zaktualizowane.',
      data: populatedOrg,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas aktualizacji organizacji.',
      error: error.message,
    });
  }
};

/**
 * @desc    Usuwa organizację
 * @route   DELETE /api/admin/organizations/:id
 * @access  Private (adminOnly)
 */
export const deleteOrganization = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const org = await Organization.findByPk(id, {
      include: [{ model: User, as: 'users' }],
    });

    if (!org) {
      res.status(404).json({
        success: false,
        message: 'Organizacja nie została odnaleziona.',
      });
      return;
    }

    await org.destroy();

    res.status(200).json({
      success: true,
      message: 'Organizacja została pomyślnie usunięta.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas usuwania organizacji.',
      error: error.message,
    });
  }
};

/**
 * @desc    Pobiera listę wszystkich gmin
 * @route   GET /api/admin/municipalities
 * @access  Private (adminOnly)
 */
export const getAllMunicipalities = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const municipalities = await Municipality.findAll({
      order: [['name', 'ASC']],
    });

    res.status(200).json({
      success: true,
      data: municipalities,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas pobierania gmin.',
      error: error.message,
    });
  }
};

/**
 * @desc    Pobiera dziennik zdarzeń i zmian (Audit Logs) z filtrowaniem i agregacjami
 * @route   GET /api/admin/logs
 * @access  Private (adminOnly)
 */
export const getAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const {
      userId,
      entityType,
      action,
      organization,
      search,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'DESC',
      page = '1',
      limit = '50',
    } = req.query;

    const whereClause: any = {};

    if (userId && userId !== 'all') {
      whereClause.userId = userId;
    }

    if (entityType && entityType !== 'all') {
      whereClause.entityType = entityType;
    }

    if (action && action !== 'all') {
      whereClause.action = action;
    }

    if (organization && organization !== 'all') {
      whereClause.organizationName = organization;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate as string);
      }
      if (endDate) {
        const endD = new Date(endDate as string);
        endD.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = endD;
      }
    }

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      whereClause[Op.or] = [
        { userName: { [Op.like]: q } },
        { userEmail: { [Op.like]: q } },
        { organizationName: { [Op.like]: q } },
        { details: { [Op.like]: q } },
      ];
    }

    let order: any = [['createdAt', sortOrder === 'ASC' ? 'ASC' : 'DESC']];
    if (sortBy === 'userName') {
      order = [['userName', sortOrder === 'ASC' ? 'ASC' : 'DESC']];
    } else if (sortBy === 'action') {
      order = [['action', sortOrder === 'ASC' ? 'ASC' : 'DESC']];
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const pageLimit = Math.max(1, Math.min(200, parseInt(limit as string) || 50));
    const offset = (pageNum - 1) * pageLimit;

    // Upewnij się, że tabela istnieje
    await AuditLog.sync();

    const { count, rows: logs } = await AuditLog.findAndCountAll({
      where: whereClause,
      order,
      limit: pageLimit,
      offset,
    });

    const allUsers = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'role', 'isVerified', 'createdAt'],
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type'],
          include: [{ model: Municipality, as: 'municipality', attributes: ['id', 'name'] }],
        },
      ],
      order: [['lastName', 'ASC']],
    });

    const allOrganizations = await Organization.findAll({
      attributes: ['id', 'name', 'type'],
      order: [['name', 'ASC']],
    });

    const totalLogs = await AuditLog.count();
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const count24h = await AuditLog.count({
      where: { createdAt: { [Op.gte]: oneDayAgo } },
    });
    const revertedCount = await AuditLog.count({
      where: { isReverted: true },
    });
    const activeMissionsCount = await Mission.count({ where: { status: ['przygotowanie', 'aktywna', 'powrot'] } });

    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / pageLimit),
      currentPage: pageNum,
      data: logs,
      availableUsers: allUsers.map((u: any) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isVerified: u.isVerified,
        organizationId: u.organization?.id,
        organizationName: u.organization?.name,
        organizationType: u.organization?.type,
        municipalityName: u.organization?.municipality?.name,
        createdAt: u.createdAt,
      })),
      availableOrganizations: allOrganizations.map((o) => o.name),
      metrics: {
        totalLogs,
        count24h,
        revertedCount,
        activeMissionsCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas pobierania dziennika zdarzeń (Audit Logs).',
      error: error.message,
    });
  }
};

/**
 * @desc    Odwołuje (cofa / rollback) wybraną zmianę z dziennika zdarzeń
 * @route   POST /api/admin/logs/:id/revert
 * @access  Private (adminOnly)
 */
export const revertAuditLog = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const log = await AuditLog.findByPk(id);
    if (!log) {
      res.status(404).json({
        success: false,
        message: 'Wpis w dzienniku zdarzeń nie został odnaleziony.',
      });
      return;
    }

    if (log.isReverted) {
      res.status(400).json({
        success: false,
        message: 'Ta zmiana została już wcześniej odwołana (wycofana).',
      });
      return;
    }

    const adminUser = req.user!;
    let rollbackDetails = '';

    if (log.action === 'user_verified' && log.entityId) {    } else if (log.action === 'user_verified' && log.entityId) {
      const targetUser = await User.findByPk(log.entityId);
      if (targetUser) {
        targetUser.isVerified = false;
        await targetUser.save();
        rollbackDetails = `Cofnięto weryfikację konta użytkownika ${targetUser.firstName} ${targetUser.lastName}.`;
      }
    } else {
      rollbackDetails = `Wycofano operację "${log.action}" (ID wpisu: ${log.id})`;
    }

    log.isReverted = true;
    log.revertedAt = new Date();
    log.revertedByUserId = adminUser.id;
    log.revertedByUserName = `${adminUser.firstName} ${adminUser.lastName}`;
    await log.save();

    await recordAuditLog({
      action: 'revert_action',
      entityType: log.entityType,
      entityId: log.entityId,
      user: adminUser,
      details: `Odwołanie zmiany (Rollback wpisu ${log.id}): ${rollbackDetails}`,
      previousState: { revertedLogId: log.id, actionReverted: log.action },
      newState: { isReverted: true },
    });

    res.status(200).json({
      success: true,
      message: `Pomyślnie wycofano zmianę: ${rollbackDetails}`,
      data: log,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas wycofywania zmiany.',
      error: error.message,
    });
  }
};

