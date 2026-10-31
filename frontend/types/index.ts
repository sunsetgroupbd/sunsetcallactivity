/**
 * TypeScript definitions for Sunset Group Daily Call Activity Dashboard
 * Aligned with FastAPI backend schemas.
 */

export type UserRole = "admin" | "sub_admin" | "tl" | "co" | "employee";

export interface User {
  id: number;
  email: string;
  phone?: string | null;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
}

export interface Report {
  id: number;
  employee_id: number;
  report_date: string; // YYYY-MM-DD
  is_submitted: boolean;
  status?: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  notes?: string | null;
}


export type TimeSlot = "10_to_1" | "2_to_5" | "5_to_6";

export type LeadCategory =
  | "high_potential"
  | "potential"
  | "facebook"
  | "fair_leads"
  | "follow_up"
  | "other_not_reached"
  | "new_cold_leads";

export const LEAD_CATEGORIES: { key: LeadCategory; label: string }[] = [
  { key: "high_potential", label: "High Potential" },
  { key: "potential", label: "Potential" },
  { key: "facebook", label: "Facebook" },
  { key: "fair_leads", label: "Fair Leads" },
  { key: "follow_up", label: "Follow Up" },
  { key: "other_not_reached", label: "Other & Not Reached" },
  { key: "new_cold_leads", label: "New Cold Leads" },
];

export interface CallActivityEntry {
  id?: number;
  lead_category: LeadCategory;
  till_today_status: number | null;
  slot_10_to_1: number | null;
  slot_2_to_5: number | null;
  slot_5_to_6: number | null;
  total_dialed?: number | null;
  total_connected?: number | null;
  hp_count: number | null;
  p_count: number | null;
  fub_count: number | null;
  ni_count: number | null;
  notes?: string | null;
}

export interface ClientContactEntry {
  id?: string;
  client_name: string;
  phone_number?: string;
  category: "HP" | "P" | "FUB" | "NI" | "CX" | "Other";
  follow_up_date?: string;
  discussion_notes?: string;
}

export interface CallSlotTotals {


  total_dialed_10_to_1: number;
  total_dialed_2_to_5: number;
  total_dialed_5_to_6: number;
  total_dialed: number;
  total_connected: number;
  total_duration_minutes: number;
  total_hp: number;
  total_p: number;
  total_fub: number;
  total_ni: number;
}

export interface CategoryCarryForward {
  lead_category: string;
  prev_till_today: number;
  prev_hp: number;
  prev_p: number;
  prev_fub: number;
  prev_ni: number;
}

export interface CarryForwardInfo {
  employee_id: number;
  employee_name: string | null;
  previous_report_date: string | null;
  categories: Record<string, CategoryCarryForward>;
}

export interface CallActivityResponse {
  report_id: number;
  report_date: string;
  is_submitted: boolean;
  entries: CallActivityEntry[];
  totals: CallSlotTotals;
  carry_forward?: CarryForwardInfo | null;
}

export type MeetingMetricType =
  | "outdoor_visit_count"
  | "outdoor_time_minutes"
  | "indoor_cx_count"
  | "indoor_cx_time_minutes"
  | "mg_time_minutes"
  | "team_meeting_time_minutes";

export const MEETING_METRICS: {
  key: MeetingMetricType;
  label: string;
  unit: "count" | "minutes";
}[] = [
  { key: "outdoor_visit_count", label: "Number of Outdoor Visit", unit: "count" },
  { key: "outdoor_time_minutes", label: "Outdoor Time", unit: "minutes" },
  { key: "indoor_cx_count", label: "No. of Indoor CX", unit: "count" },
  { key: "indoor_cx_time_minutes", label: "Indoor Time with CX", unit: "minutes" },
  { key: "mg_time_minutes", label: "MG Time", unit: "minutes" },
  { key: "team_meeting_time_minutes", label: "Team Meeting Time", unit: "minutes" },
];

export interface MeetingActivityEntry {
  id?: number;
  metric_type: MeetingMetricType;
  till_today: number | null;
  slot_10_to_1: number | null;
  slot_2_to_5: number | null;
  slot_5_to_6: number | null;
  notes?: string | null;
}

export interface MeetingTotals {
  total_outdoor_visits: number;
  total_indoor_cx: number;
  total_meeting_minutes: number;
  formatted_duration: string;
}

export interface MeetingActivityResponse {
  report_id: number;
  report_date: string;
  is_submitted: boolean;
  entries: MeetingActivityEntry[];
  totals: MeetingTotals;
}

export type SalesCollectionCategory =
  | "new_sales_collection"
  | "new_sales_commit_payment_1"
  | "new_sales_commit_payment_2"
  | "new_sales_commit_payment_3"
  | "tb_collection"
  | "tb_commit_payment_1"
  | "tb_commit_payment_2"
  | "tb_commit_payment_3"
  | "emi_collection"
  | "emi_commit_payment_1"
  | "emi_commit_payment_2"
  | "emi_commit_payment_3"
  | "other_collection";

export const SALES_CATEGORIES: {
  key: SalesCollectionCategory;
  label: string;
  isCollection: boolean;
  group: "sales" | "tb" | "emi" | "other";
}[] = [
  { key: "new_sales_collection", label: "New Sales Collection", isCollection: true, group: "sales" },
  { key: "new_sales_commit_payment_1", label: "CX New Sales Commit Payment 1", isCollection: false, group: "sales" },
  { key: "new_sales_commit_payment_2", label: "New Sales Commit Payment 2", isCollection: false, group: "sales" },
  { key: "new_sales_commit_payment_3", label: "New Sales Commit Payment 3", isCollection: false, group: "sales" },
  { key: "tb_collection", label: "TB Collection", isCollection: true, group: "tb" },
  { key: "tb_commit_payment_1", label: "TB CX Commit Payment 1", isCollection: false, group: "tb" },
  { key: "tb_commit_payment_2", label: "TB CX Commit Payment 2", isCollection: false, group: "tb" },
  { key: "tb_commit_payment_3", label: "TB CX Commit Payment 3", isCollection: false, group: "tb" },
  { key: "emi_collection", label: "EMI Collection", isCollection: true, group: "emi" },
  { key: "emi_commit_payment_1", label: "EMI CX Commit Payment 1", isCollection: false, group: "emi" },
  { key: "emi_commit_payment_2", label: "EMI CX Commit Payment 2", isCollection: false, group: "emi" },
  { key: "emi_commit_payment_3", label: "EMI CX Commit Payment 3", isCollection: false, group: "emi" },
  { key: "other_collection", label: "Other Collection", isCollection: true, group: "other" },
];

export const PAYMENT_METHODS = [

  { key: "cash", label: "Cash" },
  { key: "cheque", label: "Cheque" },
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "rocket", label: "Rocket" },
  { key: "bank_transfer", label: "Bank Transfer (Online / BEFTN)" },
  { key: "pos", label: "POS / Card Payment" },
  { key: "other", label: "Other" },
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]["key"];

export interface RescheduleHistoryItem {
  old_date: string | null;
  new_date: string;
  reason: string;
  changed_at: string;
  changed_by: string;
}

export interface SalesCollectionEntry {
  id: number;
  report_id: number;
  category: SalesCollectionCategory;
  is_collection: boolean;
  amount: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_method?: string | null;
  payment_sequence?: number | null;
  reference?: string | null;
  notes?: string | null;
  expected_payment_date?: string | null;
  commitment_percentage?: number | null;
  reschedule_count?: number;
  reschedule_history?: RescheduleHistoryItem[] | null;
  created_at?: string;
}

export interface CommitmentItem {
  id: number;
  report_id: number;
  report_date: string;
  employee_id: number;
  employee_name?: string | null;
  category: string;
  amount: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  expected_payment_date?: string | null;
  commitment_percentage?: number | null;
  reschedule_count: number;
  reschedule_history?: RescheduleHistoryItem[] | null;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  status: "due_today" | "overdue" | "upcoming" | "no_date";
}

export interface CommitmentPipelineResponse {
  total_promised_amount: number;
  total_commitments: number;
  rescheduled_count: number;
  items: CommitmentItem[];
}

export interface FinancialTotals {
  actual_collection_total: number;
  sales_commitment_total: number;
  tb_collection_total: number;
  tb_commitment_total: number;
  emi_collection_total: number;
  grand_total_collections: number;
  grand_total_commitments: number;
}

export interface SalesCollectionResponse {
  report_id: number;
  report_date: string;
  is_submitted: boolean;
  entries: SalesCollectionEntry[];
  totals: FinancialTotals;
}

export interface DashboardSummary {
  period_start: string;
  period_end: string;
  total_reports: number;
  submitted_reports: number;
  total_calls_dialed: number;
  total_calls_connected: number;
  connection_rate_pct: number | null;
  total_call_duration_minutes: number;
  total_meeting_time_minutes: number;
  total_outdoor_visits: number;
  total_indoor_cx: number;
  actual_collection_bdt: number;
  commitments_bdt: number;
  tb_collection_bdt: number;
  tb_commitments_bdt: number;
  emi_collection_bdt: number;
  new_sales_collection_bdt?: number;
  sales_commitments_bdt?: number;
  total_new_sales?: number;
  by_category: Record<string, { dialed: number; connected: number; duration_min: number }>;
  by_slot: Record<string, { dialed: number }>;
}

export interface DailyTarget {
  id: number;
  employee_id: number | null;
  effective_from?: string | null;
  target_date: string | null;
  dialed_calls_target: number | null;
  connected_calls_target: number | null;
  call_duration_minutes_target?: number | null;
  outdoor_visits_target: number | null;
  outdoor_visit_target?: number | null;
  meeting_minutes_target: number | null;
  meeting_hours_target?: number | null;
  sales_amount_target: number | null;
  sales_target?: number | null;
  collection_amount_target: number | null;
  tb_target?: number | null;
  emi_target?: number | null;
  monthly_sales_target?: number | null;
  monthly_collection_target?: number | null;
  monthly_emi_target?: number | null;
  monthly_dialed_calls_target?: number | null;
  monthly_connected_calls_target?: number | null;
  monthly_outdoor_visits_target?: number | null;
  monthly_meeting_hours_target?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSetting {
  id: number;
  namespace: string;
  key: string;
  value: string;
  description?: string | null;
}

export interface ReminderItem {
  id: string;
  type: "follow_up_today" | "follow_up_overdue" | "report_submission" | "commitment_due" | "slot_nudge" | string;
  severity: "urgent" | "warning" | "info";
  title: string;
  message: string;
  client_name?: string | null;
  phone_number?: string | null;
  category?: string | null;
  date?: string | null;
  link?: string | null;
  action_label?: string | null;
}

export interface ReminderSummary {
  total_count: number;
  follow_ups_today_count: number;
  overdue_count: number;
  unsubmitted_report: boolean;
  slot_nudge?: string | null;
}

export interface RemindersResponse {
  summary: ReminderSummary;
  reminders: ReminderItem[];
}

export interface EmployeeLeaderboardItem {
  rank: number;
  employee_id: number;
  employee_name: string;
  username: string;
  reports_count: number;
  dialed_calls: number;
  dialed_target: number;
  dialed_pct: number;
  connected_calls: number;
  connected_target: number;
  connected_pct: number;
  outdoor_visits: number;
  outdoor_target: number;
  outdoor_pct: number;
  meeting_minutes: number;
  actual_collections: number;
  collection_target: number;
  collection_pct: number;
  overall_score_pct: number;
  status: "achieved" | "on_track" | "needs_attention" | "behind_pace";
  base_collection_target?: number;
  carry_forward_deficit?: number;
  monthly_collection_target?: number;
  month_to_date_collected?: number;
}

export interface KPIChampion {
  title: string;
  metric: string;
  employee_name: string;
  value: string;
}

export interface PerformanceLeaderboardResponse {
  period_start: string;
  period_end: string;
  team_overall_score_pct: number;
  champions: KPIChampion[];
  rankings: EmployeeLeaderboardItem[];
}

export type NoticeType = "text" | "pdf";
export type NoticeStatus = "published" | "pending_approval" | "rejected";
export type NoticePriority = "normal" | "important" | "urgent";

export interface Notice {
  id: number;
  title: string;
  notice_type: NoticeType;
  content?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  status: NoticeStatus;
  priority: NoticePriority;
  created_by_id?: number | null;
  created_by_name?: string | null;
  approved_by_id?: number | null;
  approved_by_name?: string | null;
  approval_note?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyTrendPoint {
  date: string;
  label: string;
  actual_collection_bdt: number;
  new_sales_collection_bdt: number;
  emi_collection_bdt: number;
  commitments_bdt: number;
  cumulative_collection_bdt: number;
  cumulative_commitments_bdt: number;
}

export interface FinancialTrendResponse {
  period_start: string;
  period_end: string;
  total_actual_collection_bdt: number;
  total_commitments_bdt: number;
  total_new_sales_collection_bdt: number;
  total_emi_collection_bdt: number;
  monthly_target_bdt: number;
  month_to_date_collected_bdt: number;
  monthly_pace_pct: number;
  expected_pace_pct: number;
  pace_status: "ahead_of_pace" | "on_pace" | "behind_pace";
  days_in_month: number;
  days_elapsed: number;
  days_remaining: number;
  daily_current_run_rate_bdt: number;
  daily_run_rate_needed_bdt: number;
  projected_month_end_bdt: number;
  projected_achievement_pct: number;
  trend: DailyTrendPoint[];
}



