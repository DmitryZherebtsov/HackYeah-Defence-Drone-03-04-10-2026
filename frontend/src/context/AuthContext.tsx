import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { User, AuthContextType, RegisterFormData, AuthResponse } from '../types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 1. Sprawdzenie stanu początkowego przy ładowaniu aplikacji
  useEffect(() => {
    const initializeAuth = () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error('Błąd podczas odczytu danych sesji z localStorage:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // 2. Funkcja logowania
  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.post<AuthResponse>('/auth/login', {
        email,
        password,
      });

      const { token: jwtToken, user: loggedUser } = response.data;

      if (jwtToken && loggedUser) {
        setToken(jwtToken);
        setUser(loggedUser);
        localStorage.setItem('token', jwtToken);
        localStorage.setItem('user', JSON.stringify(loggedUser));
        return { success: true };
      }

      return {
        success: false,
        message: 'Nie udało się odebrać danych uwierzytelniających.',
      };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || 'Wystąpił błąd podczas logowania.';
      return { success: false, message: errorMessage };
    }
  };

  // 3. Funkcja rejestracji (bez automatycznego logowania – wymagana weryfikacja)
  const register = async (
    userData: RegisterFormData
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.post<AuthResponse>('/auth/register', userData);
      return {
        success: true,
        message: response.data.message || 'Rejestracja zakończona sukcesem.',
      };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || 'Wystąpił błąd podczas rejestracji.';
      return { success: false, message: errorMessage };
    }
  };

  // 4. Funkcja wylogowania
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook pomocniczy do używania AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth musi być używany wewnątrz AuthProvider');
  }
  return context;
};
