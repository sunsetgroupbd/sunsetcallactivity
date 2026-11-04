"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Calendar,
  Filter,
  Printer,
  Download,
  RefreshCw,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Skeleton,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import {
  ExecutiveCollectionReportResponse,
  Team,
} from "@/types";
import { formatCurrencyBDT, toLocalDateString } from "@/lib/utils";

function ExecutiveCollectionContent() {
  const [reportDate, setReportDate] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [teams, setTeams] = useState<Team[]>([]);
  const [reportData, setReportData] =
    useState<ExecutiveCollectionReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize date in client-side effect to avoid Next.js static prerender warning
  useEffect(() => {
    setReportDate(toLocalDateString(new Date()));
  }, []);

  // Load available teams for filter
  useEffect(() => {
    (async () => {
      try {
        const teamList = await api.teams.list();
        setTeams(teamList);
      } catch (e) {
        console.error("Failed to load teams for report filter:", e);
      }
    })();
  }, []);

  const fetchReport = useCallback(async () => {
    if (!reportDate) return;
    setLoading(true);
    setError(null);
    try {
      const teamIdParam =
        selectedTeamId === "all" ? undefined : Number(selectedTeamId);
      const data = await api.reports.getExecutiveCollectionReport({
        date: reportDate,
        team_id: teamIdParam,
      });
      setReportData(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load Executive Collection report.");
      }
    } finally {
      setLoading(false);
    }
  }, [reportDate, selectedTeamId]);

  useEffect(() => {
    if (reportDate) {
      fetchReport();
    }
  }, [fetchReport, reportDate]);

  const handleExportCSV = () => {
    if (!reportData) return;

    const headers = [
      "SL.No",
      "Team / Employee Name",
      "Position",
      "Client",
      "Sahre",
      "Mgt Given Target",
      reportData.date_range_label,
      "Achivemt %",
      "Dues",
      "Token",
      "Sold Share",
      "New Sales",
      "EMI",
      "Total Collection",
    ];

    const rows: (string | number)[][] = [];

    reportData.teams.forEach((t) => {
      rows.push([`--- ${t.team_name} ---`, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      t.co_groups.forEach((cg) => {
        cg.rows.forEach((r) => {
          rows.push([
            r.sl_no ?? "",
            r.name,
            r.position,
            r.client,
            r.share,
            r.mgt_given_target,
            r.achieved,
            `${r.achievement_pct}%`,
            r.dues,
            r.token || "",
            r.sold_share || "",
            r.new_sales || "",
            r.emi || "",
            r.total_collection || "",
          ]);
        });
        // CO Total
        rows.push([
          "",
          "C.O Total",
          "",
          cg.totals.client,
          cg.totals.share,
          cg.totals.mgt_given_target,
          cg.totals.achieved,
          `${cg.totals.achievement_pct}%`,
          cg.totals.dues,
          cg.totals.token || "",
          cg.totals.sold_share || "",
          cg.totals.new_sales || "",
          cg.totals.emi || "",
          cg.totals.total_collection || "",
        ]);
      });
      // Team Total
      rows.push([
        "",
        `${t.team_name} Total`,
        "",
        t.totals.client,
        t.totals.share,
        t.totals.mgt_given_target,
        t.totals.achieved,
        `${t.totals.achievement_pct}%`,
        t.totals.dues,
        t.totals.token || "",
        t.totals.sold_share || "",
        t.totals.new_sales || "",
        t.totals.emi || "",
        t.totals.total_collection || "",
      ]);
    });

    // Grand Total
    const gt = reportData.grand_total;
    rows.push([
      "",
      "Grand Total",
      "",
      gt.client,
      gt.share,
      gt.mgt_given_target,
      gt.achieved,
      `${gt.achievement_pct}%`,
      gt.dues,
      gt.token || "",
      gt.sold_share || "",
      gt.new_sales || "",
      gt.emi || "",
      gt.total_collection || "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))].join(
        "\n"
      );

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `executive_collection_sheet_${reportData.date_display.replace(/\./g, "-")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const grandTotal = reportData?.grand_total;

  return (
    <DashboardLayout
      title="Executive Wise Collection Sheet"
      subtitle="Directorate and Team-wise breakdown with Management Target, Month-to-date Collection, and Dues"
    >
      <div className="space-y-5">
        {/* Top Control Bar */}
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Date Picker */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-slate-700">Report Date:</span>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                </div>

                {/* Team Filter */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-slate-700">Team:</span>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white min-w-[140px]"
                  >
                    <option value="all">All Teams</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchReport}
                  loading={loading}
                  className="h-8 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Refresh
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={!reportData || loading}
                  className="h-8 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                >
                  <Download className="w-3.5 h-3.5 mr-1 text-slate-600" />
                  Export CSV
                </Button>

                <Link
                  href={`/reports/executive-collection/print?date=${reportDate}${
                    selectedTeamId !== "all" ? `&team_id=${selectedTeamId}` : ""
                  }`}
                  target="_blank"
                >
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 font-semibold text-white shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                    Print / PDF Format
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Feedback */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
            {error}
          </div>
        )}

        {/* Summary KPI Cards */}
        {reportData && grandTotal && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="p-3 bg-slate-50 border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Total Target
              </span>
              <span className="text-base font-extrabold text-slate-900 font-mono mt-0.5 block">
                {formatCurrencyBDT(grandTotal.mgt_given_target)}
              </span>
              <span className="text-[10px] text-slate-400">Management target</span>
            </Card>

            <Card className="p-3 bg-emerald-50/70 border-emerald-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                Achieved (MTD)
              </span>
              <span className="text-base font-extrabold text-emerald-800 font-mono mt-0.5 block">
                {formatCurrencyBDT(grandTotal.achieved)}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold">
                {reportData.date_range_label}
              </span>
            </Card>

            <Card className="p-3 bg-blue-50/70 border-blue-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">
                Achievement Rate
              </span>
              <span className="text-base font-extrabold text-blue-900 font-mono mt-0.5 block">
                {grandTotal.achievement_pct}%
              </span>
              <span className="text-[10px] text-blue-600 font-semibold">Of target achieved</span>
            </Card>

            <Card className="p-3 bg-rose-50/70 border-rose-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 block">
                Total Dues
              </span>
              <span className="text-base font-extrabold text-rose-800 font-mono mt-0.5 block">
                {formatCurrencyBDT(grandTotal.dues)}
              </span>
              <span className="text-[10px] text-rose-600">Pending target balance</span>
            </Card>

            <Card className="p-3 bg-amber-50/70 border-amber-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                New Sales Coll.
              </span>
              <span className="text-base font-extrabold text-amber-900 font-mono mt-0.5 block">
                {formatCurrencyBDT(grandTotal.new_sales)}
              </span>
              <span className="text-[10px] text-amber-700">Cash / Down Payment</span>
            </Card>

            <Card className="p-3 bg-indigo-50/70 border-indigo-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">
                Total Collection
              </span>
              <span className="text-base font-extrabold text-indigo-900 font-mono mt-0.5 block">
                {formatCurrencyBDT(grandTotal.total_collection)}
              </span>
              <span className="text-[10px] text-indigo-700">New Sales + EMI</span>
            </Card>
          </div>
        )}

        {/* Paper Sheet Format Table View */}
        <Card className="border-slate-300 shadow-sm overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/90 border-b border-slate-200 py-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                Executive Wise Collection Sheet - {reportData?.date_display ?? (reportDate || "Today")}
              </CardTitle>
              <span className="text-xs text-slate-500 font-medium">
                Official Report • Generated for {reportData?.month_display}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                {reportData?.date_range_label}
              </span>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px] font-sans">
              <thead>
                <tr className="bg-slate-200/90 text-slate-800 border-y border-slate-300 uppercase tracking-wider font-extrabold text-[10px]">
                  <th className="py-2.5 px-2 border-r border-slate-300 text-center w-12">SL.No</th>
                  <th className="py-2.5 px-3 border-r border-slate-300 text-left min-w-[180px]">Team / Employee Name</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300 text-left min-w-[110px]">Position</th>
                  <th className="py-2.5 px-2 border-r border-slate-300 text-center w-14">Client</th>
                  <th className="py-2.5 px-2 border-r border-slate-300 text-center w-14">Sahre</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300 text-right min-w-[105px]">Mgt Given Target</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300 text-right min-w-[105px] bg-emerald-50 text-emerald-900">
                    {reportData?.date_range_label || "Achived"}
                  </th>
                  <th className="py-2.5 px-2 border-r border-slate-300 text-center w-16">Achivemt %</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300 text-right min-w-[95px]">Dues</th>
                  <th className="py-2.5 px-2 border-r border-slate-300 text-center w-14">Token</th>
                  <th className="py-2.5 px-2 border-r border-slate-300 text-center w-16">Sold Share</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300 text-right min-w-[95px]">New Sales</th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300 text-right min-w-[90px]">EMI</th>
                  <th className="py-2.5 px-2.5 text-right min-w-[105px] bg-slate-300/80 font-black">Total Collection</th>
                </tr>
              </thead>

              <tbody>
                {loading && !reportData ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td colSpan={14} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : !reportData || reportData.teams.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-slate-400">
                      No collection data found for the selected date and criteria.
                    </td>
                  </tr>
                ) : (
                  reportData.teams.map((tGroup) => (
                    <React.Fragment key={tGroup.team_id ?? tGroup.team_name}>
                      {/* Director Team Header Row */}
                      <tr className="bg-slate-100 border-y-2 border-slate-300 text-slate-900 font-extrabold">
                        <td colSpan={14} className="py-2 px-3 text-xs bg-gradient-to-r from-slate-200 via-slate-100 to-white">
                          <span className="text-slate-900 uppercase tracking-wide font-black">
                            {tGroup.team_name}
                          </span>
                          {tGroup.director_name && (
                            <span className="text-slate-600 font-semibold ml-2 text-[11px]">
                              (Director: {tGroup.director_name})
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* C.O. Groups */}
                      {tGroup.co_groups.map((coGroup, cgIdx) => (
                        <React.Fragment key={coGroup.co_id ?? `cog-${cgIdx}`}>
                          {coGroup.rows.map((row) => (
                            <tr
                              key={row.employee_id ?? `${row.name}-${row.sl_no}`}
                              className={`border-b border-slate-200 hover:bg-slate-50 transition-colors ${
                                row.is_manager ? "font-bold text-slate-900 bg-slate-50/50" : "text-slate-700"
                              }`}
                            >
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono text-[11px]">
                                {row.sl_no}
                              </td>
                              <td className="py-1.5 px-3 border-r border-slate-200">
                                <span className={row.is_manager ? "font-extrabold text-slate-900" : "font-medium"}>
                                  {row.name}
                                </span>
                              </td>
                              <td className="py-1.5 px-2.5 border-r border-slate-200 text-slate-600 text-[10px]">
                                {row.position}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono">
                                {row.client || "-"}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-medium">
                                {row.share || "-"}
                              </td>
                              <td className="py-1.5 px-2.5 border-r border-slate-200 text-right font-mono">
                                {row.mgt_given_target > 0
                                  ? formatCurrencyBDT(row.mgt_given_target).replace("BDT", "").trim()
                                  : "-"}
                              </td>
                              <td className="py-1.5 px-2.5 border-r border-slate-200 text-right font-mono font-semibold bg-emerald-50/40 text-emerald-900">
                                {row.achieved > 0
                                  ? formatCurrencyBDT(row.achieved).replace("BDT", "").trim()
                                  : "-"}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-medium">
                                {row.achievement_pct > 0 ? `${row.achievement_pct}%` : "0%"}
                              </td>
                              <td className="py-1.5 px-2.5 border-r border-slate-200 text-right font-mono text-slate-700">
                                {row.dues > 0
                                  ? formatCurrencyBDT(row.dues).replace("BDT", "").trim()
                                  : "-"}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono">
                                {row.token || "-"}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono">
                                {row.sold_share || "-"}
                              </td>
                              <td className="py-1.5 px-2.5 border-r border-slate-200 text-right font-mono font-medium">
                                {row.new_sales > 0
                                  ? formatCurrencyBDT(row.new_sales).replace("BDT", "").trim()
                                  : "-"}
                              </td>
                              <td className="py-1.5 px-2.5 border-r border-slate-200 text-right font-mono font-medium">
                                {row.emi > 0
                                  ? formatCurrencyBDT(row.emi).replace("BDT", "").trim()
                                  : "-"}
                              </td>
                              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900 bg-slate-50/70">
                                {row.total_collection > 0
                                  ? formatCurrencyBDT(row.total_collection).replace("BDT", "").trim()
                                  : "-"}
                              </td>
                            </tr>
                          ))}

                          {/* C.O. Total Row */}
                          <tr className="bg-slate-200/70 border-b-2 border-slate-300 font-extrabold text-slate-900">
                            <td className="py-1.5 px-2 border-r border-slate-300 text-center"></td>
                            <td className="py-1.5 px-3 border-r border-slate-300 text-right font-black uppercase text-[10px]">
                              C.O Total
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-slate-300"></td>
                            <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono font-black">
                              {coGroup.totals.client || "-"}
                            </td>
                            <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono font-black">
                              {coGroup.totals.share || "-"}
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-slate-300 text-right font-mono font-black">
                              {coGroup.totals.mgt_given_target > 0
                                ? formatCurrencyBDT(coGroup.totals.mgt_given_target).replace("BDT", "").trim()
                                : "-"}
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-slate-300 text-right font-mono font-black text-emerald-950 bg-emerald-100/60">
                              {coGroup.totals.achieved > 0
                                ? formatCurrencyBDT(coGroup.totals.achieved).replace("BDT", "").trim()
                                : "-"}
                            </td>
                            <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono font-black">
                              {coGroup.totals.achievement_pct}%
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-slate-300 text-right font-mono font-black">
                              {coGroup.totals.dues > 0
                                ? formatCurrencyBDT(coGroup.totals.dues).replace("BDT", "").trim()
                                : "-"}
                            </td>
                            <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono font-black">
                              {coGroup.totals.token || "-"}
                            </td>
                            <td className="py-1.5 px-2 border-r border-slate-300 text-center font-mono font-black">
                              {coGroup.totals.sold_share || "-"}
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-slate-300 text-right font-mono font-black">
                              {coGroup.totals.new_sales > 0
                                ? formatCurrencyBDT(coGroup.totals.new_sales).replace("BDT", "").trim()
                                : "-"}
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-slate-300 text-right font-mono font-black">
                              {coGroup.totals.emi > 0
                                ? formatCurrencyBDT(coGroup.totals.emi).replace("BDT", "").trim()
                                : "-"}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-black text-slate-950 bg-slate-300/80">
                              {coGroup.totals.total_collection > 0
                                ? formatCurrencyBDT(coGroup.totals.total_collection).replace("BDT", "").trim()
                                : "-"}
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}

                      {/* Team Total Row */}
                      <tr className="bg-slate-300/90 border-y-2 border-slate-400 font-black text-slate-950">
                        <td className="py-2 px-2 border-r border-slate-400 text-center"></td>
                        <td className="py-2 px-3 border-r border-slate-400 text-right uppercase text-[11px] tracking-wide">
                          {tGroup.team_name}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-400"></td>
                        <td className="py-2 px-2 border-r border-slate-400 text-center font-mono font-black">
                          {tGroup.totals.client || "-"}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-400 text-center font-mono font-black">
                          {tGroup.totals.share || "-"}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-400 text-right font-mono font-black">
                          {tGroup.totals.mgt_given_target > 0
                            ? formatCurrencyBDT(tGroup.totals.mgt_given_target).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-400 text-right font-mono font-black bg-emerald-200/70 text-emerald-950">
                          {tGroup.totals.achieved > 0
                            ? formatCurrencyBDT(tGroup.totals.achieved).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-400 text-center font-mono font-black">
                          {tGroup.totals.achievement_pct}%
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-400 text-right font-mono font-black">
                          {tGroup.totals.dues > 0
                            ? formatCurrencyBDT(tGroup.totals.dues).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-400 text-center font-mono font-black">
                          {tGroup.totals.token || "-"}
                        </td>
                        <td className="py-2 px-2 border-r border-slate-400 text-center font-mono font-black">
                          {tGroup.totals.sold_share || "-"}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-400 text-right font-mono font-black">
                          {tGroup.totals.new_sales > 0
                            ? formatCurrencyBDT(tGroup.totals.new_sales).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="py-2 px-2.5 border-r border-slate-400 text-right font-mono font-black">
                          {tGroup.totals.emi > 0
                            ? formatCurrencyBDT(tGroup.totals.emi).replace("BDT", "").trim()
                            : "-"}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-black text-slate-950 bg-slate-400/80">
                          {tGroup.totals.total_collection > 0
                            ? formatCurrencyBDT(tGroup.totals.total_collection).replace("BDT", "").trim()
                            : "-"}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))
                )}

                {/* Grand Total Row */}
                {reportData && grandTotal && (
                  <tr className="bg-slate-800 text-white font-black border-t-2 border-slate-900 text-xs">
                    <td className="py-3 px-2 border-r border-slate-700 text-center"></td>
                    <td className="py-3 px-3 border-r border-slate-700 text-right uppercase tracking-wider font-extrabold text-[11px]">
                      Grand Total
                    </td>
                    <td className="py-3 px-2.5 border-r border-slate-700"></td>
                    <td className="py-3 px-2 border-r border-slate-700 text-center font-mono">
                      {grandTotal.client}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700 text-center font-mono">
                      {grandTotal.share}
                    </td>
                    <td className="py-3 px-2.5 border-r border-slate-700 text-right font-mono">
                      {formatCurrencyBDT(grandTotal.mgt_given_target).replace("BDT", "").trim()}
                    </td>
                    <td className="py-3 px-2.5 border-r border-slate-700 text-right font-mono text-emerald-300 bg-slate-900/60 font-black">
                      {formatCurrencyBDT(grandTotal.achieved).replace("BDT", "").trim()}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700 text-center font-mono text-emerald-300">
                      {grandTotal.achievement_pct}%
                    </td>
                    <td className="py-3 px-2.5 border-r border-slate-700 text-right font-mono text-rose-300">
                      {formatCurrencyBDT(grandTotal.dues).replace("BDT", "").trim()}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700 text-center font-mono">
                      {grandTotal.token || "-"}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700 text-center font-mono">
                      {grandTotal.sold_share || "-"}
                    </td>
                    <td className="py-3 px-2.5 border-r border-slate-700 text-right font-mono">
                      {grandTotal.new_sales > 0
                        ? formatCurrencyBDT(grandTotal.new_sales).replace("BDT", "").trim()
                        : "-"}
                    </td>
                    <td className="py-3 px-2.5 border-r border-slate-700 text-right font-mono">
                      {grandTotal.emi > 0
                        ? formatCurrencyBDT(grandTotal.emi).replace("BDT", "").trim()
                        : "-"}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono text-emerald-300 bg-slate-950 font-black text-sm">
                      {formatCurrencyBDT(grandTotal.total_collection).replace("BDT", "").trim()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function ExecutiveCollectionPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout
          title="Executive Wise Collection Sheet"
          subtitle="Directorate and Team-wise breakdown with Management Target, Month-to-date Collection, and Dues"
        >
          <div className="p-8 text-center text-xs text-slate-500">
            Loading Executive Collection Sheet...
          </div>
        </DashboardLayout>
      }
    >
      <ExecutiveCollectionContent />
    </Suspense>
  );
}
