const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1/payroll";

export interface SalaryStructure {
  id: number;
  employee_id: number;
  company_id: number;
  ctc: number;
  currency: string;
  pay_frequency: string;
  effective_from: string;
  components: Record<string, { type: string; value: number | string }>;
  default_deductions: Record<string, { type: string; value: number | string }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PayrollCycle {
  id: number;
  company_id: number;
  name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  notes: string;
  status: 'DRAFT' | 'PROCESSING' | 'APPROVED' | 'PAID';
  totals: {
    gross_earnings?: number;
    total_deductions?: number;
    net_pay?: number;
  };
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payslip {
  id: number;
  company_id: number;
  cycle_id: number;
  employee_id: number;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  lop_days: number;
  paid_days: number;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  currency: string;
  status: 'PENDING' | 'PAID';
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

// Minimal mocked or fetched users list since the boilerplate has John and Jane in the seed
export const MOCK_EMPLOYEES: Employee[] = [
  { id: 1, username: "john_doe", email: "john@example.com", first_name: "John", last_name: "Doe" },
  { id: 2, username: "jane_doe", email: "jane@example.com", first_name: "Jane", last_name: "Doe" }
];

/**
 * Client-side estimate of a monthly payslip, mirroring the backend
 * `compute_payslip` logic for a full month (no LOP proration).
 * Used to preview gross / net before a salary structure is saved.
 */
export interface SalaryEstimate {
  gross: number;
  totalDeductions: number;
  net: number;
  earnings: Record<string, number>;
  deductionAmounts: Record<string, number>;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function estimateSalary(
  ctc: number,
  components: Record<string, { type: string; value: number | string }>,
  deductions: Record<string, { type: string; value: number | string }>
): SalaryEstimate {
  const monthly = (Number(ctc) || 0) / 12;

  const earnings: Record<string, number> = {};
  let gross = 0;
  for (const [name, c] of Object.entries(components)) {
    const v = Number(c.value) || 0;
    const amt = c.type === "percentage" ? (v / 100) * monthly : v;
    const r = round2(amt);
    earnings[name] = r;
    gross += r;
  }
  gross = round2(gross);

  const deductionAmounts: Record<string, number> = {};
  let totalDeductions = 0;
  for (const [name, d] of Object.entries(deductions)) {
    const v = Number(d.value) || 0;
    const amt = d.type === "percentage" ? (v / 100) * gross : v;
    const r = round2(amt);
    deductionAmounts[name] = r;
    totalDeductions += r;
  }
  totalDeductions = round2(totalDeductions);

  return { gross, totalDeductions, net: round2(gross - totalDeductions), earnings, deductionAmounts };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    try {
      const errBody = await response.json();
      errorMsg = errBody.detail || errBody.message || errorMsg;
    } catch {
      // ignore parsing error
    }
    throw new Error(errorMsg);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return response.json();
}

export const api = {
  // --- Salary Structures ---
  async getStructures(): Promise<SalaryStructure[]> {
    const res = await fetch(`${API_BASE_URL}/structures`);
    return handleResponse<SalaryStructure[]>(res);
  },

  async getStructure(id: number): Promise<SalaryStructure> {
    const res = await fetch(`${API_BASE_URL}/structures/${id}`);
    return handleResponse<SalaryStructure>(res);
  },

  async createStructure(data: Partial<SalaryStructure>): Promise<SalaryStructure> {
    const res = await fetch(`${API_BASE_URL}/structures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<SalaryStructure>(res);
  },

  async updateStructure(id: number, data: Partial<SalaryStructure>): Promise<SalaryStructure> {
    const res = await fetch(`${API_BASE_URL}/structures/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<SalaryStructure>(res);
  },

  async deleteStructure(id: number): Promise<SalaryStructure> {
    const res = await fetch(`${API_BASE_URL}/structures/${id}`, {
      method: "DELETE",
    });
    return handleResponse<SalaryStructure>(res);
  },

  // --- Payroll Cycles ---
  async getCycles(): Promise<PayrollCycle[]> {
    const res = await fetch(`${API_BASE_URL}/cycles`);
    return handleResponse<PayrollCycle[]>(res);
  },

  async getCycle(id: number): Promise<PayrollCycle> {
    const res = await fetch(`${API_BASE_URL}/cycles/${id}`);
    return handleResponse<PayrollCycle>(res);
  },

  async createCycle(data: Partial<PayrollCycle>): Promise<PayrollCycle> {
    const res = await fetch(`${API_BASE_URL}/cycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<PayrollCycle>(res);
  },

  async deleteCycle(id: number): Promise<PayrollCycle> {
    const res = await fetch(`${API_BASE_URL}/cycles/${id}`, {
      method: "DELETE",
    });
    return handleResponse<PayrollCycle>(res);
  },

  async runCycle(id: number): Promise<{ created: number; updated: number; skipped: any[] }> {
    const res = await fetch(`${API_BASE_URL}/cycles/${id}/run`, {
      method: "POST",
    });
    return handleResponse(res);
  },

  async approveCycle(id: number): Promise<PayrollCycle> {
    const res = await fetch(`${API_BASE_URL}/cycles/${id}/approve`, {
      method: "POST",
    });
    return handleResponse<PayrollCycle>(res);
  },

  async markPaidCycle(id: number): Promise<PayrollCycle> {
    const res = await fetch(`${API_BASE_URL}/cycles/${id}/mark-paid`, {
      method: "POST",
    });
    return handleResponse<PayrollCycle>(res);
  },

  // --- Payslips ---
  async getCyclePayslips(cycleId: number): Promise<Payslip[]> {
    const res = await fetch(`${API_BASE_URL}/cycles/${cycleId}/payslips`);
    return handleResponse<Payslip[]>(res);
  },

  async getPayslip(id: number): Promise<Payslip> {
    const res = await fetch(`${API_BASE_URL}/payslips/${id}`);
    return handleResponse<Payslip>(res);
  },

  // --- Employees (Users) ---
  async getEmployees(): Promise<Employee[]> {
    const root = API_BASE_URL.replace("/payroll", "");
    const res = await fetch(`${root}/employees`);
    return handleResponse<Employee[]>(res);
  },

  async createEmployee(data: Partial<Employee> & { password?: string }): Promise<Employee> {
    const root = API_BASE_URL.replace("/payroll", "");
    const res = await fetch(`${root}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<Employee>(res);
  },
};
