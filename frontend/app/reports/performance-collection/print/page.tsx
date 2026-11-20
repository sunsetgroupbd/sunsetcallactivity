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
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");

  // Injects dynamic @page size into document.head so Chrome Print Preview picks up landscape immediately
  useEffect(() => {
    let style = document.getElementById("sunset-print-orientation-style") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "sunset-print-orientation-style";
      document.head.appendChild(style);
    }
    const isLand = orientation === "landscape";
    style.textContent = `
      @page {
        size: ${isLand ? "297mm 210mm" : "210mm 297mm"} !important;
        size: ${isLand ? "A4 landscape" : "A4 portrait"} !important;
        margin: ${isLand ? "6mm 5mm 6mm 5mm" : "8mm 6mm 8mm 6mm"} !important;
      }
      @page landscape-page {
        size: 297mm 210mm !important;
        size: A4 landscape !important;
        margin: 6mm 5mm 6mm 5mm !important;
      }
      @page portrait-page {
        size: 210mm 297mm !important;
        size: A4 portrait !important;
        margin: 8mm 6mm 8mm 6mm !important;
      }
      @media print {
        @page {
          size: ${isLand ? "297mm 210mm" : "210mm 297mm"} !important;
          size: ${isLand ? "A4 landscape" : "A4 portrait"} !important;
          margin: ${isLand ? "6mm 5mm 6mm 5mm" : "8mm 6mm 8mm 6mm"} !important;
        }
        html, body {
          page: ${isLand ? "landscape-page" : "portrait-page"} !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .print-page-sheet {
          page: ${isLand ? "landscape-page" : "portrait-page"} !important;
        }
      }
    `;

    return () => {
      const el = document.getElementById("sunset-print-orientation-style");
      if (el) el.remove();
    };
  }, [orientation]);

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
          {/* Orientation Toggle: Landscape (Default) vs Portrait */}
          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setOrientation("landscape")}
              className={`px-2.5 py-1 rounded-md transition ${
                orientation === "landscape"
                  ? "bg-white text-emerald-800 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Landscape A4 (Recommended for wide 19-column tables)"
            >
              Landscape (Recommended)
            </button>
            <button
              type="button"
              onClick={() => setOrientation("portrait")}
              className={`px-2.5 py-1 rounded-md transition ${
                orientation === "portrait"
                  ? "bg-white text-emerald-800 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Portrait A4"
            >
              Portrait
            </button>
          </div>

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

      {/* Dynamic Print CSS for Orientation */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page {
              size: ${orientation === "landscape" ? "297mm 210mm" : "210mm 297mm"} !important;
              size: ${orientation === "landscape" ? "A4 landscape" : "A4 portrait"} !important;
              margin: ${orientation === "landscape" ? "6mm 5mm 6mm 5mm" : "8mm 6mm 8mm 6mm"} !important;
            }
            @page landscape-page {
              size: 297mm 210mm !important;
              size: A4 landscape !important;
              margin: 6mm 5mm 6mm 5mm !important;
            }
            @page portrait-page {
              size: 210mm 297mm !important;
              size: A4 portrait !important;
              margin: 8mm 6mm 8mm 6mm !important;
            }
            @media print {
              @page {
                size: ${orientation === "landscape" ? "297mm 210mm" : "210mm 297mm"} !important;
                size: ${orientation === "landscape" ? "A4 landscape" : "A4 portrait"} !important;
                margin: ${orientation === "landscape" ? "6mm 5mm 6mm 5mm" : "8mm 6mm 8mm 6mm"} !important;
              }
              html, body {
                page: ${orientation === "landscape" ? "landscape-page" : "portrait-page"} !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .print-page-sheet {
                page: ${orientation === "landscape" ? "landscape-page" : "portrait-page"} !important;
              }
            }
          `,
        }}
      />

      {/* ── Official Printable Document Sheet ──────────────────────────────── */}
      <div className={`print-page-sheet ${orientation === "landscape" ? "print-landscape max-w-[1300px]" : "print-portrait max-w-4xl"} mx-auto my-6 bg-white border border-slate-300 p-6 sm:p-8 shadow-sm print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none text-slate-900 text-xs transition-all`}>
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

          {report.monthly_performances.map((emp: EmployeeMonthlyPerformance) => {
            const historyRows = emp.history_months || [];
            const intervalRows = emp.intervals || [];

            return (
              <div key={emp.employee_id} className="mb-6 break-inside-avoid">
                {/* 1. ROW 1: EMPLOYEE REVIEW HEADER GRID */}
                <table className="w-full text-left text-[8px] border-collapse border border-slate-400 mb-0.5">
                  <tbody>
                    <tr className="bg-slate-50">
                      <td className="bg-slate-100 font-bold px-1.5 py-0.5 border border-slate-300 w-[6%]">Name</td>
                      <td className="font-extrabold text-slate-900 px-2 py-0.5 border border-slate-300 w-[16%]">{emp.employee_name}</td>
                      <td className="bg-slate-100 font-bold px-1.5 py-0.5 border border-slate-300 w-[4%]">TL :</td>
                      <td className="font-semibold text-slate-800 px-2 py-0.5 border border-slate-300 w-[12%]">{emp.tl_name || "-"}</td>
                      <td className="bg-slate-100 font-bold px-1.5 py-0.5 border border-slate-300 w-[4%]">CO :</td>
                      <td className="font-semibold text-slate-800 px-2 py-0.5 border border-slate-300 w-[12%]">{emp.co_name || "-"}</td>
                      <td className="bg-slate-100 font-bold px-1.5 py-0.5 border border-slate-300 w-[6%]">Position</td>
                      <td className="font-semibold text-slate-800 px-2 py-0.5 border border-slate-300 w-[10%]">{emp.position || "Executive"}</td>
                      {emp.team_name && (
                        <>
                          <td className="bg-slate-100 font-bold px-1.5 py-0.5 border border-slate-300 w-[5%]">Group</td>
                          <td className="font-semibold text-slate-800 px-2 py-0.5 border border-slate-300 w-[9%]">{emp.team_name}</td>
                        </>
                      )}
                      <td className="bg-slate-100 font-bold px-1.5 py-0.5 border border-slate-300 w-[7%]">Month Name</td>
                      <td className="font-bold text-slate-900 px-2 py-0.5 border border-slate-300 w-[8%]">{emp.month}</td>
                    </tr>
                  </tbody>
                </table>

                {/* 2. ROW 2: PORTFOLIO & PREDICTION OVERVIEW BOXES (Before Month Table Header!) */}
                <table className="w-full text-center text-[7px] border-collapse border border-slate-400 mb-0.5">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold">
                      <th className="border border-slate-300 p-0.5">EMI Due Monthly</th>
                      <th className="border border-slate-300 p-0.5">EMI Client</th>
                      <th className="border border-slate-300 p-0.5">EMI Hold</th>
                      <th className="border border-slate-300 p-0.5">EMI cancel</th>
                      <th className="border border-slate-300 p-0.5">TB Due</th>
                      <th className="border border-slate-300 p-0.5">TB Client</th>
                      <th className="border border-slate-300 p-0.5">TB Share</th>
                      <th className="border border-slate-300 p-0.5">TB Hold</th>
                      <th className="border border-slate-300 p-0.5">TB cancel</th>
                      <th className="border border-slate-300 p-0.5">Total Fair Lead</th>
                      <th className="border border-slate-300 p-0.5">Total FB Lead</th>
                      <th className="border border-slate-300 p-0.5">Marking (100)</th>
                      <th className="border border-slate-300 p-0.5">Sheet Score</th>
                      <th className="border border-slate-300 p-0.5">Call Score</th>
                      <th className="border border-slate-300 p-0.5">Planned Leave</th>
                      <th className="border border-slate-300 p-0.5">Un-Authorize Leave</th>
                      <th className="border border-slate-300 p-0.5">Prediction Amt from Emp</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white font-bold text-slate-900">
                      <td className="border border-slate-300 p-0.5 text-emerald-800">৳{formatMoney(emp.emi_due_monthly || emp.actual_emi)}</td>
                      <td className="border border-slate-300 p-0.5">{emp.emi_client_count ?? "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-amber-800">{emp.emi_hold_amount ? "৳" + formatMoney(emp.emi_hold_amount) : "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-rose-800">{emp.emi_cancel_amount ? "৳" + formatMoney(emp.emi_cancel_amount) : "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-purple-800">৳{formatMoney(emp.tb_due_amount || emp.actual_tb)}</td>
                      <td className="border border-slate-300 p-0.5">{emp.tb_client_count ?? 0}</td>
                      <td className="border border-slate-300 p-0.5">{emp.tb_share_count ?? 0}</td>
                      <td className="border border-slate-300 p-0.5 text-amber-800">{emp.tb_hold_amount ? "৳" + formatMoney(emp.tb_hold_amount) : "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-rose-800">{emp.tb_cancel_amount ? "৳" + formatMoney(emp.tb_cancel_amount) : "-"}</td>
                      <td className="border border-slate-300 p-0.5">{emp.total_fair_lead ?? emp.fair_lead}</td>
                      <td className="border border-slate-300 p-0.5">{emp.total_fb_lead ?? emp.fb_lead}</td>
                      <td className="border border-slate-300 p-0.5 text-emerald-800">{emp.marking_score ?? "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-emerald-800">{emp.sheet_score ?? "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-emerald-800">{emp.call_score ?? "-"}</td>
                      <td className="border border-slate-300 p-0.5">{emp.planned_leave ?? "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-rose-700">{emp.unauthorized_leave ?? "-"}</td>
                      <td className="border border-slate-300 p-0.5 text-emerald-900 font-extrabold">৳{formatMoney(emp.prediction_amount || emp.total_collection)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* 3. ROW 3: MONTHLY PERFORMANCE TABLE (Headers right above Month Rows!) */}
                <table className="w-full text-left text-[8px] border-collapse border border-slate-400">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold text-[7.5px] uppercase tracking-wider text-center">
                      <th className="py-1 px-1 border border-slate-700 text-left">Month</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right">TG</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-emerald-300">New Sales</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-purple-300">Token to Booking</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-sky-300">EMI</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right">Total Lead</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right">Current Fair Lead</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right">Current FB Leads</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-rose-300">HP</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-amber-300">P</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-sky-300">Fup</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-center">Total Calls Dialed</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-center text-amber-300">Hold</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-center text-rose-300">Cancel</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-center text-indigo-300">In done</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-center text-teal-300">Out Done</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-emerald-300">Sold from Fair Leads</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-sky-300">Sold From FB Leads</th>
                      <th className="py-1 px-0.5 border border-slate-700 text-right text-purple-300">Sold From Other Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 1. History Months (e.g. Sep-26, Oct-26) */}
                    {emp.history_months?.map((hm) => (
                      <tr key={hm.month} className="bg-slate-50/50">
                        <td className="py-0.5 px-1 border border-slate-300 font-bold text-slate-700">{hm.month}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right">৳{formatMoney(hm.target_sales)}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-emerald-800 font-bold">৳{formatMoney(hm.actual_new_sales)}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-purple-800 font-bold">৳{formatMoney(hm.actual_tb)}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-800 font-bold">৳{formatMoney(hm.actual_emi)}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right font-bold">{hm.total_lead}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right">{hm.fair_lead}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right">{hm.fb_lead}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-rose-700 font-bold">{hm.hp}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-amber-700 font-bold">{hm.p}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-700 font-bold">{hm.fup}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold">{hm.total_calls || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-amber-800">{Number(hm.prediction_hold) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-rose-800">{Number(hm.prediction_cancel) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-indigo-800">{hm.indoor_cx || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-teal-800">{hm.outdoor_visits || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-emerald-800">{Number(hm.prediction_sold_fair) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-800">{Number(hm.prediction_sold_fb) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-purple-800">{Number(hm.prediction_sold_other) || 0}</td>
                      </tr>
                    ))}

                    {/* 2. Active Month (e.g. Nov-26) */}
                    <tr className="bg-emerald-50/40 font-bold">
                      <td className="py-0.5 px-1 border border-slate-300 text-emerald-900">{emp.month}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right">৳{formatMoney(emp.target_sales || emp.target_collection)}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-emerald-800 font-extrabold">৳{formatMoney(emp.actual_new_sales)}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-purple-800 font-extrabold">৳{formatMoney(emp.actual_tb)}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-800 font-extrabold">৳{formatMoney(emp.actual_emi)}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right font-extrabold">{emp.total_lead}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right">{emp.fair_lead}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right">{emp.fb_lead}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-rose-700 font-extrabold">{emp.hp}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-amber-700 font-extrabold">{emp.p}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-700 font-extrabold">{emp.fup}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center font-extrabold">{emp.total_calls || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-amber-800 font-bold">{Number(emp.prediction_hold) || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-rose-800 font-bold">{Number(emp.prediction_cancel) || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-indigo-800 font-bold">{emp.indoor_cx || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-center text-teal-800 font-bold">{emp.outdoor_visits || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-emerald-800 font-extrabold">{Number(emp.prediction_sold_fair) || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-800 font-extrabold">{Number(emp.prediction_sold_fb) || 0}</td>
                      <td className="py-0.5 px-0.5 border border-slate-300 text-right text-purple-800 font-extrabold">{Number(emp.prediction_sold_other) || 0}</td>
                    </tr>

                    {/* 3. Checkpoints (Till 5th ... Till 30/31th) */}
                    {intervalRows.map((inv: PerformanceIntervalSummary, iIdx: number) => (
                      <tr key={`inv-${iIdx}`} className={inv.is_manual ? "bg-amber-50/20" : ""}>
                        <td className="py-0.5 px-1 border border-slate-300 font-medium text-slate-800">
                          {inv.label}
                          {inv.is_manual && <span className="text-[7.5px] ml-1 text-amber-800 font-bold">(Ver.)</span>}
                        </td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-slate-400">-</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-emerald-800 font-bold">৳{formatMoney(inv.new_sales)}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-purple-800 font-bold">৳{formatMoney(inv.actual_tb || 0)}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-800 font-bold">৳{formatMoney(inv.emi)}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right font-bold">{inv.total_lead}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right">{inv.fair_lead}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right">{inv.fb_lead}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-rose-700 font-bold">{inv.hp}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-amber-700 font-bold">{inv.p}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-700 font-bold">{inv.fup}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold">{inv.total_calls || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-amber-800">{Number(inv.hold) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-rose-800">{Number(inv.cancel) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-indigo-800">{inv.indoor_cx || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-center text-teal-800">{inv.outdoor_visits || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-emerald-800">{Number(inv.sold_fair) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-sky-800">{Number(inv.sold_fb) || 0}</td>
                        <td className="py-0.5 px-0.5 border border-slate-300 text-right text-purple-800">{Number(inv.sold_other) || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
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
                <th className="py-1 px-0.5 border border-slate-300 text-amber-800">Next Collec Date</th>
                <th className="py-1 px-0.5 border border-slate-300 text-amber-800">Next Collec Date (2)</th>
                <th className="py-1 px-0.5 border border-slate-300">IN / Out Plan</th>
                <th className="py-1 px-0.5 border border-slate-300">Date-1</th>
                <th className="py-1 px-0.5 border border-slate-300">Date 2</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-emerald-800">New Sales</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-purple-800">TB</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-sky-800">EMI</th>
                <th className="py-1 px-0.5 border border-slate-300">New Lead Status</th>
                <th className="py-1 px-0.5 border border-slate-300 text-right text-emerald-900 font-extrabold">Total Collection</th>
                <th className="py-1 px-0.5 border border-slate-300 text-center font-bold text-indigo-900">Collection Probability %</th>
                <th className="py-1 px-1 border border-slate-300">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {report.customer_collections.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-6 text-center text-slate-400">
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
                    <td className="py-0.5 px-0.5 border border-slate-300 font-bold text-amber-900 whitespace-nowrap">
                      {cust.next_collection_date || "-"}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 font-bold text-amber-900 whitespace-nowrap">
                      {cust.next_collection_date_2 || "-"}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300">{cust.in_out_plan || "Indoor"}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 whitespace-nowrap">{cust.date_1 || "-"}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 whitespace-nowrap">{cust.date_2 || "-"}</td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-semibold text-emerald-800">
                      ৳{formatMoney(cust.new_sales_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-semibold text-purple-800">
                      ৳{formatMoney(cust.tb_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-semibold text-sky-800">
                      ৳{formatMoney(cust.emi_amount)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300">
                      <span className={`px-1 py-0.2 rounded text-[7.5px] font-bold border ${getStatusBadgeClass(cust.lead_status)}`}>
                        {cust.lead_status || "PENDING"}
                      </span>
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-right font-extrabold text-emerald-900">
                      ৳{formatMoney(cust.total_collection)}
                    </td>
                    <td className="py-0.5 px-0.5 border border-slate-300 text-center font-bold">
                      {cust.collection_probability !== undefined && cust.collection_probability !== null ? (
                        <span className="text-emerald-800 font-bold">{cust.collection_probability}%</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
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
