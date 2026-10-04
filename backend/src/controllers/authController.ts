import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, Organization, Municipality } from '../models';

const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * @desc    Rejestracja nowego użytkownika
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, password, phone, organization, organizationId, role } = req.body;
    const targetOrgId = organizationId || organization;

    // Walidacja obecności wymaganych pól
    if (!firstName || !lastName || !email || !password || !phone || !targetOrgId) {
      res.status(400).json({
        success: false,
        message: 'Wszystkie wymagane pola muszą zostać wypełnione.',
      });
      return;
    }

    // Sprawdzenie, czy użytkownik o danym emailu już istnieje
    const existingUser = await User.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'Użytkownik o podanym adresie email już istnieje.',
      });
      return;
    }

    // Haszowanie hasła
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Utworzenie użytkownika (domyślnie isVerified: false)
    const newUser = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone,
      organizationId: targetOrgId,
      role: role || 'czlonek',
      isVerified: false,
    });

    // Zwrócenie danych użytkownika bez hasła i bez tokenu (wymaga weryfikacji)
    res.status(201).json({
      success: true,
      message: 'Rejestracja zakończona sukcesem. Twoje konto oczekuje na weryfikację przez administratora.',
      user: {
        id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        organizationId: newUser.organizationId,
        isVerified: newUser.isVerified,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas rejestracji użytkownika.',
      error: error.message,
    });
  }
};

/**
 * @desc    Logowanie użytkownika i generowanie tokenu JWT
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Walidacja danych wejściowych
    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Podaj adres email oraz hasło.',
      });
      return;
    }

    // Sprawdzenie, czy użytkownik istnieje
    const user = await User.findOne({
      where: { email: email.toLowerCase().trim() },
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

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Nieprawidłowy adres email lub hasło.',
      });
      return;
    }

    // Weryfikacja hasła
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Nieprawidłowy adres email lub hasło.',
      });
      return;
    }

    // Generowanie tokenu JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET as jwt.Secret,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
    );

    // Zwrócenie tokenu oraz danych użytkownika
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        organizationId: user.organizationId,
        organization: (user as any).organization,
        isVerified: user.isVerified,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Wystąpił błąd podczas logowania.',
      error: error.message,
    });
  }
};
