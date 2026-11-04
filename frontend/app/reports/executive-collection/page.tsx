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
  LayoutGrid,
  Table as TableIcon,
  ChevronDown,
  ChevronUp,
  UserCheck,
  TrendingUp,
  Award,
  Layers,
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
  ExecutiveCollectionRow,
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
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Initialize date in client-side effect to avoid Next.js static prerender warning
  useEffect(() => {
    setReportDate(toLocalDateString(new Date()));
    // If mobile viewport on initial load, default to Cards view
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setViewMode("cards");
    }
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

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
      <div className="space-y-4">
        {/* Top Control Bar */}
        <Card className="bg-white border-slate-200">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                {/* Date Picker */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-700">Date:</span>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                </div>

                {/* Team Filter */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <Filter className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold text-slate-700">Team:</span>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white min-w-[130px]"
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
                  className="h-7 sm:h-8 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Refresh
                </Button>
              </div>

              {/* View Switcher & Action Buttons */}
              <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                {/* Mobile View Toggle Switch */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition ${
                      viewMode === "table"
                        ? "bg-white text-emerald-800 shadow-2xs border border-slate-200"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Spreadsheet Table View with Sticky Name Freeze Pane"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition ${
                      viewMode === "cards"
                        ? "bg-white text-emerald-800 shadow-2xs border border-slate-200"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Executive Mobile Cards View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleExportCSV}
                    disabled={!reportData || loading}
                    className="h-7 sm:h-8 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 px-2 sm:px-3"
                  >
                    <Download className="w-3.5 h-3.5 sm:mr-1 text-slate-600" />
                    <span className="hidden sm:inline">Export CSV</span>
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
                      className="h-7 sm:h-8 text-xs bg-emerald-700 hover:bg-emerald-800 font-semibold text-white shadow-xs px-2.5 sm:px-3"
                    >
                      <Printer className="w-3.5 h-3.5 sm:mr-1.5" />
                      <span>Print</span>
                    </Button>
                  </Link>
                </div>
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

        {/* Summary KPI Cards (Scrollable or 2-column grid on mobile) */}
        {reportData && grandTotal && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <Card className="p-2.5 sm:p-3 bg-slate-50 border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                Total Target
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-900 font-mono mt-0.5 block truncate">
                {formatCurrencyBDT(grandTotal.mgt_given_target)}
              </span>
              <span className="text-[10px] text-slate-400">Management target</span>
            </Card>

            <Card className="p-2.5 sm:p-3 bg-emerald-50/70 border-emerald-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block truncate">
                Achieved (MTD)
              </span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-800 font-mono mt-0.5 block truncate">
                {formatCurrencyBDT(grandTotal.achieved)}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold truncate block">
                {reportData.date_range_label}
              </span>
            </Card>

            <Card className="p-2.5 sm:p-3 bg-blue-50/70 border-blue-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block truncate">
                Achievement %
              </span>
              <span className="text-sm sm:text-base font-extrabold text-blue-900 font-mono mt-0.5 block">
                {grandTotal.achievement_pct}%
              </span>
              <span className="text-[10px] text-blue-600 font-semibold">Of target achieved</span>
            </Card>

            <Card className="p-2.5 sm:p-3 bg-rose-50/70 border-rose-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 block truncate">
                Total Dues
              </span>
              <span className="text-sm sm:text-base font-extrabold text-rose-800 font-mono mt-0.5 block truncate">
                {formatCurrencyBDT(grandTotal.dues)}
              </span>
              <span className="text-[10px] text-rose-600">Pending target</span>
            </Card>

            <Card className="p-2.5 sm:p-3 bg-amber-50/70 border-amber-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block truncate">
                New Sales Coll.
              </span>
              <span className="text-sm sm:text-base font-extrabold text-amber-900 font-mono mt-0.5 block truncate">
                {formatCurrencyBDT(grandTotal.new_sales)}
              </span>
              <span className="text-[10px] text-amber-700">Cash / Down Payment</span>
            </Card>

            <Card className="p-2.5 sm:p-3 bg-indigo-50/70 border-indigo-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block truncate">
                Total Collection
              </span>
              <span className="text-sm sm:text-base font-extrabold text-indigo-900 font-mono mt-0.5 block truncate">
                {formatCurrencyBDT(grandTotal.total_collection)}
              </span>
              <span className="text-[10px] text-indigo-700">New Sales + EMI</span>
            </Card>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: Mobile Cards View (Optimized for Small Screens)              */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {viewMode === "cards" && reportData && (
          <div className="space-y-4">
            {reportData.teams.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                No collection records found.
              </div>
            ) : (
              reportData.teams.map((tGroup) => (
                <div
                  key={tGroup.team_id ?? tGroup.team_name}
                  className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden space-y-3 p-3 sm:p-4"
                >
                  {/* Director Team Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 bg-slate-50 -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 p-3 sm:p-4">
                    <div>
                      <h2 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-1.5 uppercase tracking-wide">
                        <Layers className="w-4 h-4 text-emerald-700 shrink-0" />
                        {tGroup.team_name}
                      </h2>
                      {tGroup.director_name && (
                        <p className="text-[11px] text-slate-500 font-medium">
                          Director: {tGroup.director_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Team Total</span>
                      <span className="font-extrabold text-emerald-800 text-xs sm:text-sm font-mono">
                        {formatCurrencyBDT(tGroup.totals.total_collection)}
                      </span>
                    </div>
                  </div>

                  {/* C.O. Groups */}
                  <div className="space-y-3 pt-1">
                    {tGroup.co_groups.map((coGroup, cgIdx) => {
                      const groupKey = `${tGroup.team_name}-${coGroup.co_name}-${cgIdx}`;
                      const isCollapsed = !!collapsedGroups[groupKey];

                      return (
                        <div
                          key={groupKey}
                          className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50"
                        >
                          {/* Accordion Header */}
                          <div
                            onClick={() => toggleGroup(groupKey)}
                            className="p-3 bg-slate-100 hover:bg-slate-200/80 cursor-pointer flex items-center justify-between gap-2 transition"
                          >
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                              ) : (
                                <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <div>
                                <span className="font-bold text-slate-900 text-xs block">
                                  {coGroup.co_name}
                                </span>
                                {coGroup.co_designation && (
                                  <span className="text-[10px] text-slate-500">
                                    {coGroup.co_designation} • {coGroup.rows.length} {coGroup.rows.length === 1 ? "member" : "members"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono font-bold text-emerald-800 block">
                                {formatCurrencyBDT(coGroup.totals.total_collection)}
                              </span>
                              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                {coGroup.totals.achievement_pct}% Achieved
                              </span>
                            </div>
                          </div>

                          {/* Member Cards */}
                          {!isCollapsed && (
                            <div className="p-2 sm:p-3 space-y-2.5 divide-y divide-slate-100">
                              {coGroup.rows.map((row) => (
                                <div
                                  key={row.employee_id ?? `${row.name}-${row.sl_no}`}
                                  className={`p-2.5 rounded-lg border transition ${
                                    row.is_manager
                                      ? "bg-emerald-50/40 border-emerald-200 shadow-2xs"
                                      : "bg-white border-slate-200"
                                  }`}
                                >
                                  {/* Row Top: Serial + Name + Position */}
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                          #{row.sl_no}
                                        </span>
                                        <span className={`text-xs ${row.is_manager ? "font-extrabold text-slate-950" : "font-bold text-slate-900"}`}>
                                          {row.name}
                                        </span>
                                        {row.is_manager && (
                                          <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded uppercase">
                                            Leader / C.O.
                                          </span>
                                        )}
                                      </div>
                                      {row.position && (
                                        <p className="text-[10px] text-slate-500 mt-0.5">{row.position}</p>
                                      )}
                                    </div>

                                    {/* Client & Share badges */}
                                    <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200" title="Clients">
                                        {row.client} Cl
                                      </span>
                                      <span className="bg-slate-100 text-emerald-800 px-1.5 py-0.5 rounded border border-slate-200 font-semibold" title="Shares">
                                        {row.share} Sh
                                      </span>
                                    </div>
                                  </div>

                                  {/* Row Metrics Grid */}
                                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 mt-2 border-t border-slate-100">
                                    <div className="p-1.5 bg-slate-50 rounded border border-slate-100">
                                      <span className="text-[9px] uppercase font-bold text-slate-500 block">Target</span>
                                      <span className="font-mono font-bold text-slate-900 text-[11px]">
                                        {row.mgt_given_target > 0 ? formatCurrencyBDT(row.mgt_given_target) : "-"}
                                      </span>
                                    </div>

                                    <div className="p-1.5 bg-emerald-50/60 rounded border border-emerald-100">
                                      <span className="text-[9px] uppercase font-bold text-emerald-800 block">Achieved</span>
                                      <span className="font-mono font-bold text-emerald-900 text-[11px]">
                                        {row.achieved > 0 ? formatCurrencyBDT(row.achieved) : "-"}
                                      </span>
                                      <span className="text-[9px] font-semibold text-emerald-700 block mt-0.5">
                                        {row.achievement_pct}%
                                      </span>
                                    </div>

                                    <div className="p-1.5 bg-rose-50/60 rounded border border-rose-100">
                                      <span className="text-[9px] uppercase font-bold text-rose-800 block">Dues</span>
                                      <span className="font-mono font-bold text-rose-900 text-[11px]">
                                        {row.dues > 0 ? formatCurrencyBDT(row.dues) : "-"}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Row Collection Breakdown */}
                                  <div className="flex items-center justify-between text-[11px] pt-2 mt-1 border-t border-slate-100 text-slate-600">
                                    <div className="flex items-center gap-3">
                                      {row.new_sales > 0 && (
                                        <span>New: <b className="font-mono text-slate-800">{formatCurrencyBDT(row.new_sales)}</b></span>
                                      )}
                                      {row.emi > 0 && (
                                        <span>EMI: <b className="font-mono text-slate-800">{formatCurrencyBDT(row.emi)}</b></span>
                                      )}
                                      {row.token > 0 && (
                                        <span>Token: <b className="font-mono text-slate-800">{row.token}</b></span>
                                      )}
                                    </div>

                                    <div>
                                      <span className="text-[10px] text-slate-500 mr-1">Total:</span>
                                      <span className="font-mono font-black text-emerald-800 text-xs">
                                        {row.total_collection > 0 ? formatCurrencyBDT(row.total_collection) : "৳ 0"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {/* C.O Total Box */}
                              <div className="p-2.5 bg-slate-200/90 rounded-lg border border-slate-300 font-bold flex items-center justify-between text-xs text-slate-900">
                                <div>
                                  <span className="uppercase tracking-wider font-extrabold text-[11px] block">
                                    C.O Total
                                  </span>
                                  <span className="text-[10px] text-slate-600 font-mono">
                                    {coGroup.totals.client} Clients • {coGroup.totals.share} Shares
                                  </span>
                                </div>

                                <div className="text-right">
                                  <span className="font-mono font-black text-slate-950 text-sm block">
                                    {formatCurrencyBDT(coGroup.totals.total_collection)}
                                  </span>
                                  <span className="text-[10px] text-blue-800 font-semibold">
                                    {coGroup.totals.achievement_pct}% of Target
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Team Total Footer Card */}
                    <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg flex items-center justify-between text-xs font-extrabold text-emerald-950 mt-2">
                      <div>
                        <span className="uppercase tracking-wider block font-black">
                          {tGroup.team_name} Total
                        </span>
                        <span className="text-[11px] text-emerald-700 font-mono font-medium">
                          Target: {formatCurrencyBDT(tGroup.totals.mgt_given_target)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-black text-emerald-900 text-sm sm:text-base block">
                          {formatCurrencyBDT(tGroup.totals.total_collection)}
                        </span>
                        <span className="text-[10px] text-emerald-700">
                          {tGroup.totals.achievement_pct}% Achieved
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Grand Total Mobile Card */}
            {grandTotal && (
              <div className="p-4 bg-slate-900 text-white rounded-xl shadow-md border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      All Teams Aggregate
                    </span>
                    <h3 className="font-black text-base uppercase text-emerald-300">
                      Grand Total
                    </h3>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Total Collection</span>
                    <span className="text-lg font-black font-mono text-emerald-300">
                      {formatCurrencyBDT(grandTotal.total_collection)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-slate-800">
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block">Total Target</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formatCurrencyBDT(grandTotal.mgt_given_target)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block">Total Achieved</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatCurrencyBDT(grandTotal.achieved)} ({grandTotal.achievement_pct}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-400 block">Remaining Dues</span>
                    <span className="font-mono font-bold text-rose-300">
                      {formatCurrencyBDT(grandTotal.dues)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* VIEW 2: Spreadsheet Table View (with Sticky First 2 Freeze Columns)  */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {viewMode === "table" && (
          <Card className="border-slate-300 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/90 border-b border-slate-200 py-3 px-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700 shrink-0" />
                  <span>Executive Wise Collection Sheet - {reportData?.date_display ?? (reportDate || "Today")}</span>
                </CardTitle>
                <span className="text-[11px] text-slate-500 font-medium">
                  Swipe horizontally • Employee Name is frozen on the left
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold text-[10px] sm:text-xs">
                  {reportData?.date_range_label}
                </span>
              </div>
            </CardHeader>

            <div className="overflow-x-auto relative">
              <table className="w-full border-collapse text-[11px] font-sans">
                <thead>
                  <tr className="bg-slate-200/90 text-slate-800 border-y border-slate-300 uppercase tracking-wider font-extrabold text-[10px]">
                    {/* Freeze Column 1: SL.No */}
                    <th className="sticky left-0 z-30 bg-slate-200 py-2.5 px-2 border-r border-slate-300 text-center w-10">
                      SL
                    </th>
                    {/* Freeze Column 2: Employee Name with shadow */}
                    <th className="sticky left-10 z-30 bg-slate-200 py-2.5 px-3 border-r-2 border-slate-300 shadow-[2px_0_5px_rgba(0,0,0,0.06)] text-left min-w-[170px]">
                      Team / Employee Name
                    </th>
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
                          <td colSpan={14} className="py-2 px-3 text-xs bg-gradient-to-r from-slate-200 via-slate-100 to-white sticky left-0 z-20">
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
                                  row.is_manager ? "font-bold text-slate-900 bg-slate-50/50" : "text-slate-700 bg-white"
                                }`}
                              >
                                {/* Freeze Column 1: SL */}
                                <td className={`sticky left-0 z-10 py-1.5 px-2 border-r border-slate-200 text-center font-mono text-[11px] ${
                                  row.is_manager ? "bg-slate-50" : "bg-white"
                                }`}>
                                  {row.sl_no}
                                </td>
                                {/* Freeze Column 2: Name */}
                                <td className={`sticky left-10 z-10 py-1.5 px-3 border-r-2 border-slate-300 shadow-[2px_0_5px_rgba(0,0,0,0.06)] ${
                                  row.is_manager ? "bg-slate-50" : "bg-white"
                                }`}>
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
                            <tr className="bg-slate-200/90 border-b-2 border-slate-300 font-extrabold text-slate-900">
                              <td className="sticky left-0 z-10 bg-slate-200 py-1.5 px-2 border-r border-slate-300 text-center"></td>
                              <td className="sticky left-10 z-10 bg-slate-200 py-1.5 px-3 border-r-2 border-slate-300 shadow-[2px_0_5px_rgba(0,0,0,0.06)] text-right font-black uppercase text-[10px]">
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
                          <td className="sticky left-0 z-10 bg-slate-300 py-2 px-2 border-r border-slate-400 text-center"></td>
                          <td className="sticky left-10 z-10 bg-slate-300 py-2 px-3 border-r-2 border-slate-400 shadow-[2px_0_5px_rgba(0,0,0,0.06)] text-right uppercase text-[11px] tracking-wide">
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
                      <td className="sticky left-0 z-10 bg-slate-800 py-3 px-2 border-r border-slate-700 text-center"></td>
                      <td className="sticky left-10 z-10 bg-slate-800 py-3 px-3 border-r-2 border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.06)] text-right uppercase tracking-wider font-extrabold text-[11px]">
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
        )}
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
