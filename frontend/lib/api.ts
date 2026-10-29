/**
 * Centralized API client for Sunset Group FastAPI backend.
 */

import {
  AuthTokenResponse,
  CallActivityEntry,
  CallActivityResponse,
  CarryForwardInfo,
  DashboardSummary,
  DailyTarget,
  MeetingActivityEntry,
  MeetingActivityResponse,
  Report,
  SalesCollectionEntry,
  SalesCollectionResponse,
  CommitmentPipelineResponse,
  SystemSetting,
  User,
  UserRole,
  RemindersResponse,
  PerformanceLeaderboardResponse,
  FinancialTrendResponse,
  Notice,
} from "@/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// Token storage in browser (syncs across tabs via localStorage, with sessionStorage fallback)
let memoryToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  memoryToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      sessionStorage.setItem("sunset_access_token", token);
      try {
        localStorage.setItem("sunset_access_token", token);
      } catch {
        // ignore quota/storage restrictions
      }
    } else {
      sessionStorage.removeItem("sunset_access_token");
      try {
        localStorage.removeItem("sunset_access_token");
      } catch {
        // ignore
      }
    }
  }
};

export const getAccessToken = (): string | null => {
  if (memoryToken) return memoryToken;
  if (typeof window !== "undefined") {
    return (
      sessionStorage.getItem("sunset_access_token") ||
      localStorage.getItem("sunset_access_token")
    );
  }
  return null;
};

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include", // For refresh cookie
    });
  } catch (err: unknown) {
    throw new ApiError(0, "Unable to reach the server. Please check your network connection.", err);
  }

  if (response.status === 204) {
    return {} as T;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    if (data && typeof data === "object") {
      const errObj = data as { detail?: unknown; message?: string };
      if (typeof errObj.detail === "string") {
        errorMessage = errObj.detail;
      } else if (Array.isArray(errObj.detail)) {
        // FastAPI validation error list
        errorMessage = errObj.detail
          .map((item: { loc?: string[]; msg?: string }) => {
            const field = item.loc ? item.loc.slice(1).join(".") : "";
            return `${field ? field + ": " : ""}${item.msg}`;
          })
          .join(" | ");
      } else if (errObj.message) {
        errorMessage = errObj.message;
      }
    }
    throw new ApiError(response.status, errorMessage, data);
  }

  return data as T;
}

function normalizeReport(raw: Record<string, unknown>): Report {
  const employeeObj =
    raw.employee && typeof raw.employee === "object"
      ? (raw.employee as Record<string, unknown>)
      : null;

  const resolvedName =
    typeof raw.employee_name === "string" && raw.employee_name.trim()
      ? raw.employee_name.trim()
      : employeeObj && typeof employeeObj.full_name === "string" && employeeObj.full_name.trim()
      ? employeeObj.full_name.trim()
      : employeeObj && typeof employeeObj.username === "string" && employeeObj.username.trim()
      ? employeeObj.username.trim()
      : undefined;

  return {
    id: Number(raw.id),
    employee_id: Number(raw.employee_id),
    report_date: String(raw.report_date),
    is_submitted: raw.status === "submitted" || !!raw.is_submitted,
    status: String(raw.status || "draft"),
    submitted_at: raw.submitted_at ? String(raw.submitted_at) : null,
    created_at: String(raw.created_at || ""),
    updated_at: String(raw.updated_at || ""),
    employee_name: resolvedName,
    notes: typeof raw.notes === "string" ? raw.notes : null,
  };
}

export const api = {
  auth: {
    login: async (username: string, password: string): Promise<AuthTokenResponse> => {
      const res = await request<AuthTokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setAccessToken(res.access_token);
      return res;
    },
    logout: async (): Promise<void> => {
      try {
        await request<void>("/auth/logout", { method: "POST" });
      } finally {
        setAccessToken(null);
      }
    },
    me: async (): Promise<User> => {
      return request<User>("/auth/me");
    },
    refresh: async (): Promise<AuthTokenResponse> => {
      const res = await request<AuthTokenResponse>("/auth/refresh", {
        method: "POST",
      });
      setAccessToken(res.access_token);
      return res;
    },
  },

  reports: {
    list: async (params?: {
      employee_id?: number;
      start_date?: string;
      end_date?: string;
      date_from?: string;
      date_to?: string;
      is_submitted?: boolean;
      status?: string;
      skip?: number;
      limit?: number;
      page?: number;
      page_size?: number;
    }): Promise<Report[]> => {
      const search = new URLSearchParams();
      if (params?.employee_id) search.set("employee_id", String(params.employee_id));
      const from = params?.start_date || params?.date_from;
      if (from) search.set("date_from", from);
      const to = params?.end_date || params?.date_to;
      if (to) search.set("date_to", to);
      if (params?.status) {
        search.set("status", params.status);
      } else if (params?.is_submitted !== undefined) {
        search.set("status", params.is_submitted ? "submitted" : "draft");
      }
      if (params?.page) search.set("page", String(params.page));
      if (params?.page_size) search.set("page_size", String(params.page_size));
      else if (params?.limit) search.set("page_size", String(params.limit));

      const q = search.toString();
      const res = await request<unknown>(`/reports${q ? `?${q}` : ""}`);
      const rawItems: Record<string, unknown>[] = Array.isArray(res)
        ? res
        : res && typeof res === "object" && "items" in res && Array.isArray((res as { items: unknown[] }).items)
        ? ((res as { items: Record<string, unknown>[] }).items)
        : [];

      return rawItems.map((item) => normalizeReport(item));
    },
    getById: async (reportId: number): Promise<Report> => {
      const raw = await request<Record<string, unknown>>(`/reports/${reportId}`);
      return normalizeReport(raw);
    },
    getByDate: async (dateStr: string, employeeId?: number): Promise<Report> => {
      const q = employeeId ? `?employee_id=${employeeId}` : "";
      const raw = await request<Record<string, unknown>>(`/reports/by-date/${dateStr}${q}`);
      return normalizeReport(raw);
    },
    create: async (reportDate: string, employeeId?: number): Promise<Report> => {
      const raw = await request<Record<string, unknown>>("/reports", {
        method: "POST",
        body: JSON.stringify({
          report_date: reportDate,
          ...(employeeId ? { employee_id: employeeId } : {}),
        }),
      });
      return normalizeReport(raw);
    },
    submit: async (reportId: number): Promise<Report> => {
      const raw = await request<Record<string, unknown>>(`/reports/${reportId}/submit`, {
        method: "POST",
      });
      return normalizeReport(raw);
    },
    reopen: async (reportId: number): Promise<Report> => {
      const raw = await request<Record<string, unknown>>(`/reports/${reportId}/reopen`, {
        method: "POST",
      });
      return normalizeReport(raw);
    },
    getSummary: async (reportId: number): Promise<Record<string, unknown>> => {
      const raw = await request<Record<string, unknown>>(`/reports/${reportId}/summary`);
      if (!raw) return {};
      const actualColl = Number(raw.actual_collection_bdt ?? raw.total_actual_collection ?? 0);
      const commitTotal = Number(
        raw.commitments_bdt ??
          (Number(raw.total_sales_commitments || 0) + Number(raw.total_tb_commitments || 0))
      );
      const dialed = Number(raw.total_calls_dialed ?? raw.total_dialed ?? 0);
      const connected = Number(raw.total_calls_connected ?? raw.total_connected ?? 0);
      const meetTime = Number(raw.total_meeting_time_minutes ?? raw.total_meeting_duration_minutes ?? 0);
      return {
        ...raw,
        total_dialed: dialed,
        total_calls_dialed: dialed,
        total_connected: connected,
        total_calls_connected: connected,
        total_meeting_time_minutes: meetTime,
        total_meeting_duration_minutes: meetTime,
        actual_collection_bdt: actualColl,
        total_actual_collection: actualColl,
        commitments_bdt: commitTotal,
        total_sales_commitments: Number(raw.total_sales_commitments || 0),
        total_tb_commitments: Number(raw.total_tb_commitments || 0),
      };
    },
    update: async (
      reportId: number,
      data: { notes?: string | null; status?: string }
    ): Promise<Report> => {
      return request<Report>(`/reports/${reportId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    delete: async (reportId: number): Promise<void> => {
      return request<void>(`/reports/${reportId}`, {
        method: "DELETE",
      });
    },

  },

  calls: {
    get: async (reportId: number): Promise<CallActivityResponse> => {
      const res = await request<any>(`/reports/${reportId}/calls`);
      const rawEntries = Array.isArray(res) ? res : res?.entries || [];
      const entries: CallActivityEntry[] = rawEntries.map((item: any) => ({
        id: item.id,
        lead_category: item.lead_category,
        till_today_status: item.till_today_status ?? null,
        slot_10_to_1: item.slot_10_to_1 ?? item.slot_10am_1pm ?? null,
        slot_2_to_5: item.slot_2_to_5 ?? item.slot_2pm_5pm ?? null,
        slot_5_to_6: item.slot_5_to_6 ?? item.slot_5pm_6pm ?? null,
        total_dialed: item.total_dialed ?? null,
        total_connected: item.total_connected ?? null,
        hp_count: item.hp_count ?? item.lead_status_hp ?? null,
        p_count: item.p_count ?? item.lead_status_p ?? null,
        fub_count: item.fub_count ?? item.lead_status_fub ?? null,
        ni_count: item.ni_count ?? item.lead_status_ni ?? null,
        notes: item.notes ?? null,
      }));
      return {
        report_id: res?.report_id ?? reportId,
        report_date: res?.report_date ?? "",
        is_submitted: !!res?.is_submitted,
        entries,
        totals: res?.totals || ({} as any),
        carry_forward: res?.carry_forward ?? null,
      };
    },
    getCarryForward: async (reportId: number): Promise<CarryForwardInfo> => {
      return request<CarryForwardInfo>(`/reports/${reportId}/calls/carry-forward`);
    },
    upsert: async (
      reportId: number,
      entries: CallActivityEntry[]
    ): Promise<CallActivityResponse> => {
      const payload = entries.map((e: any) => ({
        lead_category: e.lead_category,
        till_today_status: e.till_today_status ?? null,
        slot_10am_1pm: e.slot_10_to_1 ?? e.slot_10am_1pm ?? null,
        slot_2pm_5pm: e.slot_2_to_5 ?? e.slot_2pm_5pm ?? null,
        slot_5pm_6pm: e.slot_5_to_6 ?? e.slot_5pm_6pm ?? null,
        total_dialed: e.total_dialed ?? null,
        total_connected: e.total_connected ?? null,
        lead_status_hp: e.hp_count ?? e.lead_status_hp ?? null,
        lead_status_p: e.p_count ?? e.lead_status_p ?? null,
        lead_status_fub: e.fub_count ?? e.lead_status_fub ?? null,
        lead_status_ni: e.ni_count ?? e.lead_status_ni ?? null,
        notes: e.notes ?? null,
      }));
      return request<CallActivityResponse>(`/reports/${reportId}/calls`, {
        method: "PUT",
        body: JSON.stringify({ entries: payload }),
      });
    },
  },

  meetings: {
    get: async (reportId: number): Promise<MeetingActivityResponse> => {
      const res = await request<any>(`/reports/${reportId}/meetings`);
      const rawEntries = Array.isArray(res) ? res : res?.entries || [];
      const entries: MeetingActivityEntry[] = rawEntries.map((item: any) => ({
        id: item.id,
        metric_type: item.metric_type ?? item.activity_type,
        till_today: item.till_today ?? item.till_today_value ?? null,
        slot_10_to_1: item.slot_10_to_1 ?? item.slot_10am_1pm ?? null,
        slot_2_to_5: item.slot_2_to_5 ?? item.slot_2pm_5pm ?? null,
        slot_5_to_6: item.slot_5_to_6 ?? item.slot_5pm_6pm ?? null,
        notes: item.notes ?? null,
      }));
      return {
        report_id: res?.report_id ?? reportId,
        report_date: res?.report_date ?? "",
        is_submitted: !!res?.is_submitted,
        entries,
        totals: res?.totals || ({} as any),
      };
    },
    upsert: async (
      reportId: number,
      entries: MeetingActivityEntry[]
    ): Promise<MeetingActivityResponse> => {
      const payload = entries.map((m: any) => ({
        activity_type: m.metric_type ?? m.activity_type,
        till_today_value: m.till_today ?? m.till_today_value ?? null,
        slot_10am_1pm: m.slot_10_to_1 ?? m.slot_10am_1pm ?? null,
        slot_2pm_5pm: m.slot_2_to_5 ?? m.slot_2pm_5pm ?? null,
        slot_5pm_6pm: m.slot_5_to_6 ?? m.slot_5pm_6pm ?? null,
        notes: m.notes ?? null,
      }));
      return request<MeetingActivityResponse>(`/reports/${reportId}/meetings`, {
        method: "PUT",
        body: JSON.stringify({ entries: payload }),
      });
    },
  },

  sales: {
    get: async (reportId: number): Promise<SalesCollectionResponse> => {
      return request<SalesCollectionResponse>(`/reports/${reportId}/sales-collections`);
    },
    create: async (
      reportId: number,
      entry: Omit<SalesCollectionEntry, "id" | "report_id">
    ): Promise<SalesCollectionEntry> => {
      return request<SalesCollectionEntry>(`/reports/${reportId}/sales-collections`, {
        method: "POST",
        body: JSON.stringify(entry),
      });
    },
    update: async (
      reportId: number,
      entryId: number,
      entry: Partial<SalesCollectionEntry> & { reschedule_reason?: string }
    ): Promise<SalesCollectionEntry> => {
      return request<SalesCollectionEntry>(
        `/reports/${reportId}/sales-collections/${entryId}`,
        {
          method: "PUT",
          body: JSON.stringify(entry),
        }
      );
    },
    delete: async (reportId: number, entryId: number): Promise<void> => {
      return request<void>(`/reports/${reportId}/sales-collections/${entryId}`, {
        method: "DELETE",
      });
    },
    getCommitmentsPipeline: async (params?: {
      employee_id?: number;
      date_from?: string;
      date_to?: string;
    }): Promise<CommitmentPipelineResponse> => {
      const search = new URLSearchParams();
      if (params?.employee_id) search.set("employee_id", String(params.employee_id));
      if (params?.date_from) search.set("date_from", params.date_from);
      if (params?.date_to) search.set("date_to", params.date_to);
      const q = search.toString();
      return request<CommitmentPipelineResponse>(`/sales-collections/commitments/pipeline${q ? `?${q}` : ""}`);
    },
  },

  dashboard: {
    getSummary: async (params?: {
      start_date?: string;
      end_date?: string;
      employee_id?: number;
    }): Promise<DashboardSummary> => {
      const search = new URLSearchParams();
      if (params?.start_date) {
        search.set("start_date", params.start_date);
        search.set("date_from", params.start_date);
      }
      if (params?.end_date) {
        search.set("end_date", params.end_date);
        search.set("date_to", params.end_date);
      }
      if (params?.employee_id) search.set("employee_id", String(params.employee_id));

      const q = search.toString();
      const raw = await request<any>(`/dashboard/summary${q ? `?${q}` : ""}`);
      return {
        period_start: raw.period_start || raw.date_from || "",
        period_end: raw.period_end || raw.date_to || "",
        total_reports: raw.total_reports ?? raw.report_count ?? 0,
        submitted_reports: raw.submitted_reports ?? 0,
        total_calls_dialed: raw.total_calls_dialed ?? raw.total_dialed ?? 0,
        total_calls_connected: raw.total_calls_connected ?? raw.total_connected ?? 0,
        connection_rate_pct: raw.connection_rate_pct !== undefined && raw.connection_rate_pct !== null ? Number(raw.connection_rate_pct) : null,
        total_call_duration_minutes: raw.total_call_duration_minutes ?? 0,
        total_meeting_time_minutes: raw.total_meeting_time_minutes ?? raw.total_meeting_duration_minutes ?? 0,
        total_outdoor_visits: raw.total_outdoor_visits ?? 0,
        total_indoor_cx: raw.total_indoor_cx ?? 0,
        actual_collection_bdt: Number(raw.actual_collection_bdt ?? raw.total_actual_collection ?? 0),
        commitments_bdt: Number(raw.commitments_bdt ?? (Number(raw.total_sales_commitments || 0) + Number(raw.total_tb_commitments || 0))),
        tb_collection_bdt: Number(raw.tb_collection_bdt ?? raw.total_tb_collection ?? 0),
        tb_commitments_bdt: Number(raw.tb_commitments_bdt ?? raw.total_tb_commitments ?? 0),
        emi_collection_bdt: Number(raw.emi_collection_bdt ?? raw.total_emi_collection ?? 0),
        by_category: raw.by_category || {},
        by_slot: raw.by_slot || {},
      };
    },
    getEmployeeSummary: async (
      employeeId: number,
      params?: { start_date?: string; end_date?: string }
    ): Promise<DashboardSummary> => {
      const search = new URLSearchParams();
      if (params?.start_date) {
        search.set("start_date", params.start_date);
        search.set("date_from", params.start_date);
      }
      if (params?.end_date) {
        search.set("end_date", params.end_date);
        search.set("date_to", params.end_date);
      }
      const q = search.toString();
      return request<DashboardSummary>(
        `/dashboard/employee/${employeeId}${q ? `?${q}` : ""}`
      );
    },
    getLeaderboard: async (params?: {
      start_date?: string;
      end_date?: string;
      employee_id?: number;
    }): Promise<PerformanceLeaderboardResponse> => {
      const search = new URLSearchParams();
      if (params?.start_date) {
        search.set("start_date", params.start_date);
        search.set("date_from", params.start_date);
      }
      if (params?.end_date) {
        search.set("end_date", params.end_date);
        search.set("date_to", params.end_date);
      }
      if (params?.employee_id) search.set("employee_id", String(params.employee_id));
      const q = search.toString();
      return request<PerformanceLeaderboardResponse>(
        `/dashboard/performance-leaderboard${q ? `?${q}` : ""}`
      );
    },
    getFinancialTrend: async (params?: {
      start_date?: string;
      end_date?: string;
      employee_id?: number;
    }): Promise<FinancialTrendResponse> => {
      const search = new URLSearchParams();
      if (params?.start_date) {
        search.set("start_date", params.start_date);
        search.set("date_from", params.start_date);
      }
      if (params?.end_date) {
        search.set("end_date", params.end_date);
        search.set("date_to", params.end_date);
      }
      if (params?.employee_id) search.set("employee_id", String(params.employee_id));
      const q = search.toString();
      return request<FinancialTrendResponse>(
        `/dashboard/financial-trend${q ? `?${q}` : ""}`
      );
    },
  },

  employees: {
    list: async (params?: {
      skip?: number;
      limit?: number;
      role?: string;
      is_active?: boolean;
      search?: string;
    }): Promise<User[]> => {
      const search = new URLSearchParams();
      if (params?.skip !== undefined) search.set("skip", String(params.skip));
      if (params?.limit !== undefined) search.set("limit", String(params.limit));
      if (params?.role) search.set("role", params.role);
      if (params?.is_active !== undefined) search.set("is_active", String(params.is_active));
      if (params?.search) search.set("search", params.search);

      const q = search.toString();
      return request<User[]>(`/employees${q ? `?${q}` : ""}`);
    },
    get: async (userId: number): Promise<User> => {
      return request<User>(`/employees/${userId}`);
    },
    create: async (data: {
      id?: number;
      full_name: string;
      email: string;
      phone?: string | null;
      username: string;
      password: string;
      role: UserRole;
    }): Promise<User> => {
      return request<User>("/employees", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    update: async (
      userId: number,
      data: Partial<{
        id?: number;
        full_name: string;
        email: string;
        phone?: string | null;
        role: UserRole;
        is_active: boolean;
        password?: string;
      }>
    ): Promise<User> => {
      return request<User>(`/employees/${userId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    delete: async (userId: number): Promise<void> => {
      return request<void>(`/employees/${userId}`, {
        method: "DELETE",
      });
    },
  },

  settings: {
    getTargets: async (params?: {
      target_date?: string;
      employee_id?: number;
    }): Promise<DailyTarget[]> => {
      const search = new URLSearchParams();
      if (params?.target_date) search.set("target_date", params.target_date);
      if (params?.employee_id) search.set("employee_id", String(params.employee_id));
      const q = search.toString();
      const res = await request<unknown>(`/targets${q ? `?${q}` : ""}`);
      return Array.isArray(res) ? (res as DailyTarget[]) : [];
    },
    createTarget: async (data: Partial<DailyTarget>): Promise<DailyTarget> => {
      return request<DailyTarget>("/targets", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    updateTarget: async (
      targetId: number,
      data: Partial<DailyTarget>
    ): Promise<DailyTarget> => {
      return request<DailyTarget>(`/targets/${targetId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    deleteTarget: async (targetId: number): Promise<void> => {
      return request<void>(`/targets/${targetId}`, {
        method: "DELETE",
      });
    },
    getSystemSettings: async (namespace?: string): Promise<SystemSetting[]> => {
      const q = namespace ? `?namespace=${encodeURIComponent(namespace)}` : "";
      return request<SystemSetting[]>(`/settings/system${q}`);
    },
    updateSystemSetting: async (data: {
      namespace: string;
      key: string;
      value: string;
      description?: string;
    }): Promise<SystemSetting> => {
      return request<SystemSetting>("/settings/system", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
  },
  reminders: {
    get: async (employeeId?: number): Promise<RemindersResponse> => {
      const q = employeeId ? `?employee_id=${employeeId}` : "";
      return request<RemindersResponse>(`/reminders${q}`);
    },
  },
  notices: {
    list: async (params?: { status?: string; notice_type?: string }): Promise<Notice[]> => {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.notice_type) search.set("notice_type", params.notice_type);
      const q = search.toString();
      return request<Notice[]>(`/notices${q ? `?${q}` : ""}`);
    },
    get: async (noticeId: number): Promise<Notice> => {
      return request<Notice>(`/notices/${noticeId}`);
    },
    createText: async (data: {
      title: string;
      content: string;
      priority?: string;
    }): Promise<Notice> => {
      return request<Notice>("/notices/text", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    createPdf: async (formData: FormData): Promise<Notice> => {
      return request<Notice>("/notices/pdf", {
        method: "POST",
        body: formData,
      });
    },
    review: async (
      noticeId: number,
      data: { status: "published" | "rejected"; approval_note?: string }
    ): Promise<Notice> => {
      return request<Notice>(`/notices/${noticeId}/review`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    delete: async (noticeId: number): Promise<void> => {
      return request<void>(`/notices/${noticeId}`, {
        method: "DELETE",
      });
    },
  },
};

export { ApiError };
