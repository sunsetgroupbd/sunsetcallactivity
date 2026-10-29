"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import {
  PhoneCall,
  PhoneForwarded,
  Clock,
  Users,
  MapPin,
  TrendingUp,
  Banknote,
  Target,
  ArrowRight,
  Filter,
  RotateCcw,
  AlertCircle,
  Bell,
  Phone,
  ChevronRight,
  Printer,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { KPILeaderboard } from "@/components/dashboard/kpi-leaderboard";
import { FinancialCharts } from "@/components/dashboard/financial-charts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatCard,
  Badge,
  Button,
  Skeleton,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { DashboardSummary, User, Report, ReminderItem, ReminderSummary } from "@/types";
import {
  cn,
  formatBDT,
  formatMinutes,
  getDhakaToday,
  getDhakaDateOffset,
  formatReadableDate,
  formatEmployeeId,
} from "@/lib/utils";

function DashboardContent() {
  const { user, isAdmin, isTL } = useAuth();

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "all">("all");
  const [datePreset, setDatePreset] = useState<"today" | "week" | "month" | "30days" | "year" | "custom">("today");

  useEffect(() => {
    const today = getDhakaToday();
    setStartDate(today);
    setEndDate(today);
  }, []);

  // State
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [reminderSummary, setReminderSummary] = useState<ReminderSummary | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch admin employee list
  useEffect(() => {
    if (isAdmin) {
      api.employees
        .list({ is_active: true })
        .then((data) => setEmployees(data))
        .catch(() => {});
    }
  }, [isAdmin]);

  const loadDashboardData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const empIdParam =
        selectedEmployeeId !== "all" ? Number(selectedEmployeeId) : undefined;

      const [summaryData, reportsData, remindersRes] = await Promise.all([
        api.dashboard.getSummary({
          start_date: startDate,
          end_date: endDate,
          employee_id: empIdParam,
        }),
        api.reports.list({
          start_date: startDate,
          end_date: endDate,
          employee_id: empIdParam,
          limit: 10,
        }),
        api.reminders.get(empIdParam).catch(() => null),
      ]);

      setSummary(summaryData);
      setRecentReports(Array.isArray(reportsData) ? reportsData : []);
      if (remindersRes) {
        setReminders(remindersRes.reminders || []);
        setReminderSummary(remindersRes.summary || null);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard data. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedEmployeeId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleResetFilters = () => {
    const today = getDhakaToday();
    setStartDate(today);
    setEndDate(today);
    setSelectedEmployeeId("all");
    setDatePreset("today");
  };

  const handlePresetDate = (preset: "today" | "week" | "month" | "30days" | "year") => {
    setDatePreset(preset);
    const today = getDhakaToday();
    if (preset === "today") {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === "week") {
      setStartDate(getDhakaDateOffset(-7));
      setEndDate(today);
    } else if (preset === "month") {
      setStartDate(`${today.slice(0, 7)}-01`);
      setEndDate(today);
    } else if (preset === "30days") {
      setStartDate(getDhakaDateOffset(-30));
      setEndDate(today);
    } else if (preset === "year") {
      setStartDate(`${today.slice(0, 4)}-01-01`);
      setEndDate(today);
    }
  };

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Overview of daily call activities, customer meetings, and collections"
    >
      <div className="space-y-6">
        {/* ── Today's Reminders Banner (Simple & Compact) ─────────────────── */}
        {reminders.length > 0 && (
          <div className="bg-emerald-900 text-white rounded-lg p-2.5 sm:px-4 sm:py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-xs border border-emerald-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 font-bold text-white shrink-0">
                <Bell className="w-4 h-4 text-emerald-300" />
                Reminders ({reminders.length}):
              </span>

              {reminders.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  href={r.link || "/calls"}
                  className="inline-flex items-center gap-1.5 bg-emerald-800/90 hover:bg-emerald-700 text-emerald-100 hover:text-white px-2.5 py-1 rounded text-xs transition-colors"
                >
                  <span className="font-semibold truncate max-w-[200px]">{r.title}</span>
                  {r.phone_number && (
                    <span className="text-[10px] text-emerald-300 font-mono">({r.phone_number})</span>
                  )}
                  <ChevronRight className="w-3 h-3 text-emerald-300 shrink-0" />
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {reminderSummary?.slot_nudge && (
                <span className="text-[11px] font-medium text-emerald-200 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800">
                  {reminderSummary.slot_nudge}
                </span>
              )}
              <Link
                href="/calls"
                className="text-xs font-semibold text-emerald-200 hover:text-white underline hover:no-underline"
              >
                View all →
              </Link>
            </div>
          </div>
        )}

        {/* ── Filters Section ─────────────────────────────────────────────── */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-3 sm:p-4">
            <div className="space-y-3">
              {/* Top Header: Title & Action Buttons */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center text-green-700">
                    <Filter className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Reporting Filter
                    </h2>
                    <p className="text-[11px] text-slate-500 hidden sm:block">
                      Filter dashboard KPI overview by date range or specific employee
                    </p>
                  </div>
                </div>

                {/* Actions: Reset & Print / PDF */}
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="text-xs flex-1 sm:flex-initial"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Reset
                  </Button>

                  {(isAdmin || isTL) && (
                    <Link
                      href={`/reports/print?start_date=${startDate}&end_date=${endDate}&employee_id=${selectedEmployeeId}&preset=${datePreset}`}
                      target="_blank"
                      className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex-1 sm:flex-initial text-center whitespace-nowrap"
                      title="Print or Save as PDF Executive Performance Report for this period"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1 text-slate-600" />
                      Print / PDF Report
                    </Link>
                  )}
                </div>
              </div>

              {/* Row 2: Structured Controls */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                {/* Quick Date Presets: Smooth horizontal scrollable pill bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                    Quick:
                  </span>
                  {[
                    { id: "today", label: "Today" },
                    { id: "week", label: "This Week" },
                    { id: "month", label: "This Month" },
                    { id: "30days", label: "30 Days" },
                    { id: "year", label: "This Year" },
                  ].map((p) => {
                    const active = datePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePresetDate(p.id as "today" | "week" | "month" | "30days" | "year")}
                        className={cn(
                          "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0",
                          active
                            ? "bg-green-700 text-white shadow-xs font-bold"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {/* Date range pickers & Employee Selector Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 items-end">
                  {/* From Date */}
                  <div className="flex flex-col gap-1">
                    <label htmlFor="start_date" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      From
                    </label>
                    <input
                      id="start_date"
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setDatePreset("custom");
                      }}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 focus:outline-none bg-white"
                    />
                  </div>

                  {/* To Date */}
                  <div className="flex flex-col gap-1">
                    <label htmlFor="end_date" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      To
                    </label>
                    <input
                      id="end_date"
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setDatePreset("custom");
                      }}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 focus:outline-none bg-white"
                    />
                  </div>

                  {/* Employee Selector (Admin only) */}
                  {isAdmin && (
                    <div className="flex flex-col gap-1 col-span-2 sm:col-span-2 md:col-span-1 lg:col-span-2">
                      <label htmlFor="employee_select" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Employee
                      </label>
                      <select
                        id="employee_select"
                        value={selectedEmployeeId}
                        onChange={(e) =>
                          setSelectedEmployeeId(
                            e.target.value === "all" ? "all" : Number(e.target.value)
                          )
                        }
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 focus:outline-none bg-white truncate"
                      >
                        <option value="all">All Employees</option>
                        {employees.map((emp) => {
                          const roleTag =
                            emp.role === "tl"
                              ? "TL"
                              : emp.role === "co"
                              ? "CO"
                              : emp.role === "admin"
                              ? "Admin"
                              : emp.role === "sub_admin"
                              ? "Sub-Admin"
                              : "Exec";
                          return (
                            <option key={emp.id} value={emp.id}>
                              [{formatEmployeeId(emp.id)}] {emp.full_name} (@{emp.username}) • {roleTag}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* For regular employees: show their employee ID badge */}
                  {!isAdmin && user && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg col-span-2 sm:col-span-2 md:col-span-1">
                      <span className="text-emerald-800 font-medium">Employee ID:</span>
                      <span className="font-mono font-bold text-emerald-950 bg-white border border-emerald-300 px-1.5 py-0.5 rounded shadow-2xs">
                        {formatEmployeeId(user.id)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Error Banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="p-4 rounded-md bg-rose-50 border border-rose-200 flex items-start gap-3 text-sm text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to load dashboard data</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── KPI Summary Cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-7 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </Card>
            ))
          ) : (
            <>
              <StatCard
                title="Calls Dialed"
                value={summary?.total_calls_dialed ?? 0}
                subtitle={`${summary?.total_reports ?? 0} reports in period`}
                icon={<PhoneCall className="w-4 h-4" />}
              />
              <StatCard
                title="Connected Calls"
                value={summary?.total_calls_connected ?? 0}
                subtitle={
                  summary?.connection_rate_pct !== null && summary?.connection_rate_pct !== undefined
                    ? `${summary.connection_rate_pct}% connection rate`
                    : "No dialed calls"
                }
                icon={<PhoneForwarded className="w-4 h-4" />}
                badge={
                  summary?.connection_rate_pct !== null &&
                  summary?.connection_rate_pct !== undefined && (
                    <Badge variant={summary.connection_rate_pct >= 40 ? "success" : "warning"}>
                      {summary.connection_rate_pct}%
                    </Badge>
                  )
                }
              />
              <StatCard
                title="Call Duration"
                value={formatMinutes(summary?.total_call_duration_minutes)}
                subtitle="Total phone engagement"
                icon={<Clock className="w-4 h-4" />}
              />
              <StatCard
                title="Meeting Time"
                value={formatMinutes(summary?.total_meeting_time_minutes)}
                subtitle={`${summary?.total_indoor_cx ?? 0} indoor customers`}
                icon={<Users className="w-4 h-4" />}
              />
              <StatCard
                title="Outdoor Visits"
                value={summary?.total_outdoor_visits ?? 0}
                subtitle="Client on-site visits"
                icon={<MapPin className="w-4 h-4" />}
              />
              <StatCard
                title="Actual Collection"
                value={formatBDT(summary?.actual_collection_bdt)}
                subtitle="Cash & bank collected"
                icon={<Banknote className="w-4 h-4 text-emerald-600" />}
                badge={<Badge variant="success">Actual</Badge>}
              />
              <StatCard
                title="Payment Commitments"
                value={formatBDT(summary?.commitments_bdt)}
                subtitle="Expected future cashflows"
                icon={<TrendingUp className="w-4 h-4 text-green-700" />}
                badge={<Badge variant="warning">Commitment</Badge>}
              />
              <StatCard
                title="Reports Submitted"
                value={`${summary?.submitted_reports ?? 0} / ${summary?.total_reports ?? 0}`}
                subtitle={
                  summary?.total_reports
                    ? `${Math.round(((summary.submitted_reports ?? 0) / summary.total_reports) * 100)}% finalized`
                    : "0% finalized"
                }
                icon={<Target className="w-4 h-4" />}
              />
            </>
          )}
        </div>

        {/* ── Visual Analytics: Monthly Pace & Financial Trend (Admin/Sub-Admin Only) ─── */}
        {isAdmin && (
          <FinancialCharts
            startDate={startDate}
            endDate={endDate}
            employeeId={selectedEmployeeId}
          />
        )}

        {/* ── KPI Targets Achievement & Team Leaderboard ───────────────────── */}
        <KPILeaderboard
          startDate={startDate}
          endDate={endDate}
          employeeId={selectedEmployeeId}
        />

        {/* ── Financial Split & Activity Section ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales vs Collection Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
              <Badge variant="neutral">Period Totals</Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">New Sales Collection</p>
                      <p className="text-[11px] text-slate-500">Immediate down-payment receipts</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatBDT(summary?.new_sales_collection_bdt ?? summary?.total_new_sales ?? 0)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">TB (Token to Booking) Collection</p>
                      <p className="text-[11px] text-slate-500">Booking confirmation payments</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatBDT(summary?.tb_collection_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">EMI Collection</p>
                      <p className="text-[11px] text-slate-500">Recurring customer installments</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatBDT(summary?.emi_collection_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between bg-emerald-50/70 px-2 rounded">
                    <div>
                      <p className="text-xs font-bold text-slate-900">Total Money Collected</p>
                      <p className="text-[10px] text-slate-500">Sum of all actual receipts</p>
                    </div>
                    <span className="text-base font-extrabold text-emerald-700">
                      {formatBDT(summary?.actual_collection_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Payment Commitments</p>
                      <p className="text-[11px] text-slate-500">Promise to pay within next days</p>
                    </div>
                    <span className="text-sm font-bold text-green-800">
                      {formatBDT(summary?.sales_commitments_bdt ?? Math.max(0, (summary?.commitments_bdt ?? 0) - (summary?.tb_commitments_bdt ?? 0)))}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">TB Commitments</p>
                      <p className="text-[11px] text-slate-500">Token-to-Booking upcoming commitments</p>
                    </div>
                    <span className="text-sm font-bold text-green-800">
                      {formatBDT(summary?.tb_commitments_bdt ?? 0)}
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between bg-slate-50 px-2 rounded">
                    <div>
                      <p className="text-xs font-bold text-slate-900">Total Commitments</p>
                      <p className="text-[10px] text-slate-500">Total upcoming promised payments</p>
                    </div>
                    <span className="text-base font-extrabold text-green-900">
                      {formatBDT(summary?.commitments_bdt ?? 0)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Call Activity by Time Slot */}
          <Card>
            <CardHeader>
              <CardTitle>Call Activity by Time Slot</CardTitle>
              <Badge variant="neutral">Operating Hours</Badge>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: "10_to_1", label: "10:00 AM – 01:00 PM", count: summary?.by_slot?.["10_to_1"]?.dialed ?? 0 },
                    { key: "2_to_5", label: "02:00 PM – 05:00 PM", count: summary?.by_slot?.["2_to_5"]?.dialed ?? 0 },
                    { key: "5_to_6", label: "05:00 PM – 06:00 PM", count: summary?.by_slot?.["5_to_6"]?.dialed ?? 0 },
                  ].map((slot) => {
                    const total = summary?.total_calls_dialed || 1;
                    const pct = Math.round((slot.count / total) * 100);
                    return (
                      <div key={slot.key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{slot.label}</span>
                          <span className="font-bold text-slate-900">
                            {slot.count} calls ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-700 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Active Calling Hours: 7 Hours</span>
                    <Link
                      href="/calls"
                      className="text-green-700 hover:text-green-800 font-semibold inline-flex items-center gap-1"
                    >
                      Enter Call Activity <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Recent Daily Reports Table ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Daily Reports</CardTitle>
            <Link
              href="/reports"
              className="text-xs font-semibold text-green-700 hover:text-green-800 flex items-center gap-1"
            >
              View All Reports <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-4 font-semibold">Report Date</th>
                  {isAdmin && <th className="py-2.5 px-4 font-semibold">Employee</th>}
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
                      {isAdmin && <td className="py-3 px-4"><Skeleton className="h-4 w-28" /></td>}
                      <td className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="py-3 px-4 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : !Array.isArray(recentReports) || recentReports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 4 : 3}
                      className="py-8 text-center text-slate-400"
                    >
                      No daily reports found for this selected period.
                    </td>
                  </tr>
                ) : (
                  recentReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {formatReadableDate(report.report_date)}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-slate-600">
                          {report.employee_name || `Employee #${report.employee_id}`}
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <Badge variant={report.is_submitted ? "success" : "warning"}>
                          {report.is_submitted ? "Submitted" : "Draft"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/calls?date=${report.report_date}&employee_id=${report.employee_id}`}
                          className="text-green-700 hover:text-green-800 font-semibold"
                        >
                          Open & Edit →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
