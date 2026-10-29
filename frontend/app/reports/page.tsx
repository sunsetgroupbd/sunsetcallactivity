"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FileSpreadsheet,
  Download,
  Filter,
  RotateCcw,
  ArrowRight,
  AlertCircle,
  Trash2,
  Printer,
  Search,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Skeleton,
  Modal,
  Alert,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { Report, User, MeetingActivityEntry, ClientContactEntry } from "@/types";
import { exportFullReportToCSV } from "@/lib/export-report-csv";
import {
  getDhakaToday,
  getDhakaDateOffset,
  formatReadableDate,
  formatBDT,
  formatMinutes,
  formatEmployeeId,
} from "@/lib/utils";

interface DetailedReportRow extends Report {
  summary?: {
    total_dialed?: number;
    total_calls_dialed?: number;
    total_connected?: number;
    total_calls_connected?: number;
    total_call_duration_minutes?: number;
    total_meeting_duration_minutes?: number;
    total_meeting_time_minutes?: number;
    total_outdoor_visits?: number;
    total_actual_collection?: number;
    actual_collection_bdt?: number;
    commitments_bdt?: number;
    total_sales_commitments?: number;
    total_tb_commitments?: number;
  };
}

type DatePreset = "today" | "week" | "month" | "year" | "30days" | "custom";

function getDatePresetRange(preset: Exclude<DatePreset, "custom">) {
  const today = getDhakaToday();
  const [yearStr, monthStr, dayStr] = today.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (preset === "today") {
    return { start: today, end: today };
  }
  if (preset === "week") {
    // Current week starting Saturday (standard business week in Bangladesh)
    const d = new Date(year, month - 1, day);
    const dayOfWeek = d.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
    const diff = (dayOfWeek + 1) % 7;
    const startD = new Date(year, month - 1, day - diff);
    const startStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(startD.getDate()).padStart(2, "0")}`;
    return { start: startStr, end: today };
  }
  if (preset === "month") {
    const startStr = `${yearStr}-${monthStr}-01`;
    return { start: startStr, end: today };
  }
  if (preset === "year") {
    const startStr = `${yearStr}-01-01`;
    return { start: startStr, end: today };
  }
  return { start: getDhakaDateOffset(-30), end: today };
}

function ReportsContent() {
  const { isAdmin } = useAuth();
  const searchParams = useSearchParams();

  // Read URL query params
  const paramEmpId = searchParams.get("employee_id");
  const paramStartDate = searchParams.get("start_date");
  const paramEndDate = searchParams.get("end_date");
  const paramStatus = searchParams.get("status");

  // Determine initial date preset and range based on URL params
  const initialPreset: DatePreset = useMemo(() => {
    if (paramStartDate && paramEndDate) {
      const today = getDhakaToday();
      if (paramStartDate === today && paramEndDate === today) return "today";
      if (paramStartDate === getDatePresetRange("30days").start && paramEndDate === today) return "30days";
      return "custom";
    }
    return "30days";
  }, [paramStartDate, paramEndDate]);

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>(initialPreset);
  const [startDate, setStartDate] = useState<string>(() => {
    if (paramStartDate) return paramStartDate;
    return getDatePresetRange("30days").start;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    if (paramEndDate) return paramEndDate;
    return getDatePresetRange("30days").end;
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "draft">(() => {
    if (paramStatus === "submitted" || paramStatus === "draft") return paramStatus;
    return "all";
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "all">(() => {
    if (paramEmpId && !isNaN(Number(paramEmpId))) {
      return Number(paramEmpId);
    }
    return "all";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingReportId, setDownloadingReportId] = useState<number | null>(null);

  // Sync state if URL search parameters change while on the page
  useEffect(() => {
    const urlEmpId = searchParams.get("employee_id");
    const urlStart = searchParams.get("start_date");
    const urlEnd = searchParams.get("end_date");
    const urlStatus = searchParams.get("status");

    if (urlEmpId) {
      setSelectedEmployeeId(urlEmpId === "all" ? "all" : Number(urlEmpId));
    }
    if (urlStart && urlEnd) {
      setStartDate(urlStart);
      setEndDate(urlEnd);
      const today = getDhakaToday();
      if (urlStart === today && urlEnd === today) {
        setDatePreset("today");
      } else if (urlStart === getDatePresetRange("30days").start && urlEnd === today) {
        setDatePreset("30days");
      } else {
        setDatePreset("custom");
      }
    }
    if (urlStatus === "submitted" || urlStatus === "draft" || urlStatus === "all") {
      setStatusFilter(urlStatus);
    }
  }, [searchParams]);

  const applyDatePreset = (preset: Exclude<DatePreset, "custom">) => {
    setDatePreset(preset);
    const { start, end } = getDatePresetRange(preset);
    setStartDate(start);
    setEndDate(end);
  };

  const handleDownloadSingleReportCSV = async (repId: number) => {
    try {
      setDownloadingReportId(repId);
      const [rep, sumRes, callsRes, meetRes, salesRes] = await Promise.allSettled([
        api.reports.getById(repId),
        api.reports.getSummary(repId),
        api.calls.get(repId),
        api.meetings.get(repId),
        api.sales.get(repId),
      ]);

      if (rep.status !== "fulfilled") return;

      const reportData = rep.value;
      let parsedContacts: ClientContactEntry[] = [];
      if (reportData.notes) {
        try {
          const parsed = JSON.parse(reportData.notes);
          if (Array.isArray(parsed?.client_contacts)) {
            parsedContacts = parsed.client_contacts;
          }
        } catch {
          // ignore
        }
      }

      const summaryData = sumRes.status === "fulfilled" ? sumRes.value : null;
      const callList = callsRes.status === "fulfilled" ? callsRes.value?.entries || [] : [];
      const rawMeet = meetRes.status === "fulfilled" ? meetRes.value : [];
      const meetList = Array.isArray(rawMeet)
        ? rawMeet
        : (rawMeet as unknown as { entries?: MeetingActivityEntry[] })?.entries || [];
      const salesList =
        salesRes.status === "fulfilled" ? salesRes.value?.entries || [] : [];

      exportFullReportToCSV({
        report: reportData,
        summary: summaryData,
        callEntries: callList,
        clientContacts: parsedContacts,
        meetingEntries: meetList,
        salesEntries: salesList,
      });
    } catch (err) {
      console.error("Failed to download single report CSV:", err);
    } finally {
      setDownloadingReportId(null);
    }
  };

  // State
  const [reports, setReports] = useState<DetailedReportRow[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch employees for admin filter
  useEffect(() => {
    if (isAdmin) {
      api.employees
        .list()
        .then((data) => setEmployees(data))
        .catch(() => {});
    }
  }, [isAdmin]);

  const loadReports = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const isSub =
        statusFilter === "all" ? undefined : statusFilter === "submitted";
      const empId =
        selectedEmployeeId !== "all" ? Number(selectedEmployeeId) : undefined;

      const rawReports = await api.reports.list({
        start_date: startDate,
        end_date: endDate,
        is_submitted: isSub,
        employee_id: empId,
        limit: 100,
      });

      // Enhance with summary for each report
      const safeRaw = Array.isArray(rawReports) ? rawReports : [];
      const detailed = await Promise.all(
        safeRaw.map(async (r) => {
          try {
            const sum = await api.reports.getSummary(r.id);
            return { ...r, summary: sum as DetailedReportRow["summary"] };
          } catch {
            return r;
          }
        })
      );

      setReports(detailed);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to fetch reports. Please verify your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, selectedEmployeeId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Filter reports by search query (Employee Name, Employee Code EMP-XXX, Report ID REP-XXXXX, Date)
  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase().trim();
    const cleanQ = q.replace(/^#/, "");

    return reports.filter((r) => {
      const rawId = String(r.id);
      const repPadded = `rep-${rawId.padStart(5, "0")}`.toLowerCase();
      const repShort = `rep-${rawId}`.toLowerCase();

      const empRawId = r.employee_id ? String(r.employee_id) : "";
      const empCode = formatEmployeeId(r.employee_id).toLowerCase();
      const empName = (r.employee_name || "").toLowerCase();

      const dateStr = (r.report_date || "").toLowerCase();
      const readableDate = formatReadableDate(r.report_date).toLowerCase();
      const statusText = r.is_submitted ? "submitted" : "draft";

      return (
        empName.includes(cleanQ) ||
        empCode.includes(cleanQ) ||
        empRawId === cleanQ ||
        repPadded.includes(cleanQ) ||
        repShort.includes(cleanQ) ||
        rawId === cleanQ ||
        dateStr.includes(cleanQ) ||
        readableDate.includes(cleanQ) ||
        statusText.startsWith(cleanQ)
      );
    });
  }, [reports, searchQuery]);

  // Aggregated totals across all filtered reports
  const aggregates = useMemo(() => {
    let totalDialed = 0;
    let totalConnected = 0;
    let totalCallDuration = 0;
    let totalMeetingTime = 0;
    let totalOutdoor = 0;
    let totalCollection = 0;
    let totalCommitment = 0;

    for (const r of filteredReports) {
      if (r.summary) {
        const dialed = r.summary.total_calls_dialed ?? r.summary.total_dialed ?? 0;
        const connected = r.summary.total_calls_connected ?? r.summary.total_connected ?? 0;
        const callDuration = r.summary.total_call_duration_minutes ?? 0;
        const meetingTime = r.summary.total_meeting_time_minutes ?? r.summary.total_meeting_duration_minutes ?? 0;
        const outdoor = r.summary.total_outdoor_visits ?? 0;
        const collection = r.summary.actual_collection_bdt ?? r.summary.total_actual_collection ?? 0;
        const commitment =
          r.summary.commitments_bdt ??
          (Number(r.summary.total_sales_commitments || 0) + Number(r.summary.total_tb_commitments || 0));

        totalDialed += Number(dialed);
        totalConnected += Number(connected);
        totalCallDuration += Number(callDuration);
        totalMeetingTime += Number(meetingTime);
        totalOutdoor += Number(outdoor);
        totalCollection += Number(collection);
        totalCommitment += Number(commitment);
      }
    }

    const connectionRate =
      totalDialed > 0 ? Math.round((totalConnected / totalDialed) * 100) : 0;

    return {
      totalDialed,
      totalConnected,
      connectionRate,
      totalCallDuration,
      totalMeetingTime,
      totalOutdoor,
      totalCollection,
      totalCommitment,
    };
  }, [filteredReports]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredReports.length === 0) return;

    const headers = [
      "Report ID",
      "Report Date",
      "Employee ID",
      "Staff Officer",
      "Status",
      "Total Dialed",
      "Total Connected",
      "Call Duration (min)",
      "Meeting Time (min)",
      "Outdoor Visits",
      "Actual Collection (BDT)",
      "Commitments (BDT)",
      "Submitted At",
    ];

    const escapeCsv = (str: unknown): string => {
      if (str === null || str === undefined) return '""';
      return `"${String(str).replace(/"/g, '""')}"`;
    };

    const rows = filteredReports.map((r) => [
      `REP-${String(r.id).padStart(5, "0")}`,
      r.report_date,
      formatEmployeeId(r.employee_id),
      r.employee_name || "N/A",
      r.is_submitted ? "Submitted" : "Draft",
      r.summary?.total_calls_dialed ?? r.summary?.total_dialed ?? 0,
      r.summary?.total_calls_connected ?? r.summary?.total_connected ?? 0,
      r.summary?.total_call_duration_minutes ?? 0,
      r.summary?.total_meeting_time_minutes ?? r.summary?.total_meeting_duration_minutes ?? 0,
      r.summary?.total_outdoor_visits ?? 0,
      r.summary?.actual_collection_bdt ?? r.summary?.total_actual_collection ?? 0,
      r.summary?.commitments_bdt ??
        (Number(r.summary?.total_sales_commitments || 0) + Number(r.summary?.total_tb_commitments || 0)),
      r.submitted_at || "Pending",
    ]);

    const csvContent =
      "\uFEFF" +
      [
        headers.map(escapeCsv).join(","),
        ...rows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `sunset_reports_log_${startDate}_to_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleResetFilters = () => {
    applyDatePreset("30days");
    setStatusFilter("all");
    setSelectedEmployeeId("all");
    setSearchQuery("");
  };

  const handleDeleteReport = async (reportId: number) => {
    setDeleting(true);
    setError(null);
    try {
      await api.reports.delete(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setDeleteReportId(null);
      setSuccessMessage("Daily activity report deleted successfully.");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to delete report.");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout
      title="Reports & Analytics"
      subtitle="Historical daily call activity reports, financial metrics, and export"
    >
      <div className="space-y-6">
        {/* ── Filters Card ─────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
              {/* Row 1: Search Bar & Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Instant Search Bar */}
                <div className="relative flex-1 min-w-[260px] max-w-lg">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by Employee Name, ID (20260001), Report ID (REP-00021), or date..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-600/30 focus:border-green-600 focus:outline-none bg-white font-medium text-slate-800 placeholder:text-slate-400 shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Reset & Export Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="text-xs flex-1 sm:flex-initial"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Reset
                  </Button>

                  <Link
                    href={`/reports/print?start_date=${startDate}&end_date=${endDate}&employee_id=${selectedEmployeeId}&preset=${datePreset}`}
                    target="_blank"
                    className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex-1 sm:flex-initial text-center whitespace-nowrap"
                    title="Print or Save as PDF Multi-Day Executive Summary"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1 text-slate-600" />
                    Print / PDF
                  </Link>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleExportCSV}
                    disabled={filteredReports.length === 0 || loading}
                    className="text-xs flex-1 sm:flex-initial"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    CSV
                  </Button>
                </div>
              </div>

              {/* Row 2: Structured Filters (Quick Presets, Dates, Status, Employee) */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                {/* Quick Date Presets: Smooth horizontal swipeable pill bar with zero line wrapping */}
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
                        onClick={() =>
                          applyDatePreset(p.id as Exclude<DatePreset, "custom">)
                        }
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
                          active
                            ? "bg-green-700 text-white shadow-xs font-bold"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {/* Form Controls Grid: 2 cols on phone, 4 cols on desktop */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {/* From Date */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      From
                    </label>
                    <input
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
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      To
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setDatePreset("custom");
                      }}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 focus:outline-none bg-white"
                    />
                  </div>

                  {/* Status Filter */}
                  <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(e.target.value as "all" | "submitted" | "draft")
                      }
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 focus:outline-none bg-white"
                    >
                      <option value="all">All Statuses</option>
                      <option value="submitted">Submitted Only</option>
                      <option value="draft">Drafts Only</option>
                    </select>
                  </div>

                  {/* Employee Filter (Admin only) */}
                  {isAdmin && (
                    <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Employee
                      </label>
                      <select
                        value={selectedEmployeeId}
                        onChange={(e) =>
                          setSelectedEmployeeId(
                            e.target.value === "all" ? "all" : Number(e.target.value)
                          )
                        }
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 focus:outline-none bg-white truncate"
                      >
                        <option value="all">All Employees</option>
                        {selectedEmployeeId !== "all" &&
                          !employees.some((e) => e.id === Number(selectedEmployeeId)) && (
                            <option value={selectedEmployeeId}>
                              [{formatEmployeeId(selectedEmployeeId)}] (Loading...)
                            </option>
                          )}
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            [{formatEmployeeId(emp.id)}] {emp.full_name} (@{emp.username})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Alerts ──────────────────────────────────────────────────────── */}
        {successMessage && (
          <Alert type="success" onDismiss={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        {error && (
          <div className="p-4 rounded-md bg-rose-50 border border-rose-200 flex items-start gap-3 text-sm text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Aggregated Summary for Filtered Range ────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Filtered Reports
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {filteredReports.length}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {searchQuery
                ? `Matching "${searchQuery}"`
                : startDate === endDate
                ? startDate
                : `${startDate} to ${endDate}`}
            </p>
          </Card>

          <Card className="p-4">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Calls Dialed
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {aggregates.totalDialed}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Connected: {aggregates.totalConnected} ({aggregates.connectionRate}%)
            </p>
          </Card>

          <Card className="p-4 bg-emerald-50/40 border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
              Actual Collection Total
            </span>
            <div className="text-2xl font-extrabold text-emerald-800 mt-1">
              {formatBDT(aggregates.totalCollection)}
            </div>
            <p className="text-xs text-emerald-700 mt-0.5">Sum of received cash</p>
          </Card>

          <Card className="p-4 bg-amber-50/40 border-amber-200">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
              Total Commitments
            </span>
            <div className="text-2xl font-extrabold text-amber-800 mt-1">
              {formatBDT(aggregates.totalCommitment)}
            </div>
            <p className="text-xs text-amber-700 mt-0.5">Expected future payments</p>
          </Card>
        </div>

        {/* ── Reports List Table ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-green-700" />
              Daily Reports Log
            </CardTitle>
            <span className="text-xs text-slate-500">
              Showing {filteredReports.length}{" "}
              {filteredReports.length !== reports.length ? `(filtered from ${reports.length})` : ""}{" "}
              daily reports
            </span>
          </CardHeader>
          {/* ── Mobile View: Native App-Style Report Cards ──────────────── */}
          <div className="block md:hidden">
            {loading ? (
              <div className="p-3.5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-3.5 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-4 w-40" />
                    <div className="grid grid-cols-3 gap-1.5 pt-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-400 text-xs">
                {searchQuery
                  ? `No reports found matching "${searchQuery}". Try a different name, Employee ID, or Report ID.`
                  : "No reports match the selected filters."}
              </div>
            ) : (
              <div className="p-3 space-y-3 bg-slate-50/50">
                {filteredReports.map((report) => {
                  const dialed = report.summary?.total_calls_dialed ?? report.summary?.total_dialed ?? 0;
                  const connected = report.summary?.total_calls_connected ?? report.summary?.total_connected ?? 0;
                  const callDur = report.summary?.total_call_duration_minutes ?? 0;
                  const outdoorVisits = report.summary?.total_outdoor_visits ?? 0;
                  const collection = report.summary?.actual_collection_bdt ?? report.summary?.total_actual_collection ?? 0;
                  const commitment = report.summary?.commitments_bdt ?? (
                    Number(report.summary?.total_sales_commitments || 0) +
                    Number(report.summary?.total_tb_commitments || 0)
                  );

                  return (
                    <div
                      key={report.id}
                      className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs space-y-3"
                    >
                      {/* Top Header: Date, ID, Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {formatReadableDate(report.report_date)}
                          </div>
                          <span className="font-mono text-[10px] text-slate-500 font-semibold tracking-wider">
                            REP-{String(report.id).padStart(5, "0")}
                          </span>
                        </div>
                        <Badge variant={report.is_submitted ? "success" : "warning"} className="text-[10px] py-0.5">
                          {report.is_submitted ? "Submitted" : "Draft"}
                        </Badge>
                      </div>

                      {/* Employee Info if Admin */}
                      {isAdmin && (
                        <div className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 border border-slate-200/70 px-2.5 py-1.5 rounded-lg">
                          <span className="font-semibold text-slate-900 truncate">
                            {report.employee_name || `Employee #${report.employee_id}`}
                          </span>
                          <span className="font-mono text-[10px] font-bold bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.2 rounded shrink-0">
                            {formatEmployeeId(report.employee_id)}
                          </span>
                        </div>
                      )}

                      {/* KPI Mini Grid */}
                      <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                        <div>
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">Calls</p>
                          <p className="text-xs font-bold text-slate-900 mt-0.5">
                            {dialed} <span className="text-emerald-700 font-semibold text-[11px]">({connected})</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">Call Time</p>
                          <p className="text-xs font-bold text-slate-900 mt-0.5">
                            {formatMinutes(callDur)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">Outdoor</p>
                          <p className="text-xs font-bold text-slate-900 mt-0.5">
                            {outdoorVisits} <span className="text-[10px] font-normal text-slate-500">vis</span>
                          </p>
                        </div>
                      </div>

                      {/* Financial Badges (if any collections or commitments) */}
                      {(collection > 0 || commitment > 0) && (
                        <div className="flex items-center gap-2 pt-0.5">
                          {collection > 0 && (
                            <div className="flex-1 bg-emerald-50 border border-emerald-200/80 rounded-lg px-2.5 py-1.5">
                              <p className="text-[9px] font-semibold text-emerald-800 uppercase tracking-tight">Collected</p>
                              <p className="text-xs font-extrabold text-emerald-700 mt-0.5">{formatBDT(collection)}</p>
                            </div>
                          )}
                          {commitment > 0 && (
                            <div className="flex-1 bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5">
                              <p className="text-[9px] font-semibold text-amber-900 uppercase tracking-tight">Commitment</p>
                              <p className="text-xs font-extrabold text-amber-800 mt-0.5">{formatBDT(commitment)}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Touch Action Bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <Link
                          href={`/calls?date=${report.report_date}&employee_id=${report.employee_id}`}
                          className="text-green-700 hover:text-green-800 font-bold inline-flex items-center gap-1 py-1"
                        >
                          View Dial Matrix <ArrowRight className="w-3.5 h-3.5" />
                        </Link>

                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/reports/${report.id}/print`}
                            target="_blank"
                            className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors inline-flex items-center"
                            title="Print / Save PDF"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleReportCSV(report.id)}
                            disabled={downloadingReportId === report.id}
                            className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors inline-flex items-center disabled:opacity-50"
                            title="Download CSV"
                          >
                            {downloadingReportId === report.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteReportId(report.id)}
                              className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors inline-flex items-center"
                              title="Delete Report"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Desktop View: Full Data Table ─────────────────────────────── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-4">Report & Date</th>
                  {isAdmin && <th className="py-2.5 px-3">Employee</th>}
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right" title="Total calls dialed across all time blocks">Dialed</th>
                  <th className="py-2.5 px-3 text-right" title="Connected Calls = HP + Potential + Follow-up Booked">Connected</th>
                  <th className="py-2.5 px-3 text-right" title="Total call conversation duration">Call Time</th>
                  <th className="py-2.5 px-3 text-right" title="Total indoor & team meeting duration">Meeting Time</th>
                  <th className="py-2.5 px-3 text-right" title="Outdoor client visits and site sessions">Outdoor</th>
                  <th className="py-2.5 px-3 text-right font-bold text-emerald-800" title="Actual cash collected today (BDT)">
                    Collection (BDT)
                  </th>
                  <th className="py-2.5 px-3 text-right font-bold text-amber-800" title="Future payment commitments recorded today (BDT)">
                    Commitment (BDT)
                  </th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
                      {isAdmin && <td className="py-3 px-3"><Skeleton className="h-4 w-24" /></td>}
                      <td className="py-3 px-3 text-center"><Skeleton className="h-4 w-16 mx-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-8 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 11 : 10}
                      className="py-12 text-center text-slate-400"
                    >
                      {searchQuery
                        ? `No reports found matching "${searchQuery}". Try a different name, Employee ID, or Report ID.`
                        : "No reports match the selected filters."}
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{formatReadableDate(report.report_date)}</span>
                          <span className="font-mono text-[10px] text-slate-500 font-semibold tracking-wide">
                            REP-{String(report.id).padStart(5, "0")}
                          </span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-3 text-slate-700">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-900">
                              {report.employee_name || `Employee #${report.employee_id}`}
                            </span>
                            <span className="font-mono text-[10px] font-bold bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.5 rounded leading-none">
                              {formatEmployeeId(report.employee_id)}
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="py-3 px-3 text-center">
                        <Badge variant={report.is_submitted ? "success" : "warning"}>
                          {report.is_submitted ? "Submitted" : "Draft"}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-slate-900">
                        {report.summary?.total_calls_dialed ?? report.summary?.total_dialed ?? 0}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-emerald-700">
                        {report.summary?.total_calls_connected ?? report.summary?.total_connected ?? 0}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {formatMinutes(report.summary?.total_call_duration_minutes)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {formatMinutes(report.summary?.total_meeting_time_minutes ?? report.summary?.total_meeting_duration_minutes)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {report.summary?.total_outdoor_visits ?? 0}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">
                        {formatBDT(report.summary?.actual_collection_bdt ?? report.summary?.total_actual_collection)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-amber-700">
                        {formatBDT(
                          report.summary?.commitments_bdt ??
                            (Number(report.summary?.total_sales_commitments || 0) +
                              Number(report.summary?.total_tb_commitments || 0))
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/calls?date=${report.report_date}&employee_id=${report.employee_id}`}
                            className="text-green-700 hover:text-green-800 font-semibold inline-flex items-center gap-1 text-xs"
                            title="View Dial Matrix"
                          >
                            View <ArrowRight className="w-3 h-3" />
                          </Link>
                          <Link
                            href={`/reports/${report.id}/print`}
                            target="_blank"
                            className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors inline-flex items-center"
                            title="Print / Save PDF Report"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleReportCSV(report.id)}
                            disabled={downloadingReportId === report.id}
                            className="p-1 text-slate-500 hover:text-emerald-700 rounded transition-colors inline-flex items-center disabled:opacity-50"
                            title="Download Daily Report as Excel/CSV"
                          >
                            {downloadingReportId === report.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteReportId(report.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Admin: Delete Report"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Admin: Delete Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={deleteReportId !== null}
          onClose={() => setDeleteReportId(null)}
          title="Admin: Delete Daily Report"
          description="Are you sure you want to permanently delete this daily activity report?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              This will permanently purge this daily report, including its hourly dial activity,
              meeting records, and linked logs. This action is restricted to administrators and cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteReportId(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={() => deleteReportId && handleDeleteReport(deleteReportId)}
              >
                Delete Report
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Reports...
        </div>
      }
    >
      <ReportsContent />
    </Suspense>
  );
}
