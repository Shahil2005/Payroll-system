// Central API client. Base path matches the spec: /api/v1/enterprise/payroll.
// authHeaders() injects the bearer JWT from the stored session (spec §7).

import { clearSession, getToken, type AuthUser } from "@/utils/auth";

const API_ROOT =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type LineType = "fixed" | "percent";

export interface MoneyLine {
  code: string;
  label: string;
  type: LineType;
  amount?: number | string | null;
  percent?: number | string | null;
  percent_of?: string | null;
}

export interface ResolvedLine {
  code: string;
  label: string;
  amount: number;
}

export type PayFrequency = "MONTHLY" | "WEEKLY";

export interface SalaryStructure {
  id: string;
  company_id: string;
  employee_id: string;
  ctc: number | string;
  currency: string;
  pay_frequency: PayFrequency;
  effective_from: string;
  components: MoneyLine[];
  default_deductions: MoneyLine[];
  lop_days: number | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CycleTotals {
  headcount?: number;
  gross?: number;
  deductions?: number;
  net?: number;
}

export type CycleStatus =
  | "DRAFT"
  | "PROCESSING"
  | "APPROVED"
  | "PAID"
  | "CANCELLED";

export interface PayrollCycle {
  id: string;
  company_id: string;
  name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: CycleStatus;
  totals: CycleTotals | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Payslip {
  id: string;
  company_id: string;
  cycle_id: string;
  employee_id: string;
  gross_earnings: number | string;
  total_deductions: number | string;
  net_pay: number | string;
  lop_days: number | string;
  paid_days: number | string | null;
  currency: string;
  status: "PENDING" | "PAID";
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  earnings?: ResolvedLine[];
  deductions?: ResolvedLine[];
}

export interface Employee {
  id: string;
  company_id: string;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  payment_information: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SkippedEmployee {
  employee_id: string;
  reason: string;
}

export interface DashboardCycle {
  id: string;
  name: string;
  status: CycleStatus;
  period_start: string;
  period_end: string;
  pay_date: string;
  net: number | string;
  headcount: number;
}

export interface DashboardSummary {
  employees: { total: number; configured: number; missing: number };
  active_structures: number;
  cycles: { total: number; by_status: Record<string, number> };
  payroll: {
    gross_paid: number | string;
    net_paid: number | string;
    payslips_paid: number;
    pending_net: number | string;
  };
  current_cycle: DashboardCycle | null;
  recent_cycles: DashboardCycle[];
  currency: string;
}

export interface RunResult {
  created: number;
  updated: number;
  skipped: SkippedEmployee[];
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Token missing/expired/invalid: drop the session and bounce to login.
    if (res.status === 401 && typeof window !== "undefined") {
      clearSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      msg = body.detail || body.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) =>
    fetch(`${API_ROOT}${path}`, { headers: { ...authHeaders() } }).then(handle<T>),
  post: <T>(path: string, body?: unknown) =>
    fetch(`${API_ROOT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(handle<T>),
  put: <T>(path: string, body: unknown) =>
    fetch(`${API_ROOT}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then(handle<T>),
  del: <T>(path: string) =>
    fetch(`${API_ROOT}${path}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    }).then(handle<T>),
};

const P = "/api/v1/enterprise/payroll";
const E = "/api/v1/enterprise/employees";

export const payrollApi = {
  // Dashboard
  getDashboard: () => apiClient.get<DashboardSummary>(`${P}/dashboard`),

  // Salary structures
  listStructures: (employeeId?: string) =>
    apiClient.get<SalaryStructure[]>(
      employeeId ? `${P}/structures?employee_id=${employeeId}` : `${P}/structures`
    ),
  getStructure: (id: string) => apiClient.get<SalaryStructure>(`${P}/structures/${id}`),
  createStructure: (body: Partial<SalaryStructure>) =>
    apiClient.post<SalaryStructure>(`${P}/structures`, body),
  updateStructure: (id: string, body: Partial<SalaryStructure>) =>
    apiClient.put<SalaryStructure>(`${P}/structures/${id}`, body),
  deleteStructure: (id: string) => apiClient.del<SalaryStructure>(`${P}/structures/${id}`),

  // Cycles
  listCycles: () => apiClient.get<PayrollCycle[]>(`${P}/cycles`),
  getCycle: (id: string) => apiClient.get<PayrollCycle>(`${P}/cycles/${id}`),
  createCycle: (body: Partial<PayrollCycle>) =>
    apiClient.post<PayrollCycle>(`${P}/cycles`, body),
  runCycle: (id: string) => apiClient.post<RunResult>(`${P}/cycles/${id}/run`),
  approveCycle: (id: string) => apiClient.post<PayrollCycle>(`${P}/cycles/${id}/approve`),
  markPaidCycle: (id: string) => apiClient.post<PayrollCycle>(`${P}/cycles/${id}/mark-paid`),
  cancelCycle: (id: string) => apiClient.post<PayrollCycle>(`${P}/cycles/${id}/cancel`),
  deleteCycle: (id: string) => apiClient.del<PayrollCycle>(`${P}/cycles/${id}`),

  // Payslips
  listCyclePayslips: (cycleId: string) =>
    apiClient.get<Payslip[]>(`${P}/cycles/${cycleId}/payslips`),
  getPayslip: (id: string) => apiClient.get<Payslip>(`${P}/payslips/${id}`),

  // Employees
  listEmployees: () => apiClient.get<Employee[]>(E),
  createEmployee: (body: Partial<Employee>) => apiClient.post<Employee>(E, body),
  updateEmployee: (id: string, body: Partial<Employee>) =>
    apiClient.put<Employee>(`${E}/${id}`, body),
  deleteEmployee: (id: string) => apiClient.del<void>(`${E}/${id}`),
};

// --- Auth ------------------------------------------------------------------
const A = "/api/v1/auth";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>(`${A}/login`, { email, password }),
  me: () => apiClient.get<AuthUser>(`${A}/me`),
  logout: () => apiClient.post<{ message: string }>(`${A}/logout`),
};

// --- Helpers ---------------------------------------------------------------

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function resolveOne(
  line: MoneyLine,
  byCode: Record<string, number>,
  baseWhenOmitted: number
): number {
  if (line.type === "fixed") return Number(line.amount) || 0;
  if (line.type === "percent") {
    const pct = Number(line.percent) || 0;
    const base = line.percent_of ? byCode[line.percent_of] ?? 0 : baseWhenOmitted;
    return (pct / 100) * base;
  }
  return 0;
}

export interface SalaryEstimate {
  gross: number;
  totalDeductions: number;
  net: number;
  earnings: ResolvedLine[];
  deductions: ResolvedLine[];
}

/** Default working-days basis (mirrors backend DEFAULT_WORKING_DAYS). */
export const WORKING_DAYS = 30;

/** Client-side estimate mirroring the backend compute_payslip, including LOP
 *  proration of earnings (deductions are not pro-rated). */
export function estimateSalary(
  components: MoneyLine[],
  deductions: MoneyLine[],
  lopDays = 0,
  workingDays = WORKING_DAYS
): SalaryEstimate {
  const lop = Math.max(0, Math.min(Number(lopDays) || 0, workingDays));
  const multiplier = lop > 0 ? (workingDays - lop) / workingDays : 1;

  // Pass 1: resolve earnings on the raw (un-prorated) basis.
  const rawByCode: Record<string, number> = {};
  let rawGross = 0;
  const rawLines: { code: string; label: string; amount: number }[] = [];
  for (const line of components || []) {
    if (!line.code?.trim()) continue;
    const amt = round2(resolveOne(line, rawByCode, rawGross));
    rawByCode[line.code] = amt;
    rawGross = round2(rawGross + amt);
    rawLines.push({ code: line.code, label: line.label || line.code, amount: amt });
  }

  // Apply LOP proration uniformly to each earning line.
  const byCode: Record<string, number> = {};
  let gross = 0;
  const earnings: ResolvedLine[] = [];
  for (const { code, label, amount } of rawLines) {
    const amt = round2(amount * multiplier);
    byCode[code] = amt;
    gross = round2(gross + amt);
    earnings.push({ code, label, amount: amt });
  }
  const dedRef = { ...byCode };
  let totalDeductions = 0;
  const ded: ResolvedLine[] = [];
  for (const line of deductions || []) {
    if (!line.code?.trim()) continue;
    const amt = round2(resolveOne(line, dedRef, gross));
    dedRef[line.code] = amt;
    totalDeductions = round2(totalDeductions + amt);
    ded.push({ code: line.code, label: line.label || line.code, amount: amt });
  }
  return { gross, totalDeductions, net: round2(gross - totalDeductions), earnings, deductions: ded };
}

export function inr(value: number | string | null | undefined, currency = "INR"): string {
  const n = Number(value || 0);
  return `${currency === "INR" ? "₹" : currency + " "}${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
