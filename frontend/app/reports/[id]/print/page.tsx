"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  Trash2,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { Button, Badge, Modal, Alert } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { exportFullReportToCSV } from "@/lib/export-report-csv";
import {
  Report,
  CallActivityEntry,
  MeetingActivityEntry,
  SalesCollectionEntry,
  LEAD_CATEGORIES,
  MEETING_METRICS,
  SALES_CATEGORIES,
  ClientContactEntry,
} from "@/types";
import {
  formatReadableDate,
  formatBDT,
  formatMinutes,
} from "@/lib/utils";

function PrintableReportContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = Number(params?.id);
  const { user: currentUser, isAdmin } = useAuth();

  const [report, setReport] = useState<Report | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [callEntries, setCallEntries] = useState<CallActivityEntry[]>([]);
  const [clientContacts, setClientContacts] = useState<ClientContactEntry[]>([]);
  const [meetingEntries, setMeetingEntries] = useState<MeetingActivityEntry[]>([]);
  const [salesEntries, setSalesEntries] = useState<SalesCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin delete state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadAllReportData = useCallback(async () => {
    if (!reportId || isNaN(reportId)) {
      setError("Invalid Report ID specified.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rep = await api.reports.getById(reportId);
      setReport(rep);

      // Parse priority client contacts from report.notes
      let parsedContacts: ClientContactEntry[] = [];
      if (rep.notes) {
        try {
          const parsed = JSON.parse(rep.notes);
          if (Array.isArray(parsed?.client_contacts)) {
            parsedContacts = parsed.client_contacts;
          }
        } catch {
          // ignore plain text notes
        }
      }
      setClientContacts(parsedContacts);

      const [sumRes, callsRes, meetRes, salesRes] = await Promise.allSettled([
        api.reports.getSummary(reportId),
        api.calls.get(reportId),
        api.meetings.get(reportId),
        api.sales.get(reportId),
      ]);


      if (sumRes.status === "fulfilled") setSummary(sumRes.value);
      if (callsRes.status === "fulfilled") setCallEntries(callsRes.value.entries || []);
      if (meetRes.status === "fulfilled") {
        const raw = meetRes.value as unknown as { entries?: MeetingActivityEntry[] } | MeetingActivityEntry[];
        const list = Array.isArray(raw) ? raw : raw?.entries || [];
        setMeetingEntries(list);
      }
      if (salesRes.status === "fulfilled") setSalesEntries(salesRes.value.entries || []);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load complete report details for printing.");
      }
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    loadAllReportData();
  }, [loadAllReportData]);

  const handleTriggerPrint = () => {
    window.print();
  };

  const handleDownloadCSV = useCallback(() => {
    if (!report) return;
    exportFullReportToCSV({
      report,
      summary,
      callEntries,
      clientContacts,
      meetingEntries,
      salesEntries,
    });
  }, [report, summary, callEntries, clientContacts, meetingEntries, salesEntries]);

  // If navigated with ?download=csv, automatically trigger CSV download once data is ready
  useEffect(() => {
    if (!loading && report && searchParams.get("download") === "csv") {
      handleDownloadCSV();
    }
  }, [loading, report, searchParams, handleDownloadCSV]);

  const handleDeleteReport = async () => {
    if (!report) return;
    setDeleting(true);
    try {
      await api.reports.delete(report.id);
      setIsDeleteModalOpen(false);
      router.replace("/reports");
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

  // Convert call entries array to map for fast row lookup
  const callsMap = React.useMemo(() => {
    const map: Record<string, CallActivityEntry> = {};
    for (const entry of callEntries) {
      map[entry.lead_category] = entry;
    }
    return map;
  }, [callEntries]);

  // Convert meeting entries array to map
  const meetingsMap = React.useMemo(() => {
    const map: Record<string, MeetingActivityEntry> = {};
    for (const entry of meetingEntries) {
      map[entry.metric_type] = entry;
    }
    return map;
  }, [meetingEntries]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-600">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />
          <span>Generating printable daily report...</span>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-lg p-6 shadow-sm text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">Unable to Load Report</h2>
          <p className="text-xs text-slate-600">{error || "Report not found."}</p>
          <Button variant="outline" size="sm" onClick={() => router.push("/reports")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Reports
          </Button>
        </div>
      </div>
    );
  }

  // Calculate quick metrics
  const totalDialed = Number(summary?.total_dialed ?? 0);
  const totalConnected = Number(summary?.total_connected ?? 0);
  const connectionRate = summary?.connection_rate_pct !== null && summary?.connection_rate_pct !== undefined
    ? Number(summary.connection_rate_pct)
    : totalDialed > 0 ? Math.round((totalConnected / totalDialed) * 100) : 0;
  const totalCallDuration = Number(summary?.total_call_duration_minutes ?? 0);
  const totalMeetingDuration = Number(summary?.total_meeting_duration_minutes ?? 0);
  const totalActualCollection = Number(summary?.total_actual_collection ?? 0);
  const totalCommitments = Number(
    (Number(summary?.total_sales_commitments ?? 0)) + (Number(summary?.total_tb_commitments ?? 0))
  );

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 print:bg-white print:p-0">
      {/* ── Non-Printed Top Action Bar ────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Sunset-Group-Logo.png"
              alt="Sunset Group Logo"
              className="h-8 w-auto object-contain shrink-0"
            />
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                Print Preview: Daily Activity Report #{report.id}
              </h1>
              <p className="text-xs text-slate-500">
                {formatReadableDate(report.report_date)} • {report.employee_name || `Employee #${report.employee_id}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsDeleteModalOpen(true)}
              title="Admin: Permanently delete this report"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete Report
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadCSV}
            title="Download full report data as Excel/CSV file"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-700" />
            Download CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleTriggerPrint}
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Print Report / Save as PDF
          </Button>
        </div>
      </div>

      {/* ── Official Printable Document Sheet (A4 Container) ───────────────────── */}
      <div className="print-page-sheet max-w-5xl mx-auto bg-white border border-slate-300 p-8 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-0 print:max-w-none text-slate-900 text-xs">
        {/* Document Header */}
        <div className="border-b-2 border-green-800 pb-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:flex-row print:items-center print:justify-between">
            <div className="flex items-center gap-3.5">
              {/* Sunset Group Logo in Small Size */}
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
                <p className="text-[10.5px] text-slate-600 mt-0.5 font-semibold uppercase tracking-wider">
                  Sales & Corporate Marketing Division • Daily Performance & Call Activity Report
                </p>
              </div>
            </div>

            <div className="text-right sm:text-right">
              <div className="inline-block bg-slate-100 border border-slate-300 rounded px-3 py-1.5 text-right">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Report ID</span>
                <span className="font-mono font-bold text-sm text-slate-900">REP-{report.id.toString().padStart(5, "0")}</span>
              </div>
            </div>
          </div>

          {/* Meta Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-200 print:grid-cols-4">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Staff Officer</span>
              <span className="text-xs font-bold text-slate-900">{report.employee_name || `Employee #${report.employee_id}`}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reporting Date</span>
              <span className="text-xs font-bold text-slate-900">{formatReadableDate(report.report_date)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Submission Status</span>
              <span className={`inline-block font-bold text-[11px] ${report.is_submitted ? "text-emerald-800 font-bold" : "text-amber-800 font-bold"}`}>
                {report.is_submitted ? "Finalized / Submitted" : "Draft (Unsubmitted)"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Submitted At</span>
              <span className="text-xs text-slate-800 font-medium">
                {report.submitted_at ? new Date(report.submitted_at).toLocaleString() : "Pending Submission"}
              </span>
            </div>
          </div>
        </div>

        {/* Executive KPI Scorecard */}
        <div className="mb-6">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />
            Executive Performance Summary (KPIs)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
            <div className="border border-slate-300 rounded p-2.5 bg-slate-50/60">
              <span className="text-[10px] font-bold text-slate-600 uppercase block">Calls Dialed / Connected</span>
              <div className="text-base font-extrabold text-slate-900 mt-1">
                {totalDialed} <span className="text-slate-400 font-normal">/</span> <span className="text-emerald-700">{totalConnected}</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-800 mt-0.5 block">
                {connectionRate}% Connection Rate
              </span>
            </div>

            <div className="border border-slate-300 rounded p-2.5 bg-slate-50/60">
              <span className="text-[10px] font-bold text-slate-600 uppercase block">Call & Meeting Time</span>
              <div className="text-base font-extrabold text-slate-900 mt-1">
                {formatMinutes(totalCallDuration + totalMeetingDuration)}
              </div>
              <span className="text-[10px] text-slate-600 font-medium mt-0.5 block">
                Calls: {formatMinutes(totalCallDuration)} | Meets: {formatMinutes(totalMeetingDuration)}
              </span>
            </div>

            <div className="border border-emerald-300 rounded p-2.5 bg-emerald-50/40">
              <span className="text-[10px] font-bold text-emerald-800 uppercase block">Cash Collected (BDT)</span>
              <div className="text-base font-extrabold text-emerald-900 mt-1">
                {formatBDT(totalActualCollection)}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium mt-0.5 block">
                Official Cash Inflow
              </span>
            </div>

            <div className="border border-amber-300 rounded p-2.5 bg-amber-50/40">
              <span className="text-[10px] font-bold text-amber-800 uppercase block">Payment Commitments</span>
              <div className="text-base font-extrabold text-amber-900 mt-1">
                {formatBDT(totalCommitments)}
              </div>
              <span className="text-[10px] text-amber-700 font-medium mt-0.5 block">
                Future Cash Pipeline
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Hourly Call Activity Breakdown */}
        <div className="mb-6">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5 text-green-700" />
            1. Daily Call Activity & Lead Qualification Matrix
          </h2>
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                  <th className="py-2 px-3">Lead Category</th>
                  <th className="py-2 px-2 text-right" title="Cumulative lead status reached till today">Till Today</th>
                  <th className="py-2 px-2 text-right" title="10:00 AM – 1:00 PM Dialed Calls">10:00 - 01:00</th>
                  <th className="py-2 px-2 text-right" title="2:00 PM – 5:00 PM Dialed Calls">02:00 - 05:00</th>
                  <th className="py-2 px-2 text-right" title="5:00 PM – 6:00 PM Dialed Calls">05:00 - 06:00</th>
                  <th className="py-2 px-2 text-right font-extrabold text-emerald-800" title="High Potential: Ready for site visit or immediate booking">HP</th>
                  <th className="py-2 px-2 text-right font-bold text-slate-800" title="Potential: General interested lead requiring follow-up">P</th>
                  <th className="py-2 px-2 text-right text-slate-700" title="Follow-Up Booked: Client requested scheduled callback">FUB</th>
                  <th className="py-2 px-2 text-right text-slate-600" title="Not Interested: Declined, wrong number, or no requirement">NI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {LEAD_CATEGORIES.map((cat, idx) => {
                  const row = callsMap[cat.key];
                  return (
                    <tr key={cat.key} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                      <td className="py-1.5 px-3 font-semibold text-slate-800">{cat.label}</td>
                      <td className="py-1.5 px-2 text-right text-slate-700">{row?.till_today_status ?? 0}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-900">{row?.slot_10_to_1 ?? 0}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-900">{row?.slot_2_to_5 ?? 0}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-900">{row?.slot_5_to_6 ?? 0}</td>
                      <td className="py-1.5 px-2 text-right font-extrabold text-emerald-800">{row?.hp_count ?? 0}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-800">{row?.p_count ?? 0}</td>
                      <td className="py-1.5 px-2 text-right text-slate-700">{row?.fub_count ?? 0}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600">{row?.ni_count ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[9.5px] text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5 print:text-[8.5px]">
            <span><strong className="text-slate-700">HP:</strong> High Potential (Immediate visit/booking)</span>
            <span><strong className="text-slate-700">P:</strong> Potential (Interested, follow-up needed)</span>
            <span><strong className="text-slate-700">FUB:</strong> Follow-Up Booked (Scheduled callback)</span>
            <span><strong className="text-slate-700">NI:</strong> Not Interested</span>
            <span><strong className="text-slate-700">Connected Calls:</strong> HP + P + FUB + NI (Total calls answered & spoken)</span>
          </div>
        </div>

        {/* Section 1.1: Priority Client Contacts & Follow-Up Leads */}
        {clientContacts && clientContacts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-green-700" />
              1.1 Priority Client Follow-Up Directory (HP / FUB / P Leads)
            </h2>
            <div className="border border-slate-300 rounded overflow-hidden">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                    <th className="py-2 px-3 w-8 text-center">#</th>
                    <th className="py-2 px-3">Customer / Client Name</th>
                    <th className="py-2 px-3">Phone Number</th>
                    <th className="py-2 px-2 text-center">Lead Status</th>
                    <th className="py-2 px-3">Next Follow-Up</th>
                    <th className="py-2 px-3">Discussion Summary & Requirements</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {clientContacts.map((c, idx) => (
                    <tr key={idx} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                      <td className="py-1.5 px-3 text-center text-slate-500 font-mono text-[10px]">{idx + 1}</td>
                      <td className="py-1.5 px-3 font-bold text-slate-900">{c.client_name}</td>
                      <td className="py-1.5 px-3 text-slate-700 font-mono text-[10px]">{c.phone_number || "—"}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`inline-block font-bold text-[10px] px-1.5 py-0.5 rounded ${
                          c.category === "HP" ? "bg-red-100 text-red-800" :
                          c.category === "FUB" ? "bg-blue-100 text-blue-800" :
                          c.category === "P" ? "bg-amber-100 text-amber-800" :
                          c.category === "CX" ? "bg-purple-100 text-purple-800" :
                          "bg-slate-100 text-slate-800"
                        }`}>
                          {c.category}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-slate-800 font-medium">{c.follow_up_date ? formatReadableDate(c.follow_up_date) : "—"}</td>
                      <td className="py-1.5 px-3 text-slate-700">{c.discussion_notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 2: Meetings & Client Interactions */}
        <div className="mb-6">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-green-700" />
            2. Client Engagement & Meeting Durations
          </h2>
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                  <th className="py-2 px-3">Engagement Metric</th>
                  <th className="py-2 px-3 text-right">Till Today</th>
                  <th className="py-2 px-3 text-right">10:00 - 01:00</th>
                  <th className="py-2 px-3 text-right">02:00 - 05:00</th>
                  <th className="py-2 px-3 text-right">05:00 - 06:00</th>
                  <th className="py-2 px-3 text-right font-bold">Total Session</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {MEETING_METRICS.map((m, idx) => {
                  const entry = meetingsMap[m.key];
                  const sumSlot = (Number(entry?.slot_10_to_1 ?? 0)) + (Number(entry?.slot_2_to_5 ?? 0)) + (Number(entry?.slot_5_to_6 ?? 0));
                  return (
                    <tr key={m.key} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                      <td className="py-1.5 px-3 font-semibold text-slate-800">{m.label}</td>
                      <td className="py-1.5 px-3 text-right text-slate-700">{entry?.till_today ?? 0} {m.unit === "minutes" ? "m" : ""}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-slate-900">{entry?.slot_10_to_1 ?? 0} {m.unit === "minutes" ? "m" : ""}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-slate-900">{entry?.slot_2_to_5 ?? 0} {m.unit === "minutes" ? "m" : ""}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-slate-900">{entry?.slot_5_to_6 ?? 0} {m.unit === "minutes" ? "m" : ""}</td>
                      <td className="py-1.5 px-3 text-right font-extrabold text-emerald-800">
                        {sumSlot} {m.unit === "minutes" ? "min" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Financial Collections & Commitments */}
        <div className="mb-8">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-green-700" />
            3. Financial Transactions & Revenue Collection
          </h2>
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-2 text-center">Type</th>
                  <th className="py-2 px-3 text-right">Amount (BDT)</th>
                  <th className="py-2 px-3">Customer Name</th>
                  <th className="py-2 px-2 text-center">Method</th>
                  <th className="py-2 px-2 text-center">Seq #</th>
                  <th className="py-2 px-3">Reference / Slip Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {salesEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-3 px-3 text-center text-slate-500 italic">
                      No financial transactions recorded on this reporting date.
                    </td>
                  </tr>
                ) : (
                  salesEntries.map((s, idx) => {
                    const catDef = SALES_CATEGORIES.find((c) => c.key === s.category);
                    return (
                      <tr key={s.id || idx} className={idx % 2 === 1 ? "bg-slate-50/50" : ""}>
                        <td className="py-1.5 px-3 font-semibold text-slate-800">
                          {catDef?.label || s.category}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold">
                          {s.is_collection ? (
                            <span className="text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded text-[10px]">
                              Actual
                            </span>
                          ) : (
                            <span className="text-amber-800 bg-amber-100/70 px-1.5 py-0.5 rounded text-[10px]">
                              Commitment
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-right font-extrabold text-slate-900">
                          {formatBDT(s.amount)}
                        </td>
                        <td className="py-1.5 px-3 text-slate-800 font-medium">
                          {s.customer_name ? (
                            s.customer_name.includes(",") ? (
                              <div className="flex flex-wrap gap-1">
                                {s.customer_name.split(",").map((c, i) => (
                                  <span key={i} className="inline-block bg-slate-100 text-slate-800 font-semibold px-1 py-0.5 rounded text-[10px] border border-slate-200">
                                    {c.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              s.customer_name
                            )
                          ) : (
                            "—"
                          )}
                          {s.customer_phone && (
                            <span className="font-mono text-[9.5px] text-slate-500 block mt-0.5 font-normal">
                              Tel: {s.customer_phone}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {s.payment_method ? (
                            <span className="font-bold text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded uppercase border border-slate-200">
                              {s.payment_method.replace("_", " ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-600">
                          {s.payment_sequence ? `#${s.payment_sequence}` : "—"}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {s.reference || s.notes || "—"}
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Official Sign-off & Management Authorization Block */}
        <div className="pt-8 border-t-2 border-slate-300 grid grid-cols-3 gap-6 text-center text-[11px] text-slate-700 print:grid-cols-3 break-inside-avoid">
          <div>
            <div className="h-14 border-b border-dashed border-slate-400 mb-2" />
            <p className="font-bold text-slate-900">{report.employee_name || "Reporting Employee"}</p>
            <p className="text-[10px] text-slate-500">Prepared & Submitted By</p>
          </div>

          <div>
            <div className="h-14 border-b border-dashed border-slate-400 mb-2" />
            <p className="font-bold text-slate-900">Head of Sales & CRM</p>
            <p className="text-[10px] text-slate-500">Departmental Verification</p>
          </div>

          <div>
            <div className="h-14 border-b border-dashed border-slate-400 mb-2" />
            <p className="font-bold text-slate-900">Managing Director / COO</p>
            <p className="text-[10px] text-slate-500">Corporate Executive Approval</p>
          </div>
        </div>

        <div className="mt-8 text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3">
          Sunset Group Call Activity System • Confidential & Proprietary Corporate Document • Generated on {new Date().toLocaleString()} (Dhaka Standard Time)
        </div>
      </div>

      {/* ── Admin: Delete Daily Report Modal ────────────────────────────────────── */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Admin: Delete Daily Report"
        description={`Are you sure you want to permanently delete Report REP-${report.id.toString().padStart(5, "0")}?`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            This will permanently purge this daily activity report, its hourly dials, meeting records,
            and financial transactions from the database. This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={handleDeleteReport}
            >
              Delete Report
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function PrintableReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500">
          Loading Report Print View...
        </div>
      }
    >
      <PrintableReportContent />
    </Suspense>
  );
}
