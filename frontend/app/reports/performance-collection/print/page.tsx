"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Printer,
  ArrowLeft,
  Download,
  TrendingUp,
  AlertCircle,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { exportPerformanceCollectionToCSV } from "@/lib/export-performance-collection";
import type {
  PerformanceCollectionReportResponse,
  EmployeeMonthlyPerformance,
  CustomerCollectionItem,
  PerformanceIntervalSummary,
} from "@/types";

function PrintablePerformanceCollectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser, loading: authLoading, isAdmin, isSubAdmin } = useAuth();

  const canAccess = Boolean(isAdmin || isSubAdmin);

  const monthParam = searchParams.get("month") || "";
  const employeeIdParam = searchParams.get("employee_id") || "";
  const leadStatusParam = searchParams.get("lead_status") || "";

  const [selectedMonth, setSelectedMonth] = useState<string>(monthParam);
  const [report, setReport] = useState<PerformanceCollectionReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printedDateStr, setPrintedDateStr] = useState<string>("");

  useEffect(() => {
    if (!monthParam) {
      setSelectedMonth(new Date().toISOString().slice(0, 7));
    } else {
      setSelectedMonth(monthParam);
    }
    setPrintedDateStr(
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    );
  }, [monthParam]);

  const loadData = useCallback(async () => {
    if (!selectedMonth) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.reports.getPerformanceCollectionReport({
        month: selectedMonth,
        employee_id: employeeIdParam ? Number(employeeIdParam) : undefined,
        lead_status: leadStatusParam || undefined,
      });
      setReport(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load performance & collection report data.");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, employeeIdParam, leadStatusParam]);

  useEffect(() => {
    if (!authLoading) {
      if (currentUser && !canAccess) {
        router.push("/");
      } else if (canAccess && selectedMonth) {
        loadData();
      }
    }
  }, [authLoading, currentUser, canAccess, selectedMonth, loadData, router]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!report) return;
    exportPerformanceCollectionToCSV(
      report,
      `Sunset_Performance_Collection_Report_${selectedMonth}.csv`
    );
  };

  const formatMoney = (val?: number | null) => {
    if (val === undefined || val === null) return "0";
    return Number(val).toLocaleString("en-BD");
  };

  const getStatusBadgeClass = (status?: string | null) => {
    const s = (status || "").toUpperCase();
    if (s.includes("WON") || s.includes("COLLECTED") || s.includes("HOT")) {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (s.includes("WARM") || s.includes("RESCHEDULED") || s.includes("PENDING")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (s.includes("LOST") || s.includes("CANCEL") || s.includes("COLD")) {
      return "bg-rose-50 text-rose-800 border-rose-200";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  if (authLoading || (loading && !report)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mb-3" />
        <p className="text-sm font-semibold text-slate-600">Generating Printable Report...</p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-xl border border-slate-200 text-center shadow-xs">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 mt-2">
            This performance & collection report is restricted to Administrators only.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-xl border border-slate-200 text-center shadow-xs">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Failed to Generate Report</h2>
          <p className="text-xs text-slate-500 mt-1 mb-5">{error || "No report data found."}</p>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/60 pb-12 print:bg-white print:p-0 print:pb-0">
      {/* ── Top Floating Action Bar (Hidden during Print) ───────────────────── */}
      <div className="print:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 sm:px-6 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">
              Printable Performance & Collection Report
            </h1>
            <p className="text-[11px] text-slate-500">
              Cycle: <span className="font-semibold text-emerald-800">{selectedMonth}</span> &bull; Sunset Group Real Estate
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition"
            title="Download CSV file"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Download CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-xs transition"
            title="Open browser print dialog / Save as PDF"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* ── Official Printable Document Sheet ──────────────────────────────── */}
      <div className="print-page-sheet max-w-6xl mx-auto my-6 bg-white border border-slate-300 p-8 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none text-slate-900 text-xs">
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
                <p className="text-[10px] sm:text-[11px] text-slate-600 font-semibold uppercase tracking-wider">
                  Corporate Sales & Marketing Operations &bull; Performance & Collection Ledger
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right text-[11px] text-slate-600 space-y-0.5 print:text-[10px] print:text-right">
              <div>
                <span className="font-semibold text-slate-700">Billing Month: </span>
                <span className="font-bold text-slate-900 font-mono text-xs">{selectedMonth}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Scope: </span>
                <span className="font-bold text-slate-900">
                  {employeeIdParam
                    ? `Employee ID #${employeeIdParam}`
                    : `All Personnel (${report.monthly_performances.length} Staff)`}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                Printed: {printedDateStr} &bull; Official Management Record
              </div>
            </div>
          </div>
        </div>

        {/* ── 1. Consolidated Executive KPI Grid ─────────────────────────────── */}
        <div className="mb-6 break-inside-avoid">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 pb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
            Consolidated Financial & Activity Summary
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs print:grid-cols-6">
            {/* Box 1: Target */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                Target (TG)
              </span>
              <div className="text-base font-bold text-slate-900">
                ৳{formatMoney(report.summary.total_target)}
              </div>
              <div className="text-[10px] text-slate-500">Monthly Goal</div>
            </div>

            {/* Box 2: New Sales */}
            <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-0.5">
                New Sales
              </span>
              <div className="text-base font-bold text-emerald-700">
                ৳{formatMoney(report.summary.total_new_sales)}
              </div>
              <div className="text-[10px] text-emerald-800/80">Down Payment</div>
            </div>

            {/* Box 3: EMI Collected */}
            <div className="p-2.5 bg-sky-50/60 border border-sky-200 rounded-lg">
              <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider block mb-0.5">
                EMI Collected
              </span>
              <div className="text-base font-bold text-sky-700">
                ৳{formatMoney(report.summary.total_emi)}
              </div>
              <div className="text-[10px] text-sky-800/80">Installment</div>
            </div>

            {/* Box 4: Total Collection */}
            <div className="p-2.5 bg-emerald-100/70 border border-emerald-300 rounded-lg">
              <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider block mb-0.5">
                Total Collection
              </span>
              <div className="text-base font-extrabold text-emerald-900">
                ৳{formatMoney(report.summary.total_collection)}
              </div>
              <div className="text-[10px] text-emerald-800">Sales + EMI + TB</div>
            </div>

            {/* Box 5: Unpaid Recovery */}
            <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded-lg">
              <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block mb-0.5">
                Unpaid Amount
              </span>
              <div className="text-base font-extrabold text-rose-700">
                ৳{formatMoney(report.summary.total_unpaid)}
              </div>
              <div className="text-[10px] text-rose-700/80">Pending Recovery</div>
            </div>

            {/* Box 6: Leads */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block mb-0.5">
                Total Leads
              </span>
              <div className="text-base font-bold text-slate-900">
                {report.summary.total_leads}
              </div>
              <div className="text-[10px] text-slate-500">
                Fair: {report.summary.total_fair_leads} | FB: {report.summary.total_fb_leads}
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. SECTION 1: EMPLOYEE PERFORMANCE & PREDICTIONS TABLE ───────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-200">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-800">
                1
              </span>
              Employee Monthly Prediction & Milestone Checkpoints
            </h2>
            <span className="text-[10px] text-slate-500">
              Total {report.monthly_performances.length} Employees
            </span>
          </div>

          <table className="w-full text-left text-[9px] border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-[8.5px] uppercase font-bold text-slate-700">
                <th rowSpan={2} className="py-1 px-1.5 border border-slate-300">Month / Period</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right">TG</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right text-emerald-800">New Sales</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right text-sky-800">EMI</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right">Total Lead</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right">Fair Lead</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right">FB Leads</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right text-rose-700">HP</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right text-amber-700">P</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-right text-sky-700">Fup</th>
                <th colSpan={4} className="py-1 px-1 border border-slate-300 text-center bg-slate-200">
                  Prediction from Emp
                </th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-center">GL</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-center text-amber-800">Hold</th>
                <th rowSpan={2} className="py-1 px-1 border border-slate-300 text-center text-rose-800">Cancel</th>
                <th rowSpan={2} className="py-1 px-1.5 border border-slate-300 text-center text-emerald-900 font-bold">
                  Total Lead (HP+P) / Coll
                </th>
              </tr>
              <tr className="bg-slate-50 text-[8px] font-bold text-slate-600 text-center">
                <th className="py-0.5 px-0.5 border border-slate-300">Total Calls</th>
                <th className="py-0.5 px-0.5 border border-slate-300 text-emerald-800">Sold Fair</th>
                <th className="py-0.5 px-0.5 border border-slate-300 text-sky-800">Sold FB</th>
                <th className="py-0.5 px-0.5 border border-slate-300 text-purple-800">Sold Other</th>
              </tr>
            </thead>
            {report.monthly_performances.map((emp: EmployeeMonthlyPerformance) => {
              const historyRows = emp.history_months || [];
              const intervalRows = emp.intervals || [];

              return (
                <tbody key={emp.employee_id} className="border-b-2 border-slate-400 break-inside-avoid">
                  {/* Employee Banner */}
                  <tr className="bg-slate-100 font-bold text-slate-800">
                    <td colSpan={18} className="py-1 px-2 border border-slate-300">
                      <span className="text-[9.5px] text-slate-500 uppercase font-semibold mr-1">Name:</span>
                      <span className="text-slate-900 font-bold mr-4">{emp.employee_name}</span>
                      <span className="text-[9.5px] text-slate-500 uppercase font-semibold mr-1">Position:</span>
                      <span className="text-slate-700 font-semibold mr-4">{emp.position || "Staff"}</span>
                      <span className="text-[9.5px] text-slate-500 uppercase font-semibold mr-1">GL:</span>
                      <span className="text-slate-700 font-semibold">{emp.gl || "GL"}</span>
                    </td>
                  </tr>

                  {/* 1. History Months (e.g. Sep-26, Oct-26) */}
                  {emp.history_months?.map((hm) => (
                    <tr key={hm.month} className="bg-slate-50/50">
                      <td className="py-0.5 px-1.5 border border-slate-300 font-bold text-slate-700">{hm.month}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right">৳{formatMoney(hm.target_sales)}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-emerald-800 font-bold">৳{formatMoney(hm.actual_new_sales)}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-sky-800 font-bold">৳{formatMoney(hm.actual_emi)}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right font-bold">{hm.total_lead}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right">{hm.fair_lead}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right">{hm.fb_lead}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-rose-700 font-bold">{hm.hp}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-amber-700 font-bold">{hm.p}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-sky-700 font-bold">{hm.fup}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold">{hm.total_calls || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-semibold text-emerald-800">{hm.prediction_sold_fair}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-semibold text-sky-800">{hm.prediction_sold_fb}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-semibold text-purple-800">{hm.prediction_sold_other}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-semibold">{hm.gl || "GL"}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-semibold text-amber-800">{hm.prediction_hold}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-semibold text-rose-800">{hm.prediction_cancel}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-center font-semibold">
                        <span>{hm.hp + hm.p}</span>
                        <span className="text-slate-400 mx-0.5">/</span>
                        <span className="font-bold text-emerald-800">৳{formatMoney(hm.total_collection)}</span>
                      </td>
                    </tr>
                  ))}

                  {/* 2. Active Month (e.g. Nov-26) */}
                  <tr className="bg-emerald-50/40 font-bold">
                    <td className="py-0.5 px-1.5 border border-slate-300 text-emerald-900">{emp.month}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right">৳{formatMoney(emp.target_sales || emp.target_collection)}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right text-emerald-800 font-extrabold">৳{formatMoney(emp.actual_new_sales)}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right text-sky-800 font-extrabold">৳{formatMoney(emp.actual_emi)}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right font-extrabold">{emp.total_lead}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right">{emp.fair_lead}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right">{emp.fb_lead}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right text-rose-700 font-extrabold">{emp.hp}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right text-amber-700 font-extrabold">{emp.p}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-right text-sky-700 font-extrabold">{emp.fup}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-extrabold">{emp.total_calls || 0}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold text-emerald-800">{emp.prediction_sold_fair}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold text-sky-800">{emp.prediction_sold_fb}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold text-purple-800">{emp.prediction_sold_other}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold">{emp.gl || "GL"}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold text-amber-800">{emp.prediction_hold}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold text-rose-800">{emp.prediction_cancel}</td>
                    <td className="py-0.5 px-1 border border-slate-300 text-center font-extrabold text-emerald-900 bg-emerald-100/40">
                      <span>{emp.hp + emp.p}</span>
                      <span className="text-slate-400 mx-0.5">/</span>
                      <span>৳{formatMoney(emp.total_collection)}</span>
                    </td>
                  </tr>

                  {/* 3. Checkpoints (Till 5th ... Till 30/31th) */}
                  {intervalRows.map((inv: PerformanceIntervalSummary, iIdx: number) => (
                    <tr key={`inv-${iIdx}`} className={inv.is_manual ? "bg-amber-50/20" : ""}>
                      <td className="py-0.5 px-1.5 border border-slate-300 font-medium text-slate-800">
                        {inv.label}
                        {inv.is_manual && <span className="text-[7.5px] ml-1 text-amber-800 font-bold">(Ver.)</span>}
                      </td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-slate-400">-</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-emerald-800 font-bold">৳{formatMoney(inv.new_sales)}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-sky-800 font-bold">৳{formatMoney(inv.emi)}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right font-bold">{inv.total_lead}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right">{inv.fair_lead}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right">{inv.fb_lead}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-rose-700 font-bold">{inv.hp}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-amber-700 font-bold">{inv.p}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-right text-sky-700 font-bold">{inv.fup}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold">{inv.total_calls || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-emerald-800">{inv.sold_fair || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-sky-800">{inv.sold_fb || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-purple-800">{inv.sold_other || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center">{inv.gl || emp.gl || "GL"}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-amber-800">{inv.hold || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-rose-800">{inv.cancel || 0}</td>
                      <td className="py-0.5 px-1 border border-slate-300 text-center font-semibold">
                        <span>{inv.hp + inv.p}</span>
                        <span className="text-slate-400 mx-0.5">/</span>
                        <span className="font-bold text-emerald-800">৳{formatMoney(inv.total_collection)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>

        {/* ── 3. CUMULATIVE MILESTONES PROGRESS ───────────────────────────────── */}
        {((report.company_intervals && report.company_intervals.length > 0) ||
          (report.monthly_performances.length > 0 &&
            report.monthly_performances[0].intervals &&
            report.monthly_performances[0].intervals.length > 0)) && (
          <div className="mb-6 break-inside-avoid">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between border-b border-slate-200 pb-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-700" />
                Cumulative Performance Milestones (Till 5th, 10th, 15th, 20th, 25th, 30th)
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                {report.company_intervals?.some((i) => i.is_manual)
                  ? "Approved Management Session Data"
                  : "Daily Activity Cumulative Totals"}
              </span>
            </h3>

            <div className="grid grid-cols-6 gap-2 text-xs print:grid-cols-6">
              {(report.company_intervals && report.company_intervals.length > 0
                ? report.company_intervals
                : report.monthly_performances[0].intervals
              ).map((inv: PerformanceIntervalSummary, idx: number) => (
                <div key={idx} className="p-2 border border-slate-300 rounded bg-slate-50">
                  <div className="flex justify-between items-center font-bold text-slate-900 border-b border-slate-200 pb-1 text-[10px]">
                    <div className="flex items-center gap-1">
                      <span>{inv.label}</span>
                      {inv.is_manual && (
                        <span className="text-[8px] bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-bold border border-amber-300">
                          Verified
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500">{inv.total_lead} Leads</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sales:</span>
                      <span className="font-bold text-emerald-800">৳{formatMoney(inv.new_sales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coll:</span>
                      <span className="font-bold text-sky-800">৳{formatMoney(inv.total_collection)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Visits:</span>
                      <span className="font-semibold">{inv.outdoor_visits + inv.indoor_cx}</span>
                    </div>
                    {inv.admin_notes && (
                      <div className="text-[9px] text-slate-500 italic truncate pt-0.5" title={inv.admin_notes}>
                        &ldquo;{inv.admin_notes}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. SECTION 2: CUSTOMER COLLECTION LEDGER ──────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-200">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-100 text-[10px] font-bold text-sky-800">
                2
              </span>
              Customer-Wise Collection Report
            </h2>
            <span className="text-[10px] text-slate-500">
              Total {report.customer_collections.length} Customer Accounts
            </span>
          </div>

          <table className="w-full text-left text-[9px] border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-[8px] uppercase font-bold text-slate-700">
                <th className="py-1 px-1 border border-slate-300">Cx Name</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-emerald-800">Paid</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-rose-800">Unpaid</th>
                <th className="py-1 px-0.5 border border-slate-300">Collection Date</th>
                <th className="py-1 px-0.5 border border-slate-300">IN / OUT Plan</th>
                <th className="py-1 px-0.5 border border-slate-300">Date-1</th>
                <th className="py-1 px-0.5 border border-slate-300">Date 2</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-emerald-800">New Sales</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-sky-800">TB</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-sky-800">EMI</th>
                <th className="py-1 px-0.5 border border-slate-300 text-amber-800">Next Collec Date</th>
                <th className="py-1 px-0.5 border border-slate-300 text-amber-800">Next Collec Date</th>
                <th className="py-1 px-0.5 border border-slate-300">Lead Status</th>
                <th className="py-1 px-0.5 border border-slate-300">Lead Source</th>
                <th className="py-1 px-0.5 border border-slate-300">Lead Source Date</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-emerald-900 font-extrabold">Total Collection</th>
                <th className="py-1 px-1 border border-slate-300">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {report.customer_collections.length === 0 ? (
                <tr>
                  <td colSpan={17} className="py-6 text-center text-slate-400">
                    No customer collection records available.
                  </td>
                </tr>
              ) : (
                report.customer_collections.map((cust: CustomerCollectionItem) => (
                  <tr key={cust.id} className="border-b border-slate-200">
                    <td className="py-0.5 px-1 border border-slate-300 font-semibold text-slate-900">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[7.5px] font-bold text-sky-800 bg-sky-50 px-1 py-0.2 rounded border border-sky-200">
                          {cust.customer_code || `CX-${1000 + cust.id}`}
                        </span>
                        <span>{cust.customer_name}</span>
                      </div>
                      <span className="text-[8px] text-slate-500 font-normal block">
                        {cust.customer_phone || "-"} {cust.employee_name ? `• ${cust.employee_name}` : ""}
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-bold text-emerald-800">
                      ৳{formatMoney(cust.paid_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-bold text-rose-800">
                      ৳{formatMoney(cust.unpaid_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 whitespace-nowrap">
                      {cust.collection_date || "-"}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300">{cust.in_out_plan || "Indoor"}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 whitespace-nowrap">{cust.date_1 || "-"}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 whitespace-nowrap">{cust.date_2 || "-"}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-semibold text-emerald-800">
                      ৳{formatMoney(cust.new_sales_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-semibold text-sky-800">
                      ৳{formatMoney(cust.tb_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-semibold text-sky-800">
                      ৳{formatMoney(cust.emi_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 font-bold text-amber-900 whitespace-nowrap">
                      {cust.next_collection_date || "-"}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 font-bold text-amber-900 whitespace-nowrap">
                      {cust.next_collection_date_2 || "-"}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300">
                      <span className={`px-1 py-0.2 rounded text-[7.5px] font-bold border ${getStatusBadgeClass(cust.lead_status)}`}>
                        {cust.lead_status || "PENDING"}
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-slate-700">
                      {cust.lead_source || "-"}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 whitespace-nowrap text-slate-500">
                      {cust.lead_source_date || "-"}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-extrabold text-emerald-900">
                      ৳{formatMoney(cust.total_collection)}
                    </td>
                    <td className="py-0.5 px-1 border border-slate-300 max-w-[120px] truncate text-slate-600">
                      {cust.remarks || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
              <div className="border-b border-slate-400 pb-1 mb-1.5 h-12 flex items-end justify-center font-serif text-slate-800 italic"></div>
              <div className="font-bold text-slate-900">Verified By</div>
              <div className="text-[10px] text-slate-500">Team Leader / Accounts Head</div>
            </div>

            <div>
              <div className="border-b border-slate-400 pb-1 mb-1.5 h-12 flex items-end justify-center font-serif text-slate-800 italic"></div>
              <div className="font-bold text-slate-900">Approved By</div>
              <div className="text-[10px] text-slate-500">Managing Director / Board</div>
            </div>
          </div>

          <div className="mt-8 text-center text-[9px] text-slate-400 border-t border-slate-100 pt-3">
            Sunset Group Real Estate &bull; Sunset Kuakata Hotel & Resort &bull; Official Management Report
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintablePerformanceCollectionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-xs text-slate-500">
          Loading printable report...
        </div>
      }
    >
      <PrintablePerformanceCollectionContent />
    </Suspense>
  );
}
