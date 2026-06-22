// Central API client. Base path matches the spec: /api/v1/enterprise/payroll.
// authHeaders() injects the bearer JWT from the stored session (spec §7).

import { clearSession, getToken, type AuthUser } from "@/utils/auth";

const API_ROOT =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// "balance" earning absorbs the CTC remainder (period CTC - sum of other
// earnings); percent lines may target the reserved code "CTC".
export type LineType = "fixed" | "percent" | "balance";

/** Reserved component code that resolves to per-period cost-to-company. */
export const CTC_CODE = "CTC";

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

export type PayFrequency = "MONTHLY" | "WEEKLY" | "HOURLY";

export interface SalaryStructure {
  id: string;
  company_id: string;
  employee_id: string;
  ctc: number | string;
  currency: string;
  pay_frequency: PayFrequency;
  // Set when pay_frequency is HOURLY: gross = hours_worked * rate.
  hourly_rate?: number | string | null;
  effective_from: string;
  components: MoneyLine[];
  default_deductions: MoneyLine[];
  lop_days: number | string;
  is_active: boolean;
  // Statutory toggles (Phase 1)
  pf_enabled: boolean;
  pf_cap_at_ceiling: boolean;
  pf_wage_codes: string[] | null;
  esi_enabled: boolean;
  pt_enabled: boolean;
  tds_enabled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Reusable, CTC-driven salary template (no employee / CTC of its own). */
export interface SalaryTemplate {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  currency: string;
  pay_frequency: PayFrequency;
  components: MoneyLine[];
  default_deductions: MoneyLine[];
  pf_enabled: boolean;
  pf_cap_at_ceiling: boolean;
  pf_wage_codes: string[] | null;
  esi_enabled: boolean;
  pt_enabled: boolean;
  tds_enabled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TemplateAssignment {
  employee_id: string;
  ctc: number;
  effective_from: string;
}

export interface TemplateApplyResult {
  created: string[];
  skipped: SkippedEmployee[];
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
  employer_contributions?: ResolvedLine[];
  statutory?: Record<string, unknown> | null;
}

export type AdjustmentKind = "earning" | "deduction";

export interface Adjustment {
  id: string;
  company_id: string;
  cycle_id: string;
  employee_id: string;
  kind: AdjustmentKind;
  code: string;
  label: string;
  amount: number | string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewAdjustment {
  employee_id: string;
  kind: AdjustmentKind;
  code: string;
  label: string;
  amount: number;
  note?: string | null;
}

export interface Employee {
  id: string;
  company_id: string;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  payment_information: Record<string, unknown> | null;
  // HR / payslip detail fields
  designation: string | null;
  department: string | null;
  location: string | null;
  bank_account_no: string | null;
  // Statutory identifiers / drivers (Phase 1)
  pan: string | null;
  uan: string | null;
  esic_number: string | null;
  state: string | null;
  date_of_joining: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Indian state codes with a configured Professional Tax schedule (backend
// app/services/statutory.py). Others are accepted but yield ₹0 PT.
export const PT_STATES: { code: string; label: string }[] = [
  { code: "KA", label: "Karnataka" },
  { code: "MH", label: "Maharashtra" },
  { code: "WB", label: "West Bengal" },
  { code: "TG", label: "Telangana" },
  { code: "AP", label: "Andhra Pradesh" },
];

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

export interface EmailResult {
  sent: boolean;
  to: string;
}

export interface EmailFailure {
  payslip_id: string;
  employee_id: string;
  reason: string;
}

export interface BulkEmailResult {
  sent: number;
  failed: EmailFailure[];
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
  // Multipart upload — do NOT set Content-Type; the browser adds the boundary.
  putForm: <T>(path: string, form: FormData) =>
    fetch(`${API_ROOT}${path}`, {
      method: "PUT",
      headers: { ...authHeaders() },
      body: form,
    }).then(handle<T>),
  postForm: <T>(path: string, form: FormData) =>
    fetch(`${API_ROOT}${path}`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
    }).then(handle<T>),
};

// Fetch a binary file with auth and trigger a browser download. Reuses the
// 401 handling shape of handle() but keeps the body as a Blob.
async function downloadFile(path: string): Promise<void> {
  // Cache-bust so a re-download always reflects the latest server state (e.g. a
  // newly-applied payslip template), never a stale browser-cached file.
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API_ROOT}${path}${sep}_=${Date.now()}`, {
    headers: { ...authHeaders() },
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      clearSession();
      if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
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
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  // Fallback when the filename header is unavailable: pick an extension from the
  // content type so a CSV never ends up named ".pdf" (Content-Type is always
  // exposed to JS; Content-Disposition needs an explicit CORS expose-header).
  const contentType = res.headers.get("Content-Type") || "";
  const ext = contentType.includes("csv")
    ? "csv"
    : contentType.includes("pdf")
      ? "pdf"
      : "bin";
  const filename = match ? match[1] : `download.${ext}`;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

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
  // Live preview — runs the real engine (incl. statutory + TDS), saves nothing.
  previewStructure: (body: StructurePreviewIn) =>
    apiClient.post<StructurePreviewOut>(`${P}/structures/preview`, body),
  updateStructure: (id: string, body: Partial<SalaryStructure>) =>
    apiClient.put<SalaryStructure>(`${P}/structures/${id}`, body),
  deleteStructure: (id: string) => apiClient.del<SalaryStructure>(`${P}/structures/${id}`),

  // Salary templates (reusable, CTC-driven; apply -> per-employee structures)
  listTemplates: () => apiClient.get<SalaryTemplate[]>(`${P}/templates`),
  getTemplate: (id: string) => apiClient.get<SalaryTemplate>(`${P}/templates/${id}`),
  createTemplate: (body: Partial<SalaryTemplate>) =>
    apiClient.post<SalaryTemplate>(`${P}/templates`, body),
  updateTemplate: (id: string, body: Partial<SalaryTemplate>) =>
    apiClient.put<SalaryTemplate>(`${P}/templates/${id}`, body),
  deleteTemplate: (id: string) => apiClient.del<SalaryTemplate>(`${P}/templates/${id}`),
  applyTemplate: (id: string, assignments: TemplateAssignment[], replaceExisting = true) =>
    apiClient.post<TemplateApplyResult>(`${P}/templates/${id}/apply`, {
      assignments,
      replace_existing: replaceExisting,
    }),

  // Cycles
  listCycles: () => apiClient.get<PayrollCycle[]>(`${P}/cycles`),
  getCycle: (id: string) => apiClient.get<PayrollCycle>(`${P}/cycles/${id}`),
  createCycle: (body: Partial<PayrollCycle>) =>
    apiClient.post<PayrollCycle>(`${P}/cycles`, body),
  runCycle: (id: string) => apiClient.post<RunResult>(`${P}/cycles/${id}/run`),

  // Per-run adjustments (one-time earnings/deductions on a cycle)
  listAdjustments: (cycleId: string) =>
    apiClient.get<Adjustment[]>(`${P}/cycles/${cycleId}/adjustments`),
  addAdjustment: (cycleId: string, body: NewAdjustment) =>
    apiClient.post<Adjustment>(`${P}/cycles/${cycleId}/adjustments`, body),
  deleteAdjustment: (id: string) => apiClient.del<Adjustment>(`${P}/adjustments/${id}`),

  approveCycle: (id: string) => apiClient.post<PayrollCycle>(`${P}/cycles/${id}/approve`),
  markPaidCycle: (id: string) => apiClient.post<PayrollCycle>(`${P}/cycles/${id}/mark-paid`),
  cancelCycle: (id: string) => apiClient.post<PayrollCycle>(`${P}/cycles/${id}/cancel`),
  deleteCycle: (id: string) => apiClient.del<PayrollCycle>(`${P}/cycles/${id}`),

  // Payslips
  listCyclePayslips: (cycleId: string) =>
    apiClient.get<Payslip[]>(`${P}/cycles/${cycleId}/payslips`),
  getPayslip: (id: string) => apiClient.get<Payslip>(`${P}/payslips/${id}`),
  // HTML rendered from the company's uploaded template ({html:null} = none).
  getPayslipPreviewHtml: (id: string) =>
    apiClient.get<{ html: string | null }>(`${P}/payslips/${id}/preview-html`),
  downloadPayslipPdf: (id: string) => downloadFile(`${P}/payslips/${id}/pdf`),
  downloadPayslipDocx: (id: string) => downloadFile(`${P}/payslips/${id}/docx`),
  emailPayslip: (id: string) => apiClient.post<EmailResult>(`${P}/payslips/${id}/email`),
  emailCyclePayslips: (cycleId: string) =>
    apiClient.post<BulkEmailResult>(`${P}/cycles/${cycleId}/email-payslips`),

  // Employees
  listEmployees: () => apiClient.get<Employee[]>(E),
  createEmployee: (body: Partial<Employee>) => apiClient.post<Employee>(E, body),
  updateEmployee: (id: string, body: Partial<Employee>) =>
    apiClient.put<Employee>(`${E}/${id}`, body),
  deleteEmployee: (id: string) => apiClient.del<void>(`${E}/${id}`),
};

// --- Timesheets & work calendar --------------------------------------------
const TS = "/api/v1/enterprise/timesheets";
const CAL = "/api/v1/enterprise/calendar";

export type TimesheetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type TimesheetMode = "ATTENDANCE" | "HOURLY";
export type DayStatus =
  | "PRESENT"
  | "PAID_LEAVE"
  | "UNPAID_LEAVE"
  | "HALF_DAY"
  | "WFH"
  | "HOLIDAY"
  | "WEEKLY_OFF";

/** Day-status options HR can pick per working day (non-working ones are set by
 *  the calendar and shown read-only). */
export const DAY_STATUS_OPTIONS: { value: DayStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "PAID_LEAVE", label: "Paid Leave" },
  { value: "UNPAID_LEAVE", label: "Unpaid Leave (LOP)" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "WFH", label: "Work From Home" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "WEEKLY_OFF", label: "Weekly Off" },
];

export interface TimesheetEntry {
  id: string;
  entry_date: string;
  day_status: DayStatus;
  hours: number | string | null;
  note: string | null;
}

export interface Timesheet {
  id: string;
  company_id: string;
  cycle_id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  mode: TimesheetMode;
  status: TimesheetStatus;
  worked_days: number | string;
  lop_days: number | string;
  half_days: number | string;
  total_hours: number | string;
  submitted_at: string | null;
  approved_at: string | null;
  submitted_by_id?: string | null;
  approved_by_id?: string | null;
  notes: string | null;
  employee_name?: string | null;
  employee_code?: string | null;
}

export interface TimesheetDetail extends Timesheet {
  entries: TimesheetEntry[];
  submitted_by_name?: string | null;
  approved_by_name?: string | null;
}

export interface TimesheetGenerateResult {
  created: number;
  existing: number;
  skipped: SkippedEmployee[];
}

/** One day's edit (matched to a seeded entry by date). */
export interface TimesheetEntryEdit {
  entry_date: string;
  day_status?: DayStatus;
  hours?: number | null;
  note?: string | null;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
}

export interface WorkCalendarConfig {
  use_calendar_working_days: boolean;
  weekly_offs: string[];
  // Segregation of duties: when on, a timesheet/leave submitter cannot approve
  // their own submission.
  enforce_maker_checker: boolean;
}

export const timesheetApi = {
  generate: (cycleId: string) =>
    apiClient.post<TimesheetGenerateResult>(`${TS}/cycles/${cycleId}/generate`),
  listForCycle: (cycleId: string) => apiClient.get<Timesheet[]>(`${TS}/cycles/${cycleId}`),
  get: (id: string) => apiClient.get<TimesheetDetail>(`${TS}/${id}`),
  updateEntries: (id: string, entries: TimesheetEntryEdit[]) =>
    apiClient.put<TimesheetDetail>(`${TS}/${id}/entries`, { entries }),
  submit: (id: string) => apiClient.post<Timesheet>(`${TS}/${id}/submit`),
  approve: (id: string) => apiClient.post<Timesheet>(`${TS}/${id}/approve`),
  reject: (id: string, note?: string) =>
    apiClient.post<Timesheet>(`${TS}/${id}/reject`, { note: note ?? null }),
  reopen: (id: string) => apiClient.post<Timesheet>(`${TS}/${id}/reopen`),
};

export const calendarApi = {
  getConfig: () => apiClient.get<WorkCalendarConfig>(`${CAL}/config`),
  updateConfig: (body: Partial<WorkCalendarConfig>) =>
    apiClient.put<WorkCalendarConfig>(`${CAL}/config`, body),
  listHolidays: () => apiClient.get<Holiday[]>(`${CAL}/holidays`),
  createHoliday: (holiday_date: string, name: string) =>
    apiClient.post<Holiday>(`${CAL}/holidays`, { holiday_date, name }),
  deleteHoliday: (id: string) => apiClient.del<void>(`${CAL}/holidays/${id}`),
};

// --- Leave management ------------------------------------------------------
const LV = "/api/v1/enterprise/leave";

export type AccrualMethod = "ANNUAL" | "MONTHLY";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  is_paid: boolean;
  annual_quota: number | string;
  accrual: AccrualMethod;
  carry_forward_cap: number | string | null;
  is_active: boolean;
}

export interface LeaveTypeInput {
  name: string;
  code: string;
  is_paid: boolean;
  annual_quota: number;
  accrual: AccrualMethod;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  financial_year: string;
  entitled: number | string;
  accrued: number | string;
  used: number | string;
  balance: number | string;
  employee_name?: string | null;
  leave_type_name?: string | null;
  leave_type_code?: string | null;
  is_paid?: boolean | null;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number | string;
  half_day: boolean;
  status: LeaveStatus;
  reason: string | null;
  decision_note: string | null;
  decided_at: string | null;
  employee_name?: string | null;
  leave_type_name?: string | null;
  leave_type_code?: string | null;
}

export interface LeaveRequestInput {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day?: boolean;
  reason?: string | null;
}

export const leaveApi = {
  listTypes: () => apiClient.get<LeaveType[]>(`${LV}/types`),
  createType: (body: LeaveTypeInput) => apiClient.post<LeaveType>(`${LV}/types`, body),
  updateType: (id: string, body: Partial<LeaveTypeInput> & { is_active?: boolean }) =>
    apiClient.put<LeaveType>(`${LV}/types/${id}`, body),
  listBalances: (financialYear?: string) =>
    apiClient.get<LeaveBalance[]>(
      `${LV}/balances${financialYear ? `?financial_year=${financialYear}` : ""}`,
    ),
  listRequests: (status?: LeaveStatus) =>
    apiClient.get<LeaveRequest[]>(`${LV}/requests${status ? `?status=${status}` : ""}`),
  createRequest: (body: LeaveRequestInput) =>
    apiClient.post<LeaveRequest>(`${LV}/requests`, body),
  approveRequest: (id: string, note?: string) =>
    apiClient.post<LeaveRequest>(`${LV}/requests/${id}/approve`, { note: note ?? null }),
  rejectRequest: (id: string, note?: string) =>
    apiClient.post<LeaveRequest>(`${LV}/requests/${id}/reject`, { note: note ?? null }),
  cancelRequest: (id: string, note?: string) =>
    apiClient.post<LeaveRequest>(`${LV}/requests/${id}/cancel`, { note: note ?? null }),
};

// --- Reports ---------------------------------------------------------------
const R = "/api/v1/enterprise/reports";

export type ReportFormat = "csv" | "pdf";

export const reportsApi = {
  salaryRegister: (cycleId: string, format: ReportFormat) =>
    downloadFile(`${R}/salary-register?cycle_id=${cycleId}&format=${format}`),
  payrollSummary: (format: ReportFormat) =>
    downloadFile(`${R}/payroll-summary?format=${format}`),
};

// --- Settings (organisation profile) ---------------------------------------
const S = "/api/v1/enterprise/settings";

export interface Organization {
  id: string;
  name: string;
  currency: string;
  legal_name: string | null;
  industry: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  pan: string | null;
  tan: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganizationUpdate = Partial<
  Omit<Organization, "id" | "created_at" | "updated_at">
>;

export interface PayslipSettings {
  display_name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  footer_note: string | null;
  show_employer_contributions: boolean;
  show_tax_block: boolean;
  show_attendance: boolean;
  use_doc_template: boolean;
  company_name: string; // actual company name, used as the display fallback
  has_doc_template: boolean; // whether a .docx template has been uploaded
  doc_filename: string | null;
  doc_mapped: boolean; // active template was produced by the mapping wizard
  doc_has_tokens: boolean; // active template actually has fillable {{ tokens }}
}

export type PayslipSettingsUpdate = Partial<
  Omit<
    PayslipSettings,
    "company_name" | "has_doc_template" | "doc_filename" | "doc_mapped"
  >
>;

// --- Payslip "smart mapping" wizard ---
export interface PayslipFieldOption {
  group: string;
  key: string; // the docxtpl token, e.g. "employee.name" / "amount.BASIC"
  label: string;
}

export interface PayslipDocSlot {
  index: number;
  kind: "table" | "para";
  label: string;
  context: string;
  current: string;
  suggested_token: string | null;
}

export interface PayslipDocScan {
  filename: string;
  slots: PayslipDocSlot[];
  fields: PayslipFieldOption[];
}

// Statutory rates/thresholds (rates are fractions: 0.12 = 12%).
export interface StatutoryConfig {
  pf_employee_rate: number;
  pf_employer_rate: number;
  pf_wage_ceiling: number;
  eps_rate: number;
  eps_wage_ceiling: number;
  esi_wage_limit: number;
  esi_employee_rate: number;
  esi_employer_rate: number;
  tds_new_rebate_limit: number;
  tds_old_rebate_limit: number;
  tds_new_std_deduction: number;
  tds_old_std_deduction: number;
}

export type StatutoryConfigUpdate = Partial<StatutoryConfig>;

export const settingsApi = {
  getOrganization: () => apiClient.get<Organization>(`${S}/organization`),
  updateOrganization: (body: OrganizationUpdate) =>
    apiClient.put<Organization>(`${S}/organization`, body),
  getPayslipSettings: () => apiClient.get<PayslipSettings>(`${S}/payslip`),
  updatePayslipSettings: (body: PayslipSettingsUpdate) =>
    apiClient.put<PayslipSettings>(`${S}/payslip`, body),
  uploadPayslipDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.putForm<PayslipSettings>(`${S}/payslip/document`, form);
  },
  deletePayslipDocument: () => apiClient.del<PayslipSettings>(`${S}/payslip/document`),
  downloadSampleTemplate: () => downloadFile(`${S}/payslip/document/sample`),
  // Smart mapping wizard: scan an existing template, then apply the mapping.
  scanPayslipDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.postForm<PayslipDocScan>(`${S}/payslip/document/scan`, form);
  },
  getPayslipMapping: () => apiClient.get<PayslipDocScan>(`${S}/payslip/document/mapping`),
  applyPayslipMapping: (mapping: Record<string, string>) =>
    apiClient.put<PayslipSettings>(`${S}/payslip/document/mapping`, { mapping }),
  getStatutoryConfig: () => apiClient.get<StatutoryConfig>(`${S}/statutory`),
  updateStatutoryConfig: (body: StatutoryConfigUpdate) =>
    apiClient.put<StatutoryConfig>(`${S}/statutory`, body),
};

// --- Taxes & Forms ---------------------------------------------------------
const T = "/api/v1/enterprise/taxes";

export type TaxRegime = "OLD" | "NEW";

export interface TaxProfile {
  id: string;
  company_id: string;
  employee_id: string;
  financial_year: string;
  tax_regime: TaxRegime;
  declared_80c: number | string;
  declared_80d: number | string;
  declared_hra_rent: number | string;
  declared_home_loan_interest: number | string;
  declared_other: number | string;
  prev_employer_income: number | string;
  prev_employer_tds: number | string;
  created_at: string;
  updated_at: string;
}

export interface TaxProfileUpsert {
  financial_year?: string;
  tax_regime: TaxRegime;
  declared_80c: number;
  declared_80d: number;
  declared_hra_rent: number;
  declared_home_loan_interest: number;
  declared_other: number;
  prev_employer_income: number;
  prev_employer_tds: number;
}

export interface TdsChallan {
  id: string;
  company_id: string;
  financial_year: string;
  period_month: string;
  amount: number | string;
  challan_number: string;
  bsr_code: string | null;
  deposit_date: string;
  interest: number | string;
  penalty: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallanCreate {
  financial_year?: string;
  period_month: string;
  amount: number;
  challan_number: string;
  bsr_code?: string | null;
  deposit_date: string;
  interest?: number;
  penalty?: number;
  notes?: string | null;
}

export interface TdsLiabilityRow {
  period_month: string;
  tds_deducted: number | string;
  tds_deposited: number | string;
  difference: number | string;
}

export const taxesApi = {
  listProfiles: () => apiClient.get<TaxProfile[]>(`${T}/profiles`),
  upsertProfile: (employeeId: string, body: TaxProfileUpsert) =>
    apiClient.put<TaxProfile>(`${T}/profiles/${employeeId}`, body),
  listChallans: () => apiClient.get<TdsChallan[]>(`${T}/challans`),
  createChallan: (body: ChallanCreate) => apiClient.post<TdsChallan>(`${T}/challans`, body),
  deleteChallan: (id: string) => apiClient.del<TdsChallan>(`${T}/challans/${id}`),
  tdsLiabilities: () => apiClient.get<TdsLiabilityRow[]>(`${T}/tds-liabilities`),
};

// --- Audit / activity ------------------------------------------------------
const AU = "/api/v1/enterprise/audit";

export interface AuditEntry {
  id: string;
  company_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  method: string;
  path: string;
  status_code: number;
  created_at: string;
}

export const auditApi = {
  list: (limit = 100) => apiClient.get<AuditEntry[]>(`${AU}?limit=${limit}`),
};

// --- Auth ------------------------------------------------------------------
const A = "/api/v1/auth";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface SignupPayload {
  company_name: string;
  full_name: string;
  email: string;
  password: string;
}

export type UserRole = "ADMIN" | "HR" | "VIEWER";

export interface NewUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>(`${A}/login`, { email, password }),
  signup: (body: SignupPayload) => apiClient.post<LoginResponse>(`${A}/signup`, body),
  me: () => apiClient.get<AuthUser>(`${A}/me`),
  logout: () => apiClient.post<{ message: string }>(`${A}/logout`),
  // Org user administration (ADMIN only).
  listUsers: () => apiClient.get<AuthUser[]>(`${A}/users`),
  createUser: (body: NewUserPayload) => apiClient.post<AuthUser>(`${A}/users`, body),
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

/** Draft sent to the server-side preview endpoint (no persistence). */
export interface StructurePreviewIn {
  employee_id?: string | null;
  ctc?: number;
  pay_frequency?: PayFrequency;
  components: MoneyLine[];
  default_deductions: MoneyLine[];
  lop_days: number;
  pf_enabled: boolean;
  pf_cap_at_ceiling: boolean;
  pf_wage_codes?: string[] | null;
  esi_enabled: boolean;
  pt_enabled: boolean;
  tds_enabled: boolean;
}

/** Result of the server-side preview — the exact engine a run uses. */
export interface StructurePreviewOut {
  gross_earnings: number | string;
  total_deductions: number | string;
  net_pay: number | string;
  earnings: ResolvedLine[];
  deductions: ResolvedLine[];
  employer_contributions: ResolvedLine[];
  employer_total: number | string;
  statutory: Record<string, unknown> | null;
}

/** Default working-days basis (mirrors backend DEFAULT_WORKING_DAYS). */
export const WORKING_DAYS = 30;

/** Client-side estimate mirroring the backend compute_payslip, including LOP
 *  proration of earnings (deductions are not pro-rated). */
export function estimateSalary(
  components: MoneyLine[],
  deductions: MoneyLine[],
  lopDays = 0,
  workingDays = WORKING_DAYS,
  ctc = 0,
  payFrequency: PayFrequency = "MONTHLY"
): SalaryEstimate {
  const lop = Math.max(0, Math.min(Number(lopDays) || 0, workingDays));
  const multiplier = lop > 0 ? (workingDays - lop) / workingDays : 1;

  // Per-period CTC lets %-of-CTC and "balance" lines stay CTC-driven (mirrors
  // the backend: monthly = CTC/12, weekly = CTC/52).
  const periodCtc = round2((Number(ctc) || 0) / (payFrequency === "WEEKLY" ? 52 : 12));

  // Pass 1: resolve earnings on the raw (un-prorated) basis. "CTC" is a
  // reference, not an earning; balance lines are deferred to a second pass.
  const rawByCode: Record<string, number> = { [CTC_CODE]: periodCtc };
  let rawGross = 0;
  const rawLines: { code: string; label: string; amount: number }[] = [];
  const balanceLines: MoneyLine[] = [];
  for (const line of components || []) {
    if (!line.code?.trim()) continue;
    if (line.type === "balance") {
      balanceLines.push(line);
      continue;
    }
    const amt = round2(resolveOne(line, rawByCode, rawGross));
    rawByCode[line.code] = amt;
    rawGross = round2(rawGross + amt);
    rawLines.push({ code: line.code, label: line.label || line.code, amount: amt });
  }
  if (balanceLines.length) {
    const remainder = periodCtc - rawGross;
    const share = remainder > 0 ? round2(remainder / balanceLines.length) : 0;
    for (const line of balanceLines) {
      rawByCode[line.code] = share;
      rawGross = round2(rawGross + share);
      rawLines.push({ code: line.code, label: line.label || line.code, amount: share });
    }
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
  const dedRef: Record<string, number> = { [CTC_CODE]: periodCtc, ...byCode };
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
