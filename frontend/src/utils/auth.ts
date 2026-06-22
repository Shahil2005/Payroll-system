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
  | "users:manage"
  | "self:read";

export interface AuthUser {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  // Set for self-service (EMPLOYEE) users — the Employee record they own.
  employee_id?: string | null;
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

/** True for a self-service user (can read only their own records, not the
 *  company-wide /enterprise app). */
export function isSelfServiceUser(user: AuthUser | null): boolean {
  return (
    !!user &&
    user.permissions.includes("self:read") &&
    !user.permissions.includes("payroll:read")
  );
}

/** Where to send a user after login / when they hit the wrong app section.
 *  Self-service users land in their own area; everyone else in the enterprise
 *  app. */
export function landingPath(user: AuthUser | null): string {
  return isSelfServiceUser(user) ? "/employee/dashboard" : "/enterprise/dashboard";
}

// Single source of truth for which permission an enterprise route requires.
// Checked in the enterprise layout so direct-URL navigation is gated, not just
// the sidebar links (defense in depth — the API also returns 403). List the
// most specific prefixes first; the first matching prefix wins.
export const routePermissions: ReadonlyArray<{
  prefix: string;
  permission: Permission;
}> = [
  { prefix: "/enterprise/dashboard", permission: "payroll:read" },
  { prefix: "/enterprise/payroll/structures", permission: "payroll:read" },
  { prefix: "/enterprise/payroll/templates", permission: "payroll:read" },
  { prefix: "/enterprise/payroll", permission: "payroll:read" },
  { prefix: "/enterprise/timesheets", permission: "payroll:read" },
  { prefix: "/enterprise/leave", permission: "payroll:read" },
  { prefix: "/enterprise/employees", permission: "payroll:read" },
  { prefix: "/enterprise/taxes", permission: "payroll:read" },
  { prefix: "/enterprise/reports", permission: "payroll:read" },
  { prefix: "/enterprise/activity", permission: "payroll:read" },
  { prefix: "/enterprise/team", permission: "users:manage" },
  { prefix: "/enterprise/settings", permission: "users:manage" },
];

/** Permission required to view `pathname`, or null when the route is ungated. */
export function permissionForRoute(pathname: string): Permission | null {
  const match = routePermissions.find((r) => pathname.startsWith(r.prefix));
  return match ? match.permission : null;
}
