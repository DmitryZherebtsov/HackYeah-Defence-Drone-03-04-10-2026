export type UserRole = 'admin' | 'koordynator' | 'czlonek';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  organizationId?: string;
  organization?: Organization;
  isVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Municipality {
  id: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
  type: 'samorzad' | 'sluzby' | 'ngo';
  municipalityId: string;
  municipality?: Municipality;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: User;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (userData: RegisterFormData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

export interface RegisterFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  organizationId: string;
  role?: UserRole;
}
