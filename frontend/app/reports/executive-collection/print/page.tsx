"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { ExecutiveCollectionReportResponse } from "@/types";
import { formatCurrencyBDT, toLocalDateString } from "@/lib/utils";

function PrintContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const dateParam = searchParams.get("date") || toLocalDateString(new Date());
  const teamIdParam = searchParams.get("team_id")
    ? Number(searchParams.get("team_id"))
    : undefined;

  const [reportData, setReportData] =
    useState<ExecutiveCollectionReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.reports.getExecutiveCollectionReport({
          date: dateParam,
          team_id: teamIdParam,
        });
        setReportData(data);
      } catch (err) {
        console.error("Print load error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [dateParam, teamIdParam]);

  const grandTotal = reportData?.grand_total;

  return (
    <div className="bg-white min-h-screen text-black p-4 font-sans text-[11px] print:p-0">
      {/* Non-printed Controls */}
      <div className="flex items-center justify-between mb-4 print:hidden border-b border-gray-200 pb-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-semibold text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold shadow-sm"
          >
            <Printer className="w-4 h-4" /> Print Sheet
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm font-semibold text-gray-500">
          Loading Executive Collection Sheet...
        </div>
      ) : !reportData ? (
        <div className="py-20 text-center text-sm text-red-500">
          Failed to load report data.
        </div>
      ) : (
        <div className="w-full">
          {/* Header matching paper layout */}
          <div className="text-center mb-3">
            <h1 className="text-xl font-bold uppercase tracking-wider text-black">
              Executive Wise Collection Sheet - {reportData.date_display}
            </h1>
            <p className="text-[11px] font-medium text-gray-600">
              Sunset Group • Month of {reportData.month_display}
            </p>
          </div>

          {/* Clean Printed Table */}
          <table className="w-full border-collapse border border-black text-[10px] leading-tight">
            <thead>
              <tr className="bg-gray-100 border-b border-black font-bold text-center">
                <th className="border border-black py-1.5 px-1 w-8">SL.No</th>
                <th className="border border-black py-1.5 px-2 text-left min-w-[150px]">Team / Employee Name</th>
                <th className="border border-black py-1.5 px-2 text-left min-w-[90px]">Position</th>
                <th className="border border-black py-1.5 px-1 w-10">Client</th>
                <th className="border border-black py-1.5 px-1 w-10">Sahre</th>
                <th className="border border-black py-1.5 px-2 text-right min-w-[85px]">Mgt Given Target</th>
                <th className="border border-black py-1.5 px-2 text-right min-w-[85px]">{reportData.date_range_label}</th>
                <th className="border border-black py-1.5 px-1 w-14">Achivemt %</th>
                <th className="border border-black py-1.5 px-2 text-right min-w-[80px]">Dues</th>
                <th className="border border-black py-1.5 px-1 w-10">Token</th>
                <th className="border border-black py-1.5 px-1 w-12">Sold Share</th>
                <th className="border border-black py-1.5 px-2 text-right min-w-[75px]">New Sales</th>
                <th className="border border-black py-1.5 px-2 text-right min-w-[70px]">EMI</th>
                <th className="border border-black py-1.5 px-2 text-right min-w-[85px]">Total Collection</th>
              </tr>
            </thead>

            <tbody>
              {reportData.teams.map((tGroup) => (
                <React.Fragment key={tGroup.team_id ?? tGroup.team_name}>
                  {/* Director Team Header Row */}
                  <tr className="bg-gray-200 font-extrabold border-t-2 border-b border-black">
                    <td colSpan={14} className="border border-black py-1.5 px-2 text-left uppercase text-[11px]">
                      {tGroup.team_name} {tGroup.director_name ? `(${tGroup.director_name})` : ""}
                    </td>
                  </tr>

                  {/* C.O. Groups */}
                  {tGroup.co_groups.map((coGroup, cgIdx) => (
                    <React.Fragment key={coGroup.co_id ?? `cog-${cgIdx}`}>
                      {coGroup.rows.map((row) => (
                        <tr
                          key={row.employee_id ?? `${row.name}-${row.sl_no}`}
                          className={`border-b border-gray-300 ${row.is_manager ? "font-bold bg-gray-50" : ""}`}
                        >
                          <td className="border border-black py-1 px-1 text-center font-mono">
                            {row.sl_no}
                          </td>
                          <td className="border border-black py-1 px-2 text-left">
                            <span className={row.is_manager ? "font-bold text-black" : "font-normal"}>
                              {row.name}
                            </span>
                          </td>
                          <td className="border border-black py-1 px-2 text-left text-[9px]">
                            {row.position}
                          </td>
                          <td className="border border-black py-1 px-1 text-center font-mono">
                            {row.client || "-"}
                          </td>
                          <td className="border border-black py-1 px-1 text-center font-mono">
                            {row.share || "-"}
                          </td>
                          <td className="border border-black py-1 px-2 text-right font-mono">
                            {row.mgt_given_target > 0
                              ? formatCurrencyBDT(row.mgt_given_target).replace("BDT", "").trim()
                              : "-"}
                          </td>
                          <td className="border border-black py-1 px-2 text-right font-mono font-semibold">
                            {row.achieved > 0
                              ? formatCurrencyBDT(row.achieved).replace("BDT", "").trim()
                              : "-"}
                          </td>
                          <td className="border border-black py-1 px-1 text-center font-mono">
                            {row.achievement_pct > 0 ? `${row.achievement_pct}%` : "0%"}
                          </td>
                          <td className="border border-black py-1 px-2 text-right font-mono">
                            {row.dues > 0
                              ? formatCurrencyBDT(row.dues).replace("BDT", "").trim()
                              : "-"}
                          </td>
                          <td className="border border-black py-1 px-1 text-center font-mono">
                            {row.token || "-"}
                          </td>
                          <td className="border border-black py-1 px-1 text-center font-mono">
                            {row.sold_share || "-"}
                          </td>
                          <td className="border border-black py-1 px-2 text-right font-mono">
                            {row.new_sales > 0
                              ? formatCurrencyBDT(row.new_sales).replace("BDT", "").trim()
                              : "-"}
                          </td>
                          <td className="border border-black py-1 px-2 text-right font-mono">
                            {row.emi > 0
                              ? formatCurrencyBDT(row.emi).replace("BDT", "").trim()
                              : "-"}
                          </td>
                          <td className="border border-black py-1 px-2 text-right font-mono font-bold">
                            {row.total_collection > 0
                              ? formatCurrencyBDT(row.total_collection).replace("BDT", "").trim()
                              : "-"}
                          </td>
                        </tr>
                      ))}

                      {/* C.O. Total Row */}
                      <tr className="bg-gray-100 font-extrabold border-b border-black">
                        <td className="border border-black py-1 px-1"></td>
                        <td className="border border-black py-1 px-2 text-right uppercase text-[10px]">
                          C.O Total
                        </td>
                        <td className="border border-black py-1 px-2"></td>
                        <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                          {coGroup.totals.client || "-"}
                        </td>
                        <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                          {coGroup.totals.share || "-"}
                        </td>
                        <td className="border border-black py-1 px-2 text-right font-mono font-bold">
                          {coGroup.totals.mgt_given_target > 0
                            ? formatCurrencyBDT(coGroup.totals.mgt_given_target).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="border border-black py-1 px-2 text-right font-mono font-bold">
                          {coGroup.totals.achieved > 0
                            ? formatCurrencyBDT(coGroup.totals.achieved).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                          {coGroup.totals.achievement_pct}%
                        </td>
                        <td className="border border-black py-1 px-2 text-right font-mono font-bold">
                          {coGroup.totals.dues > 0
                            ? formatCurrencyBDT(coGroup.totals.dues).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                          {coGroup.totals.token || "-"}
                        </td>
                        <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                          {coGroup.totals.sold_share || "-"}
                        </td>
                        <td className="border border-black py-1 px-2 text-right font-mono font-bold">
                          {coGroup.totals.new_sales > 0
                            ? formatCurrencyBDT(coGroup.totals.new_sales).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="border border-black py-1 px-2 text-right font-mono font-bold">
                          {coGroup.totals.emi > 0
                            ? formatCurrencyBDT(coGroup.totals.emi).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="border border-black py-1 px-2 text-right font-mono font-bold">
                          {coGroup.totals.total_collection > 0
                            ? formatCurrencyBDT(coGroup.totals.total_collection).replace("BDT", "").trim()
                            : "-"}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}

                  {/* Team Total Row */}
                  <tr className="bg-gray-200 font-black border-y-2 border-black">
                    <td className="border border-black py-1.5 px-1"></td>
                    <td className="border border-black py-1.5 px-2 text-right uppercase text-[10px]">
                      {tGroup.team_name}
                    </td>
                    <td className="border border-black py-1.5 px-2"></td>
                    <td className="border border-black py-1.5 px-1 text-center font-mono font-bold">
                      {tGroup.totals.client || "-"}
                    </td>
                    <td className="border border-black py-1.5 px-1 text-center font-mono font-bold">
                      {tGroup.totals.share || "-"}
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right font-mono font-bold">
                      {tGroup.totals.mgt_given_target > 0
                        ? formatCurrencyBDT(tGroup.totals.mgt_given_target).replace("BDT", "").trim()
                        : "-"}
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right font-mono font-bold">
                      {tGroup.totals.achieved > 0
                        ? formatCurrencyBDT(tGroup.totals.achieved).replace("BDT", "").trim()
                        : "-"}
                    </td>
                    <td className="border border-black py-1.5 px-1 text-center font-mono font-bold">
                      {tGroup.totals.achievement_pct}%
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right font-mono font-bold">
                      {tGroup.totals.dues > 0
                        ? formatCurrencyBDT(tGroup.totals.dues).replace("BDT", "").trim()
                        : "-"}
                    </td>
                    <td className="border border-black py-1.5 px-1 text-center font-mono font-bold">
                      {tGroup.totals.token || "-"}
                    </td>
                    <td className="border border-black py-1.5 px-1 text-center font-mono font-bold">
                      {tGroup.totals.sold_share || "-"}
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right font-mono font-bold">
                      {tGroup.totals.new_sales > 0
                        ? formatCurrencyBDT(tGroup.totals.new_sales).replace("BDT", "").trim()
                        : "-"}
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right font-mono font-bold">
                      {tGroup.totals.emi > 0
                        ? formatCurrencyBDT(tGroup.totals.emi).replace("BDT", "").trim()
                        : "-"}
                    </td>
                    <td className="border border-black py-1.5 px-2 text-right font-mono font-bold">
                      {tGroup.totals.total_collection > 0
                        ? formatCurrencyBDT(tGroup.totals.total_collection).replace("BDT", "").trim()
                        : "-"}
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Grand Total Row */}
              {grandTotal && (
                <tr className="bg-gray-300 font-black border-t-2 border-b-4 border-black text-[11px]">
                  <td className="border border-black py-2 px-1"></td>
                  <td className="border border-black py-2 px-2 text-right uppercase tracking-wider font-extrabold">
                    Grand Total
                  </td>
                  <td className="border border-black py-2 px-2"></td>
                  <td className="border border-black py-2 px-1 text-center font-mono">
                    {grandTotal.client}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-mono">
                    {grandTotal.share}
                  </td>
                  <td className="border border-black py-2 px-2 text-right font-mono">
                    {formatCurrencyBDT(grandTotal.mgt_given_target).replace("BDT", "").trim()}
                  </td>
                  <td className="border border-black py-2 px-2 text-right font-mono font-bold">
                    {formatCurrencyBDT(grandTotal.achieved).replace("BDT", "").trim()}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-mono">
                    {grandTotal.achievement_pct}%
                  </td>
                  <td className="border border-black py-2 px-2 text-right font-mono">
                    {formatCurrencyBDT(grandTotal.dues).replace("BDT", "").trim()}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-mono">
                    {grandTotal.token || "-"}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-mono">
                    {grandTotal.sold_share || "-"}
                  </td>
                  <td className="border border-black py-2 px-2 text-right font-mono">
                    {grandTotal.new_sales > 0
                      ? formatCurrencyBDT(grandTotal.new_sales).replace("BDT", "").trim()
                      : "-"}
                  </td>
                  <td className="border border-black py-2 px-2 text-right font-mono">
                    {grandTotal.emi > 0
                      ? formatCurrencyBDT(grandTotal.emi).replace("BDT", "").trim()
                      : "-"}
                  </td>
                  <td className="border border-black py-2 px-2 text-right font-mono font-black text-xs">
                    {formatCurrencyBDT(grandTotal.total_collection).replace("BDT", "").trim()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ExecutiveCollectionPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-gray-500">
          Loading print view...
        </div>
      }
    >
      <PrintContent />
    </Suspense>
  );
}
