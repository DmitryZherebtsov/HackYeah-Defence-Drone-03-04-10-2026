import { Request, Response } from 'express';
import { Organization, Municipality } from '../models';

/**
 * @desc    Pobiera listę wszystkich organizacji (dostęp publiczny dla formularza rejestracji)
 * @route   GET /api/organizations
 * @access  Public
 */
export const getOrganizations = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizations = await Organization.findAll({
      include: [
        {
          model: Municipality,
          as: 'municipality',
          attributes: ['id', 'name'],
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
