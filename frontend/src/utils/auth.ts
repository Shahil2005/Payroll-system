// Client-side session storage + permission helpers (spec §7).
// The JWT lives in localStorage; api.ts reads it via getToken() for the
// Authorization header. Permission strings mirror the backend `payroll:*`.

const TOKEN_KEY = "croar_token";
const USER_KEY = "croar_user";

export type Permission =
  | "payroll:read"
  | "payroll:configure"
  | "payroll:run"
  | "payroll:approve"
  | "payroll:pay"
  | "payroll:manage"
  | "users:manage";

export interface AuthUser {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  permissions: string[];
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function userCan(user: AuthUser | null, permission: Permission): boolean {
  return !!user && user.permissions.includes(permission);
}
