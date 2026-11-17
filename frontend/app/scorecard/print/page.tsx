"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { MonthlyScorecardResponse } from "@/types";
import { formatBDT, formatReadableDate } from "@/lib/utils";

export default function ScorecardPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 font-sans">Loading Print Preview...</div>}>
      <ScorecardPrintContent />
    </Suspense>
  );
}

function ScorecardPrintContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const employeeIdParam = searchParams.get("employee_id") ? Number(searchParams.get("employee_id")) : null;
  const monthParam = searchParams.get("month") || "";

  const [scorecard, setScorecard] = useState<MonthlyScorecardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeIdParam) {
      setError("No employee specified");
      setLoading(false);
      return;
    }
    api.scorecard
      .get(employeeIdParam, monthParam || undefined)
      .then((data) => {
        setScorecard(data);
      })
      .catch((err) => {
        console.error("Print load error", err);
        setError(err?.message || "Failed to load scorecard");
      })
      .finally(() => setLoading(false));
  }, [employeeIdParam, monthParam]);

  return (
    <div className="bg-white min-h-screen text-black p-4 font-sans text-[10px] print:p-0 print:m-0">
      {/* ─── Non-Printed Controls ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 print:hidden border-b border-gray-200 pb-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-semibold text-gray-700 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Scorecard
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm font-semibold text-gray-500">
          Loading Scorecard Document...
        </div>
      ) : error || !scorecard ? (
        <div className="py-20 text-center text-sm text-red-500 font-semibold">
          {error || "Scorecard not found."}
        </div>
      ) : (
        <div className="w-full space-y-3.5 print:space-y-2">
          {/* ─── Company & Document Title ────────────────────────────────────── */}
          <div className="text-center border-b border-black pb-2">
            <h1 className="text-lg font-black uppercase tracking-wider text-black">
              Sunset Group BD
            </h1>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              Monthly Executive Scorecard & Customer Collection Ledger
            </h2>
            <div className="text-[11px] font-semibold text-slate-700 mt-0.5">
              Month: <span className="font-mono font-bold text-black">{scorecard.header.month}</span>
              {" • "}
              Status: <span className="uppercase font-bold">{scorecard.status}</span>
            </div>
          </div>

          {/* ─── Header Info Box (Matches Paper Form) ────────────────────────── */}
          <table className="w-full border-collapse border border-black text-[10px]">
            <tbody>
              <tr>
                <td className="border border-black px-2 py-1 bg-slate-100 font-bold w-24">Executive Name:</td>
                <td className="border border-black px-2 py-1 font-bold text-black">
                  {scorecard.header.employee_name} (#{scorecard.header.employee_formatted_id})
                </td>
                <td className="border border-black px-2 py-1 bg-slate-100 font-bold w-24">Position / Team:</td>
                <td className="border border-black px-2 py-1 text-black">
                  {scorecard.header.position || "Executive"} {scorecard.header.team_name ? `(${scorecard.header.team_name})` : ""}
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 bg-slate-100 font-bold">Team Leader (T.L.):</td>
                <td className="border border-black px-2 py-1 text-black font-semibold">
                  {scorecard.header.tl_name || "—"}
                </td>
                <td className="border border-black px-2 py-1 bg-slate-100 font-bold">Coordinator (C.O.):</td>
                <td className="border border-black px-2 py-1 text-black font-semibold">
                  {scorecard.header.co_name || "—"}
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 bg-slate-100 font-bold">Prediction Amt:</td>
                <td className="border border-black px-2 py-1 font-mono font-bold text-black">
                  {formatBDT(scorecard.prediction_amount)}
                </td>
                <td className="border border-black px-2 py-1 bg-slate-100 font-bold">Leaves:</td>
                <td className="border border-black px-2 py-1">
                  Planned: <strong className="font-mono">{scorecard.planned_leave}</strong> days {" | "}
                  Unauthorized: <strong className="font-mono text-red-600">{scorecard.unauthorized_leave}</strong> days
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 bg-slate-100 font-bold">Scores & Marking:</td>
                <td colSpan={3} className="border border-black px-2 py-1">
                  Sheet Score: <strong className="font-mono">{scorecard.sheet_score ?? "—"}</strong> {" | "}
                  Call Score: <strong className="font-mono">{scorecard.call_score ?? "—"}</strong> {" | "}
                  Marking (out of 100): <strong className="font-mono text-emerald-800 text-xs">{scorecard.marking !== null ? `${scorecard.marking}/100` : "—"}</strong>
                  {scorecard.supervisor_notes && <span className="ml-3 italic">({scorecard.supervisor_notes})</span>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* ─── Table 1: Performance By Period ──────────────────────────────── */}
          <div>
            <div className="font-bold uppercase text-[10px] text-black mb-1">
              Table 1: Performance by Period (Previous Months & Cumulative Checkpoints)
            </div>
            <table className="w-full border-collapse border border-black text-[9px] text-center">
              <thead>
                <tr className="bg-slate-200 font-bold text-black">
                  <th className="border border-black px-1.5 py-1 text-left">Period</th>
                  <th className="border border-black px-1 py-1 text-right">TG Sales</th>
                  <th className="border border-black px-1 py-1 text-right bg-sky-50 font-bold">Planned (Cx)</th>
                  <th className="border border-black px-1 py-1 text-right bg-emerald-50">New Sales</th>
                  <th className="border border-black px-1 py-1 text-right bg-emerald-50">TB</th>
                  <th className="border border-black px-1 py-1 text-right bg-emerald-50">EMI</th>
                  <th className="border border-black px-1 py-1 text-right bg-emerald-100 font-bold">Total Collec</th>
                  <th className="border border-black px-1 py-1">Tot Lead</th>
                  <th className="border border-black px-1 py-1">Fair Lead</th>
                  <th className="border border-black px-1 py-1">FB Lead</th>
                  <th className="border border-black px-1 py-1">HP</th>
                  <th className="border border-black px-1 py-1">P</th>
                  <th className="border border-black px-1 py-1">Fup</th>
                  <th className="border border-black px-1 py-1">Dialed</th>
                  <th className="border border-black px-1 py-1">Hold</th>
                  <th className="border border-black px-1 py-1">Cancel</th>
                  <th className="border border-black px-1 py-1">In</th>
                  <th className="border border-black px-1 py-1">Out</th>
                  <th className="border border-black px-1 py-1 text-right">Sold Fair</th>
                  <th className="border border-black px-1 py-1 text-right">Sold FB</th>
                  <th className="border border-black px-1 py-1 text-right">Sold Other</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.periods.map((r, i) => (
                  <tr key={i} className={r.row_type === "previous_month" ? "bg-slate-50 italic" : ""}>
                    <td className="border border-black px-1.5 py-0.5 text-left font-bold">{r.label}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(r.tg_sales)}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono font-bold bg-sky-50/50">{formatBDT(r.planned_collection)}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono bg-emerald-50/50">{formatBDT(r.new_sales)}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono bg-emerald-50/50">{formatBDT(r.tb)}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono bg-emerald-50/50">{formatBDT(r.emi)}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono font-bold bg-emerald-100/60">{formatBDT(r.total_collection)}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.total_lead}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.current_fair_lead}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.current_fb_lead}</td>
                    <td className="border border-black px-1 py-0.5 font-mono font-bold">{r.hp}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.p}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.fup}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.total_calls_dialed}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.hold_amount > 0 ? formatBDT(r.hold_amount) : "0"}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.cancel_amount > 0 ? formatBDT(r.cancel_amount) : "0"}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.in_done}</td>
                    <td className="border border-black px-1 py-0.5 font-mono">{r.out_done}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(r.sold_fair)}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(r.sold_fb)}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(r.sold_other)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Portfolio Snapshot Strip ────────────────────────────────────── */}
          <div>
            <div className="font-bold uppercase text-[10px] text-black mb-1">
              Portfolio Snapshot (Monthly Overview)
            </div>
            <table className="w-full border-collapse border border-black text-[9px] text-center">
              <tbody>
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-black px-2 py-0.5">EMI Due Monthly</td>
                  <td className="border border-black px-2 py-0.5">EMI Clients</td>
                  <td className="border border-black px-2 py-0.5">EMI Hold</td>
                  <td className="border border-black px-2 py-0.5">EMI Cancel</td>
                  <td className="border border-black px-2 py-0.5">TB Due Amt</td>
                  <td className="border border-black px-2 py-0.5">TB Clients</td>
                  <td className="border border-black px-2 py-0.5">TB Share</td>
                  <td className="border border-black px-2 py-0.5">TB Hold</td>
                  <td className="border border-black px-2 py-0.5">TB Cancel</td>
                </tr>
                <tr className="font-mono">
                  <td className="border border-black px-2 py-0.5 font-bold">{formatBDT(scorecard.portfolio.emi_due_monthly)}</td>
                  <td className="border border-black px-2 py-0.5">{scorecard.portfolio.emi_client_count}</td>
                  <td className="border border-black px-2 py-0.5">{scorecard.portfolio.emi_hold_count}</td>
                  <td className="border border-black px-2 py-0.5 text-red-600">{scorecard.portfolio.emi_cancel_count}</td>
                  <td className="border border-black px-2 py-0.5 font-bold">{formatBDT(scorecard.portfolio.tb_due_amount)}</td>
                  <td className="border border-black px-2 py-0.5">{scorecard.portfolio.tb_client_count}</td>
                  <td className="border border-black px-2 py-0.5">{scorecard.portfolio.tb_share_count}</td>
                  <td className="border border-black px-2 py-0.5">{scorecard.portfolio.tb_hold_count}</td>
                  <td className="border border-black px-2 py-0.5 text-red-600">{scorecard.portfolio.tb_cancel_count}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ─── Table 2: Customer Collection Plan ──────────────────────────── */}
          <div>
            <div className="font-bold uppercase text-[10px] text-black mb-1">
              Table 2: Customer Collection Plan (Total Expected Recovery Ledger)
            </div>
            <table className="w-full border-collapse border border-black text-[8.5px] text-left">
              <thead>
                <tr className="bg-slate-200 font-bold text-black text-center">
                  <th className="border border-black px-1.5 py-1 text-left w-32">Customer Name</th>
                  <th className="border border-black px-1 py-1 text-right">Paid</th>
                  <th className="border border-black px-1 py-1 text-right">Unpaid</th>
                  <th className="border border-black px-1 py-1">Collec Date</th>
                  <th className="border border-black px-1 py-1">Next Collec 1</th>
                  <th className="border border-black px-1 py-1">Next Collec 2</th>
                  <th className="border border-black px-1 py-1">IN/Out Plan</th>
                  <th className="border border-black px-1 py-1">Date-1</th>
                  <th className="border border-black px-1 py-1">Date 2</th>
                  <th className="border border-black px-1 py-1 text-right">New Sales</th>
                  <th className="border border-black px-1 py-1 text-right">TB</th>
                  <th className="border border-black px-1 py-1 text-right">EMI</th>
                  <th className="border border-black px-1 py-1 text-right bg-emerald-50 font-bold">Total Expected</th>
                  <th className="border border-black px-1 py-1">Status</th>
                  <th className="border border-black px-1 py-1">Prob %</th>
                  <th className="border border-black px-1.5 py-1 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.customers.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="border border-black py-4 text-center text-slate-400 italic font-mono">
                      No customer recovery rows logged for this period.
                    </td>
                  </tr>
                ) : (
                  scorecard.customers.map((c) => (
                    <tr key={c.id}>
                      <td className="border border-black px-1.5 py-0.5 font-bold">{c.customer_name}</td>
                      <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(c.paid_amount)}</td>
                      <td className="border border-black px-1 py-0.5 text-right font-mono text-red-600">{formatBDT(c.unpaid_amount)}</td>
                      <td className="border border-black px-1 py-0.5 text-center">{c.collection_date ? formatReadableDate(c.collection_date) : "—"}</td>
                      <td className="border border-black px-1 py-0.5 text-center font-bold">{c.next_collection_date ? formatReadableDate(c.next_collection_date) : "—"}</td>
                      <td className="border border-black px-1 py-0.5 text-center">{c.next_collection_date_2 ? formatReadableDate(c.next_collection_date_2) : "—"}</td>
                      <td className="border border-black px-1 py-0.5 text-center">{c.in_out_plan}</td>
                      <td className="border border-black px-1 py-0.5 text-center">{c.date_1 ? formatReadableDate(c.date_1) : "—"}</td>
                      <td className="border border-black px-1 py-0.5 text-center">{c.date_2 ? formatReadableDate(c.date_2) : "—"}</td>
                      <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(c.new_sales_amount)}</td>
                      <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(c.tb_amount)}</td>
                      <td className="border border-black px-1 py-0.5 text-right font-mono">{formatBDT(c.emi_amount)}</td>
                      <td className="border border-black px-1 py-0.5 text-right font-mono font-bold bg-emerald-50">{formatBDT(c.total_collection)}</td>
                      <td className="border border-black px-1 py-0.5 text-center font-bold">{c.new_lead_status}</td>
                      <td className="border border-black px-1 py-0.5 text-center font-mono font-bold">{c.collection_probability}%</td>
                      <td className="border border-black px-1.5 py-0.5 truncate max-w-[120px]">{c.remarks || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ─── Signatures Box ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-6 pt-12 text-center text-[10px]">
            <div>
              <div className="border-t border-black pt-1 font-bold">Executive Signature</div>
              <div className="text-[9px] text-slate-500">{scorecard.header.employee_name}</div>
            </div>
            <div>
              <div className="border-t border-black pt-1 font-bold">Team Leader (T.L.)</div>
              <div className="text-[9px] text-slate-500">{scorecard.header.tl_name || "Verified"}</div>
            </div>
            <div>
              <div className="border-t border-black pt-1 font-bold">Coordinator (C.O.)</div>
              <div className="text-[9px] text-slate-500">{scorecard.header.co_name || "Approved"}</div>
            </div>
            <div>
              <div className="border-t border-black pt-1 font-bold">Managing Director / Head of Sales</div>
              <div className="text-[9px] text-slate-500">Sunset Group BD</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
