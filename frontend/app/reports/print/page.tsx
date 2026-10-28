"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Printer,
  ArrowLeft,
  Calendar,
  User,
  ShieldCheck,
  CheckCircle2,
  Clock,
  PhoneCall,
  PhoneForwarded,
  Users,
  Banknote,
  Receipt,
  FileSpreadsheet,
  AlertCircle,
  TrendingUp,
  Target,
  Award,
} from "lucide-react";
import { Button, Badge, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import {
  DashboardSummary,
  PerformanceLeaderboardResponse,
  Report,
  User as UserType,
} from "@/types";
import {
  getDhakaToday,
  getDhakaDateOffset,
  formatReadableDate,
  formatBDT,
  formatMinutes,
  formatEmployeeId,
} from "@/lib/utils";

function PrintablePeriodSummaryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();

  const today = getDhakaToday();
  const startDate = searchParams.get("start_date") || getDhakaDateOffset(-30);
  const endDate = searchParams.get("end_date") || today;
  const paramEmpId = searchParams.get("employee_id");
  const employeeId = paramEmpId && paramEmpId !== "all" ? Number(paramEmpId) : undefined;
  const presetLabel = searchParams.get("preset") || "custom";

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<PerformanceLeaderboardResponse | null>(null);
  const [reportsList, setReportsList] = useState<Report[]>([]);
  const [employees, setEmployees] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, leadRes, repRes, empRes] = await Promise.allSettled([
        api.dashboard.getSummary({
          start_date: startDate,
          end_date: endDate,
          employee_id: employeeId,
        }),
        api.dashboard.getLeaderboard({
          start_date: startDate,
          end_date: endDate,
          employee_id: employeeId,
        }),
        api.reports.list({
          start_date: startDate,
          end_date: endDate,
          employee_id: employeeId,
          limit: 100,
        }),
        api.employees.list({ limit: 100 }),
      ]);

      if (sumRes.status === "fulfilled") setSummary(sumRes.value);
      if (leadRes.status === "fulfilled") setLeaderboard(leadRes.value);
      if (repRes.status === "fulfilled") setReportsList(repRes.value);
      if (empRes.status === "fulfilled") setEmployees(empRes.value);

      if (sumRes.status === "rejected" && leadRes.status === "rejected") {
        setError("Failed to load period summary data.");
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred while loading the report.");
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, employeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected employee name if filtered to single employee
  const selectedEmployee = useMemo(() => {
    if (!employeeId) return null;
    return employees.find((e) => e.id === employeeId) || null;
  }, [employeeId, employees]);

  // Map employee ID to role for table display
  const employeeRoleMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const emp of employees) {
      map.set(emp.id, emp.role);
    }
    return map;
  }, [employees]);

  const handleTriggerPrint = () => {
    window.print();
  };

  const handleDownloadCSV = () => {
    if (!summary) return;

    const headers = [
      "Period",
      "Scope",
      "Total Reports",
      "Submitted Reports",
      "Calls Dialed",
      "Calls Connected",
      "Connection Rate (%)",
      "Meeting Time (Minutes)",
      "Outdoor Client Visits",
      "Actual Collections (BDT)",
      "Total Commitments (BDT)",
      "Collection Conversion (%)",
    ];

    const escapeCsv = (str: unknown): string => {
      if (str === null || str === undefined) return '""';
      return `"${String(str).replace(/"/g, '""')}"`;
    };

    const periodStr = `${startDate} to ${endDate}`;
    const scopeStr = selectedEmployee
      ? `${selectedEmployee.full_name} (${formatEmployeeId(selectedEmployee.id)})`
      : "All Staff";
    const connRate =
      summary.total_calls_dialed > 0
        ? `${Math.round((summary.total_calls_connected / summary.total_calls_dialed) * 100)}%`
        : "0%";
    const convRate =
      summary.commitments_bdt > 0
        ? `${Math.round((summary.actual_collection_bdt / summary.commitments_bdt) * 100)}%`
        : "100%";

    const mainRow = [
      periodStr,
      scopeStr,
      summary.total_reports,
      summary.submitted_reports,
      summary.total_calls_dialed,
      summary.total_calls_connected,
      connRate,
      summary.total_meeting_time_minutes,
      summary.total_outdoor_visits,
      summary.actual_collection_bdt,
      summary.commitments_bdt,
      convRate,
    ];

    let csvContent =
      "\uFEFF" +
      [
        headers.map(escapeCsv).join(","),
        mainRow.map(escapeCsv).join(","),
      ].join("\r\n");

    // Also append staff breakdown rows if available
    if (leaderboard?.rankings && leaderboard.rankings.length > 0) {
      csvContent +=
        "\r\n\r\n" +
        ["--- STAFF PERFORMANCE BREAKDOWN ---"].join("\r\n") +
        "\r\n";

      const staffHeaders = [
        "Rank",
        "Employee ID",
        "Staff Name",
        "Role",
        "Calls Dialed",
        "Calls Connected",
        "Meeting Minutes",
        "Cash Collected (BDT)",
        "Collection Target (BDT)",
        "Target Achieved (%)",
      ];

      const staffRows = leaderboard.rankings.map((r) => [
        r.rank,
        formatEmployeeId(r.employee_id),
        r.employee_name,
        (employeeRoleMap.get(r.employee_id) || "staff").toUpperCase(),
        r.dialed_calls,
        r.connected_calls,
        r.meeting_minutes,
        r.actual_collections,
        r.collection_target,
        `${r.collection_pct}%`,
      ]);

      csvContent += [
        staffHeaders.map(escapeCsv).join(","),
        ...staffRows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\r\n");
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `sunset_executive_summary_${startDate}_to_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getPresetTitle = () => {
    if (presetLabel === "30days") return "30-Day Executive Performance Report";
    if (presetLabel === "week") return "Weekly Executive Performance Report (7 Days)";
    if (presetLabel === "month") return "Monthly Executive Performance Report";
    if (presetLabel === "year") return "Annual Executive Performance Report (Yearly)";
    return "Executive Performance & Activity Report";
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-800">
          Unable to generate print summary
        </h2>
        <p className="text-xs text-slate-500">
          {error || "No data available for the specified range."}
        </p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Return
        </Button>
      </div>
    );
  }

  const connectionRate =
    summary.total_calls_dialed > 0
      ? Math.round((summary.total_calls_connected / summary.total_calls_dialed) * 100)
      : 0;

  // Breakdown figures from summary
  const tbCollected = summary.tb_collection_bdt || 0;
  const emiCollected = summary.emi_collection_bdt || 0;
  const newSalesCollected =
    summary.new_sales_collection_bdt ??
    Math.max(0, summary.actual_collection_bdt - tbCollected - emiCollected);

  const tbPromised = summary.tb_commitments_bdt || 0;
  const salesPromised = summary.sales_commitments_bdt || 0;
  const otherPromised = Math.max(0, summary.commitments_bdt - tbPromised - salesPromised);

  return (
    <div className="min-h-screen bg-slate-100/60 pb-12 print:bg-white print:p-0 print:pb-0">
      {/* ── Top Floating Action Bar (Hidden during Print) ───────────────────── */}
      <div className="print:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 sm:px-6 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">
              Executive Period Summary & PDF Export
            </h1>
            <p className="text-[11px] text-slate-500">
              {formatReadableDate(startDate)} &mdash; {formatReadableDate(endDate)} &bull;{" "}
              {selectedEmployee ? selectedEmployee.full_name : "All Staff"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadCSV}
            title="Download summary data as Excel/CSV"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-700" />
            Download CSV
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleTriggerPrint}
            title="Open browser print dialog to save as PDF"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* ── Official Printable Document Sheet (A4 Container) ───────────────────── */}
      <div className="print-page-sheet max-w-5xl mx-auto my-6 bg-white border border-slate-300 p-8 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none text-slate-900 text-xs">
        {/* Document Letterhead */}
        <div className="border-b-2 border-emerald-800 pb-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:flex-row print:items-center print:justify-between">
            <div className="flex items-center gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Sunset-Group-Logo.png"
                alt="Sunset Group Logo"
                className="h-12 w-auto object-contain shrink-0 print:h-11"
              />
              <div>
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                  SUNSET GROUP REAL ESTATE
                </h1>
                <p className="text-[10px] sm:text-[10.5px] text-slate-600 font-semibold uppercase tracking-wider">
                  Corporate Sales & Marketing Operations &bull; {getPresetTitle()}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right text-[11px] text-slate-600 space-y-0.5 print:text-[10px] print:text-right">
              <div>
                <span className="font-semibold text-slate-700">Period: </span>
                <span className="font-bold text-slate-900 font-mono">
                  {formatReadableDate(startDate)} &mdash; {formatReadableDate(endDate)}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Scope: </span>
                <span className="font-bold text-slate-900">
                  {selectedEmployee
                    ? `${selectedEmployee.full_name} (${formatEmployeeId(selectedEmployee.id)})`
                    : "All Corporate Personnel"}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                Printed:{" "}
                {new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}{" "}
                &bull; Official Management Copy
              </div>
            </div>
          </div>
        </div>

        {/* ── 1. Consolidated Executive KPI Grid ─────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 pb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
            Period Performance Aggregate
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs print:grid-cols-4">
            {/* Box 1: Calls */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Call Activity
              </span>
              <div className="text-lg font-extrabold text-slate-900">
                {summary.total_calls_dialed.toLocaleString()}
                <span className="text-xs text-slate-500 font-medium"> dialed</span>
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                {summary.total_calls_connected.toLocaleString()} connected (
                {connectionRate}%)
              </div>
            </div>

            {/* Box 2: Meetings & Field Visits */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Meetings & Visits
              </span>
              <div className="text-lg font-extrabold text-slate-900">
                {formatMinutes(summary.total_meeting_time_minutes)}
              </div>
              <div className="text-[11px] text-blue-700 font-semibold mt-0.5">
                {summary.total_outdoor_visits} outdoor visits completed
              </div>
            </div>

            {/* Box 3: Actual Cash Collections */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                Cash Receipts (BDT)
              </span>
              <div className="text-lg font-extrabold text-emerald-900">
                {formatBDT(summary.actual_collection_bdt)}
              </div>
              <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                Realized collections in period
              </div>
            </div>

            {/* Box 4: Promises / Commitments */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block mb-1">
                Commitments Recorded
              </span>
              <div className="text-lg font-extrabold text-amber-900">
                {formatBDT(summary.commitments_bdt)}
              </div>
              <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                Pipeline promises logged
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Financial Collections Split Breakdown ─────────────────────── */}
        <div className="mb-6 break-inside-avoid">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
            <Banknote className="w-3.5 h-3.5 text-emerald-700" />
            Collections vs. Commitments Categorical Split
          </h2>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                  <th className="py-2 px-3">Revenue Stream</th>
                  <th className="py-2 px-3 text-right">Cash Received (BDT)</th>
                  <th className="py-2 px-3 text-right">Commitments Promised (BDT)</th>
                  <th className="py-2 px-3 text-right">Realization Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">
                    New Sales Collection
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                    {formatBDT(newSalesCollected)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-amber-800">
                    {formatBDT(salesPromised)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-700">
                    {salesPromised > 0
                      ? `${Math.round((newSalesCollected / salesPromised) * 100)}%`
                      : "100%"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">
                    Token to Booking (TB)
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                    {formatBDT(tbCollected)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-amber-800">
                    {formatBDT(tbPromised)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-700">
                    {tbPromised > 0
                      ? `${Math.round((tbCollected / tbPromised) * 100)}%`
                      : "100%"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">
                    Installments / EMI Collection
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                    {formatBDT(emiCollected)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-amber-800">
                    {formatBDT(otherPromised)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-700">
                    {otherPromised > 0
                      ? `${Math.round((emiCollected / otherPromised) * 100)}%`
                      : "100%"}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-bold border-t border-slate-200">
                  <td className="py-2 px-3 text-slate-900">Total Period Summary</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-900">
                    {formatBDT(summary.actual_collection_bdt)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-amber-900">
                    {formatBDT(summary.commitments_bdt)}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-800 font-bold">
                    {summary.commitments_bdt > 0
                      ? `${Math.round(
                          (summary.actual_collection_bdt / summary.commitments_bdt) * 100
                        )}%`
                      : "100% Cash"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 3. Personnel Contribution & Leaderboard Table ─────────────────── */}
        {leaderboard?.rankings && leaderboard.rankings.length > 0 && (
          <div className="mb-6 break-inside-avoid">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-700" />
                Staff Performance & Target Realization
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                {leaderboard.rankings.length} officers active in period
              </span>
            </h2>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                    <th className="py-2 px-2.5 text-center w-10">#</th>
                    <th className="py-2 px-3">Officer Name</th>
                    <th className="py-2 px-2 text-center w-20">Role</th>
                    <th className="py-2 px-2.5 text-center">Dialed</th>
                    <th className="py-2 px-2.5 text-center">Connected</th>
                    <th className="py-2 px-2.5 text-center">Meeting Mins</th>
                    <th className="py-2 px-3 text-right">Cash Collected</th>
                    <th className="py-2 px-3 text-right">Target Quota</th>
                    <th className="py-2 px-2.5 text-center">Target Realized</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {leaderboard.rankings.map((r, idx) => (
                    <tr
                      key={r.employee_id}
                      className={idx % 2 === 1 ? "bg-slate-50/50" : ""}
                    >
                      <td className="py-2 px-2.5 text-center font-bold text-slate-600 font-mono">
                        {r.rank || idx + 1}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {r.employee_name}
                        <span className="ml-1 text-[10px] text-slate-500 font-mono font-normal">
                          ({formatEmployeeId(r.employee_id)})
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {employeeRoleMap.get(r.employee_id) || "staff"}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono">
                        {r.dialed_calls}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono font-semibold text-emerald-700">
                        {r.connected_calls}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono">
                        {r.meeting_minutes}m
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                        {formatBDT(r.actual_collections)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                        {formatBDT(r.collection_target)}
                      </td>
                      <td className="py-2 px-2.5 text-center font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            r.collection_pct >= 100
                              ? "bg-emerald-100 text-emerald-900"
                              : r.collection_pct >= 60
                              ? "bg-teal-50 text-teal-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {r.collection_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 4. Reports Log Sample ────────────────────────────────────────── */}
        {reportsList.length > 0 && (
          <div className="mb-8 break-inside-avoid">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
              <span className="flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-emerald-700" />
                Submitted Daily Reports in Period ({reportsList.length})
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                Chronological list
              </span>
            </h2>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                    <th className="py-2 px-3">Report ID</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Staff Officer</th>
                    <th className="py-2 px-3">Employee ID</th>
                    <th className="py-2 px-2.5 text-center">Status</th>
                    <th className="py-2 px-3">Submitted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {reportsList.slice(0, 30).map((rep) => (
                    <tr key={rep.id}>
                      <td className="py-1.5 px-3 font-mono font-bold text-slate-900">
                        REP-{String(rep.id).padStart(5, "0")}
                      </td>
                      <td className="py-1.5 px-3 font-mono font-medium text-slate-800">
                        {rep.report_date}
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-slate-900">
                        {rep.employee_name || `Staff #${rep.employee_id}`}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-600">
                        {formatEmployeeId(rep.employee_id)}
                      </td>
                      <td className="py-1.5 px-2.5 text-center">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            rep.is_submitted
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {rep.is_submitted ? "Submitted" : "Draft"}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-slate-500 font-mono text-[10px]">
                        {rep.submitted_at ? formatReadableDate(rep.submitted_at.slice(0, 10)) : "Pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportsList.length > 30 && (
                <div className="py-1.5 text-center text-[10px] text-slate-500 bg-slate-50 border-t border-slate-200">
                  Showing 30 of {reportsList.length} report records. Use "Download CSV" for the complete raw data log.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 5. Official Verification & Authorization Signatures ─────────── */}
        <div className="pt-6 border-t border-slate-300 break-inside-avoid">
          <div className="grid grid-cols-3 gap-6 text-center text-[11px] text-slate-600 print:grid-cols-3">
            <div>
              <div className="border-b border-slate-400 pb-1 mb-1.5 h-12 flex items-end justify-center font-serif text-slate-800 italic">
                {currentUser?.full_name || "Sales Coordinator"}
              </div>
              <div className="font-bold text-slate-900">Prepared By</div>
              <div className="text-[10px] text-slate-500">Sales Coordinator / Operations</div>
            </div>

            <div>
              <div className="border-b border-slate-400 pb-1 mb-1.5 h-12 flex items-end justify-center font-serif text-slate-800 italic">
                {/* Stamp / Signature placeholder */}
              </div>
              <div className="font-bold text-slate-900">Verified By</div>
              <div className="text-[10px] text-slate-500">Team Leader / General Manager</div>
            </div>

            <div>
              <div className="border-b border-slate-400 pb-1 mb-1.5 h-12 flex items-end justify-center font-serif text-slate-800 italic">
                {/* Seal / Approval placeholder */}
              </div>
              <div className="font-bold text-slate-900">Approved By</div>
              <div className="text-[10px] text-slate-500">Managing Director / Board</div>
            </div>
          </div>

          <div className="mt-8 text-center text-[9px] text-slate-400 border-t border-slate-100 pt-3">
            Sunset Group Real Estate &bull; Sunset Kuakata Hotel & Resort Operations &bull; Generated via Corporate ERP Portal
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintablePeriodSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading executive summary document...
        </div>
      }
    >
      <PrintablePeriodSummaryContent />
    </Suspense>
  );
}
