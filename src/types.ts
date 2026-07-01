export interface CerberusConfig {
  baseUrl: string;
  apiKey: string;
}

export interface User {
  id: string;
  email: string;
  role: 'user' | 'tenant' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  project_id?: string;
  name?: string;
  picture?: string;
  receive_updates?: boolean;
  login_methods?: string[];
}

export interface Session {
  family_id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_active: string;
  is_current: boolean;
  auth_provider: string;
}

// AuthResponse removed – not used by SDK (login endpoints only return MessageResponse)

/** Fields that can be updated via PATCH /users/me. */
export interface ProfileUpdate {
  name?: string;
  picture?: string;
  receive_updates?: boolean;
}

export interface MessageResponse {
  message: string;
}

export interface LoginResponse {
  message: string;
  csrf_token: string;
}

export interface TokenResponse {
  access_token: string;
  csrf_token?: string;
}

export interface ErrorResponse {
  detail: string | Array<{ loc: string[]; msg: string; type: string }>;
}
