import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './protect';

/**
 * @desc Middleware zezwalający na dostęp wyłącznie użytkownikom z rolą 'admin'
 */
export const adminOnly = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Dostęp zabroniony. Wymagane uprawnienia administratora.',
    });
    return;
  }

  next();
};
