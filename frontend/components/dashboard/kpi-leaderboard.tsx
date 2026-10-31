"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Medal,
  Award,
  PhoneCall,
  PhoneForwarded,
  MapPin,
  Banknote,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Skeleton, Button } from "@/components/ui";
import { PerformanceLeaderboardResponse, EmployeeLeaderboardItem } from "@/types";
import { api } from "@/lib/api";
import { formatBDT, formatEmployeeId } from "@/lib/utils";

interface KPILeaderboardProps {
  startDate: string;
  endDate: string;
  employeeId?: number | "all";
  title?: string;
  subtitle?: string;
}

export function KPILeaderboard({
  startDate,
  endDate,
  employeeId,
  title = "Daily KPI Performance & Team Leaderboard",
  subtitle = "Real-time target achievement rates, champion highlights, and employee rankings",
}: KPILeaderboardProps) {
  const [data, setData] = useState<PerformanceLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "dialed" | "connected" | "visits" | "collections">("score");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const handleSortChange = (key: "score" | "dialed" | "connected" | "visits" | "collections") => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  };

  useEffect(() => {
    let active = true;
    if (!startDate || !endDate) return;

    setLoading(true);
    setError(null);

    const empParam = employeeId && employeeId !== "all" ? Number(employeeId) : undefined;
    api.dashboard
      .getLeaderboard({
        start_date: startDate,
        end_date: endDate,
        employee_id: empParam,
      })
      .then((res) => {
        if (active) {
          setData(res);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Leaderboard fetch error:", err);
          setError("Failed to load KPI performance leaderboard.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [startDate, endDate, employeeId]);

  // Filtered & sorted employees
  const sortedRankings = useMemo(() => {
    if (!data?.rankings) return [];
    let list = [...data.rankings];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.employee_name.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let diff = 0;
      if (sortBy === "dialed") {
        diff = b.dialed_calls - a.dialed_calls;
        if (diff === 0) diff = b.dialed_pct - a.dialed_pct;
      } else if (sortBy === "connected") {
        diff = b.connected_calls - a.connected_calls;
        if (diff === 0) diff = b.connected_pct - a.connected_pct;
      } else if (sortBy === "visits") {
        diff = b.outdoor_visits - a.outdoor_visits;
        if (diff === 0) diff = b.outdoor_pct - a.outdoor_pct;
      } else if (sortBy === "collections") {
        diff = b.actual_collections - a.actual_collections;
        if (diff === 0) diff = b.collection_pct - a.collection_pct;
      } else {
        diff = b.overall_score_pct - a.overall_score_pct;
      }

      // Tie breaker
      if (diff === 0) {
        diff = b.overall_score_pct - a.overall_score_pct;
        if (diff === 0) diff = b.dialed_calls - a.dialed_calls;
      }

      return sortOrder === "desc" ? diff : -diff;
    });

    return list;
  }, [data, searchQuery, sortBy, sortOrder]);

  const getRankBadge = (emp: EmployeeLeaderboardItem) => {
    const hasActivity =
      emp.overall_score_pct > 0 ||
      emp.dialed_calls > 0 ||
      emp.connected_calls > 0 ||
      emp.actual_collections > 0 ||
      emp.outdoor_visits > 0;

    // Only award gold, silver, bronze medals if the employee actually has positive KPI activity
    if (hasActivity && emp.rank === 1) {
      return (
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 font-extrabold text-sm shadow-xs border border-amber-300"
          title="1st Place (Top Performer)"
        >
          🥇
        </span>
      );
    }
    if (hasActivity && emp.rank === 2) {
      return (
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-800 font-extrabold text-sm shadow-xs border border-slate-300"
          title="2nd Place"
        >
          🥈
        </span>
      );
    }
    if (hasActivity && emp.rank === 3) {
      return (
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-900 font-extrabold text-sm shadow-xs border border-amber-600/30"
          title="3rd Place"
        >
          🥉
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs border ${
          hasActivity
            ? "bg-slate-100 text-slate-700 border-slate-300"
            : "bg-slate-50 text-slate-400 border-slate-200 font-normal"
        }`}
        title={`Rank #${emp.rank}`}
      >
        #{emp.rank}
      </span>
    );
  };

  const getStatusBadge = (status: EmployeeLeaderboardItem["status"], score: number) => {
    switch (status) {
      case "achieved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Target Achieved ({score}%)
          </span>
        );
      case "on_track":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
            <TrendingUp className="w-3 h-3 text-teal-600" /> On Track ({score}%)
          </span>
        );
      case "needs_attention":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> Needs Attention ({score}%)
          </span>
        );
      case "behind_pace":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <Flame className="w-3 h-3 text-rose-500" /> Behind Pace ({score}%)
          </span>
        );
    }
  };

  const renderProgressBar = (pct: number) => {
    const cappedPct = Math.min(100, Math.max(0, pct));
    let color = "bg-rose-500";
    if (pct >= 100) color = "bg-emerald-600";
    else if (pct >= 75) color = "bg-teal-500";
    else if (pct >= 50) color = "bg-amber-500";

    return (
      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${cappedPct}%` }} />
      </div>
    );
  };

  const isPersonalView = data && data.rankings.length === 1 && (!data.champions || data.champions.length === 0);
  const personal = isPersonalView ? data.rankings[0] : null;

  if (!loading && isPersonalView && personal) {
    return (
      <Card className="border border-slate-200/80 shadow-xs overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                <span>My Daily KPI Targets & Progress</span>
                <span className="font-mono text-xs font-bold bg-emerald-900/90 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded-md">
                  {formatEmployeeId(personal.employee_id)}
                </span>
              </CardTitle>
              <p className="text-xs text-slate-300 mt-0.5">
                Your assigned daily targets and real-time achievement progress today
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              {getStatusBadge(personal.status, personal.overall_score_pct)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Dialed */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-blue-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Dialed Calls</span>
                <div className="p-1.5 rounded-md bg-blue-100 text-blue-700">
                  <PhoneCall className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">
                  {personal.dialed_calls}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {personal.dialed_target}</span>
                </span>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {personal.dialed_pct}%
                </span>
              </div>
              {renderProgressBar(personal.dialed_pct)}
              {personal.call_reduction && personal.call_reduction > 0 ? (
                <div className="pt-1 flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 font-medium">
                    {personal.dialed_calls >= personal.dialed_target
                      ? "Target reached! 🎉"
                      : `${personal.dialed_target - personal.dialed_calls} calls remaining`}
                  </span>
                  <span
                    className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 cursor-help"
                    title={`Dialed target adjusted from ${personal.base_dialed_target || personal.dialed_target + personal.call_reduction} to ${personal.dialed_target} (-${personal.call_reduction} calls credited for outdoor/indoor meetings)`}
                  >
                    -{personal.call_reduction} mtg credit
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 pt-1 font-medium">
                  {personal.dialed_calls >= personal.dialed_target
                    ? "Target reached! 🎉"
                    : `${personal.dialed_target - personal.dialed_calls} calls remaining`}
                </p>
              )}
            </div>

            {/* Connected */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-emerald-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Connected Calls</span>
                <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-700">
                  <PhoneForwarded className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">
                  {personal.connected_calls}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {personal.connected_target}</span>
                </span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {personal.connected_pct}%
                </span>
              </div>
              {renderProgressBar(personal.connected_pct)}
              <p className="text-[11px] text-slate-500 pt-1 font-medium">
                {personal.connected_calls >= personal.connected_target
                  ? "Target reached! 🎉"
                  : `${personal.connected_target - personal.connected_calls} connected calls remaining`}
              </p>
            </div>

            {/* Outdoor Visits */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-purple-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Outdoor Client Visits</span>
                <div className="p-1.5 rounded-md bg-purple-100 text-purple-700">
                  <MapPin className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">
                  {personal.outdoor_visits}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {personal.outdoor_target}</span>
                </span>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  {personal.outdoor_pct}%
                </span>
              </div>
              {renderProgressBar(personal.outdoor_pct)}
              <p className="text-[11px] text-slate-500 pt-1 font-medium">
                {personal.outdoor_visits >= personal.outdoor_target
                  ? "Target reached! 🎉"
                  : `${personal.outdoor_target - personal.outdoor_visits} client visits remaining`}
              </p>
            </div>

            {/* Collections */}
            <div className="p-4 rounded-xl border border-slate-200/80 bg-gradient-to-br from-amber-50/50 to-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Collections (BDT)</span>
                <div className="p-1.5 rounded-md bg-amber-100 text-amber-700">
                  <Banknote className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-extrabold text-slate-900 truncate">
                  {formatBDT(personal.actual_collections)}
                </span>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 ml-1">
                  {personal.collection_pct}%
                </span>
              </div>
              <div className="text-[10px] text-slate-500 truncate flex items-center flex-wrap gap-1">
                <span>Target: {formatBDT(personal.collection_target)}</span>
                {personal.carry_forward_deficit != null && personal.carry_forward_deficit > 0 && (
                  <span
                    className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded"
                    title={`Base daily quota: ${formatBDT(personal.base_collection_target || 0)} + Unmet shortfall carry-forward: ${formatBDT(personal.carry_forward_deficit)}`}
                  >
                    +{formatBDT(personal.carry_forward_deficit)} CF
                  </span>
                )}
              </div>
              {personal.monthly_collection_target != null && personal.monthly_collection_target > 0 && (
                <div className="text-[10px] text-slate-500 font-medium">
                  Monthly Target: {formatBDT(personal.monthly_collection_target)}
                </div>
              )}
              {renderProgressBar(personal.collection_pct)}
              <p className="text-[11px] text-slate-500 pt-1 font-medium truncate">
                {personal.actual_collections >= personal.collection_target
                  ? "Target reached! 🎉"
                  : `${formatBDT(personal.collection_target - personal.actual_collections)} remaining`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200/80 shadow-xs overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold text-white">
              {title}
            </CardTitle>
            <p className="text-xs text-slate-300 mt-0.5">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {data && (
              <div className="bg-white/10 backdrop-blur-xs px-3 py-1 rounded-md border border-white/20 text-xs">
                <span className="text-slate-300">Team Target Score: </span>
                <span className="font-extrabold text-amber-300">{data.team_overall_score_pct}%</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* ── Champions Row ─────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-5 w-28 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : data?.champions && data.champions.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Category Champions (Highest Performer)
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.champions.map((champ, idx) => {
                const icons = [
                  <PhoneCall key="call" className="w-4 h-4 text-blue-600" />,
                  <PhoneForwarded key="conn" className="w-4 h-4 text-emerald-600" />,
                  <MapPin key="visit" className="w-4 h-4 text-purple-600" />,
                  <Banknote key="cash" className="w-4 h-4 text-amber-600" />,
                ];
                const bgGradients = [
                  "from-blue-50 to-indigo-50/40 border-blue-200/80",
                  "from-emerald-50 to-teal-50/40 border-emerald-200/80",
                  "from-purple-50 to-pink-50/40 border-purple-200/80",
                  "from-amber-50 to-yellow-50/40 border-amber-200/80",
                ];

                return (
                  <div
                    key={champ.title}
                    className={`p-3 rounded-lg border bg-gradient-to-br ${bgGradients[idx % 4]} flex flex-col justify-between shadow-xs`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        {champ.title}
                      </span>
                      <div className="p-1 rounded bg-white shadow-2xs">
                        {icons[idx % 4]}
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs font-bold text-slate-900 truncate" title={champ.employee_name}>
                        {champ.employee_name}
                      </p>
                      <p className="text-[11px] font-extrabold text-slate-700 mt-0.5 truncate">
                        {champ.value}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {champ.metric}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-2 font-medium">
              <Award className="w-4 h-4 text-slate-400" />
              Category Champions will appear once daily calls or collections are recorded for this period.
            </span>
          </div>
        )}

        {/* ── Table Filter & Controls ────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee in rankings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0">
            <span className="text-[11px] text-slate-500 font-semibold shrink-0">Sort by:</span>
            {[
              { key: "score", label: "Overall Score" },
              { key: "dialed", label: "Dialed" },
              { key: "connected", label: "Connected" },
              { key: "visits", label: "Visits" },
              { key: "collections", label: "Collections" },
            ].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => handleSortChange(s.key as any)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                  sortBy === s.key
                    ? "bg-emerald-800 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span>{s.label}</span>
                {sortBy === s.key && (
                  <span className="text-[10px] font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detailed Target vs Actual Leaderboard Table (Desktop) ──── */}
        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[11px] font-bold select-none">
                <th className="py-3 px-3 text-center w-12">Rank</th>
                <th className="py-3 px-3">Employee</th>
                <th
                  onClick={() => handleSortChange("dialed")}
                  className={`py-3 px-3 min-w-[140px] cursor-pointer hover:bg-slate-100 transition-colors ${
                    sortBy === "dialed" ? "bg-emerald-50 text-emerald-950 font-extrabold" : ""
                  }`}
                  title="Click to sort by Dialed Calls"
                >
                  <div className="flex items-center justify-between">
                    <span>Dialed Target</span>
                    {sortBy === "dialed" ? (
                      <span className="text-emerald-700 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange("connected")}
                  className={`py-3 px-3 min-w-[140px] cursor-pointer hover:bg-slate-100 transition-colors ${
                    sortBy === "connected" ? "bg-emerald-50 text-emerald-950 font-extrabold" : ""
                  }`}
                  title="Click to sort by Connected Calls"
                >
                  <div className="flex items-center justify-between">
                    <span>Connected Target</span>
                    {sortBy === "connected" ? (
                      <span className="text-emerald-700 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange("visits")}
                  className={`py-3 px-3 min-w-[120px] cursor-pointer hover:bg-slate-100 transition-colors ${
                    sortBy === "visits" ? "bg-emerald-50 text-emerald-950 font-extrabold" : ""
                  }`}
                  title="Click to sort by Outdoor Visits"
                >
                  <div className="flex items-center justify-between">
                    <span>Outdoor Visits</span>
                    {sortBy === "visits" ? (
                      <span className="text-emerald-700 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange("collections")}
                  className={`py-3 px-3 min-w-[150px] cursor-pointer hover:bg-slate-100 transition-colors ${
                    sortBy === "collections" ? "bg-emerald-50 text-emerald-950 font-extrabold" : ""
                  }`}
                  title="Click to sort by Collections"
                >
                  <div className="flex items-center justify-between">
                    <span>Collections Target</span>
                    {sortBy === "collections" ? (
                      <span className="text-emerald-700 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSortChange("score")}
                  className={`py-3 px-3 text-center min-w-[130px] cursor-pointer hover:bg-slate-100 transition-colors ${
                    sortBy === "score" ? "bg-emerald-50 text-emerald-950 font-extrabold" : ""
                  }`}
                  title="Click to sort by Overall KPI Score"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Overall KPI Status</span>
                    {sortBy === "score" ? (
                      <span className="text-emerald-700 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-3 text-right">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3 px-3 text-center"><Skeleton className="h-5 w-5 mx-auto rounded-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3"><Skeleton className="h-6 w-full" /></td>
                    <td className="py-3 px-3 text-center"><Skeleton className="h-5 w-24 mx-auto" /></td>
                    <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-rose-500">
                    {error}
                  </td>
                </tr>
              ) : sortedRankings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No employee performance data found for this period.
                  </td>
                </tr>
              ) : (
                sortedRankings.map((emp, index) => (
                  <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Dynamic Rank Badge based on official rank and activity */}
                    <td className="py-3 px-3 text-center">
                      {getRankBadge(emp)}
                    </td>

                    {/* Employee info */}
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">{emp.employee_name}</span>
                          <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1 py-0.2 rounded shadow-2xs">
                            {formatEmployeeId(emp.employee_id)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">@{emp.username}</div>
                      </div>
                    </td>

                    {/* Dialed Target vs Actual */}
                    <td className={`py-3 px-3 ${sortBy === "dialed" ? "bg-emerald-50/40" : ""}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {emp.dialed_calls} <span className="text-slate-400 font-normal">/ {emp.dialed_target}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.dialed_pct}%
                        </span>
                      </div>
                      {renderProgressBar(emp.dialed_pct)}
                      {emp.call_reduction && emp.call_reduction > 0 ? (
                        <div className="mt-1 flex items-center justify-end">
                          <span
                            className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 cursor-help"
                            title={`Base target: ${emp.base_dialed_target ?? (emp.dialed_target + emp.call_reduction)} calls. Credited -${emp.call_reduction} calls (-70 per outdoor, -35 per indoor CX).`}
                          >
                            -{emp.call_reduction} credit
                          </span>
                        </div>
                      ) : null}
                    </td>

                    {/* Connected Target vs Actual */}
                    <td className={`py-3 px-3 ${sortBy === "connected" ? "bg-emerald-50/40" : ""}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {emp.connected_calls} <span className="text-slate-400 font-normal">/ {emp.connected_target}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.connected_pct}%
                        </span>
                      </div>
                      {renderProgressBar(emp.connected_pct)}
                    </td>

                    {/* Outdoor Visits Target vs Actual */}
                    <td className={`py-3 px-3 ${sortBy === "visits" ? "bg-emerald-50/40" : ""}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {emp.outdoor_visits} <span className="text-slate-400 font-normal">/ {emp.outdoor_target}</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.outdoor_pct}%
                        </span>
                      </div>
                      {renderProgressBar(emp.outdoor_pct)}
                    </td>

                    {/* Collections Target vs Actual */}
                    <td className={`py-3 px-3 ${sortBy === "collections" ? "bg-emerald-50/40" : ""}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {formatBDT(emp.actual_collections)}
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                          {emp.collection_pct}%
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate flex items-center flex-wrap gap-1">
                        <span>Target: {formatBDT(emp.collection_target)}</span>
                        {emp.carry_forward_deficit != null && emp.carry_forward_deficit > 0 && (
                          <span
                            className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 py-0.2 rounded"
                            title={`Base quota: ${formatBDT(emp.base_collection_target || 0)} + Unmet deficit carry-forward: ${formatBDT(emp.carry_forward_deficit)}`}
                          >
                            +{formatBDT(emp.carry_forward_deficit)} CF
                          </span>
                        )}
                      </div>
                      {emp.monthly_collection_target != null && emp.monthly_collection_target > 0 && (
                        <div className="text-[9px] text-slate-400 truncate">
                          Mo. Target: {formatBDT(emp.monthly_collection_target)}
                        </div>
                      )}
                      {renderProgressBar(emp.collection_pct)}
                    </td>

                    {/* Overall KPI Status */}
                    <td className={`py-3 px-3 text-center ${sortBy === "score" ? "bg-emerald-50/40" : ""}`}>
                      {getStatusBadge(emp.status, emp.overall_score_pct)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/reports?employee_id=${emp.employee_id}&start_date=${startDate}&end_date=${endDate}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                        title="View employee reports"
                      >
                        Reports <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Mobile Native App Ranking Cards (Mobile Screens) ──────── */}
        <div className="block md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-28 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))
          ) : error ? (
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-center text-xs text-rose-600 font-medium">
              {error}
            </div>
          ) : sortedRankings.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
              No employee performance data found for this period.
            </div>
          ) : (
            sortedRankings.map((emp, index) => (
              <div
                key={emp.employee_id}
                className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-3 hover:border-slate-300 transition-colors"
              >
                {/* Header: Rank, Employee Name, Pace Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0">{getRankBadge(emp)}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {emp.employee_name}
                        </span>
                        <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                          {formatEmployeeId(emp.employee_id)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">@{emp.username}</p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {getStatusBadge(emp.status, emp.overall_score_pct)}
                  </div>
                </div>

                {/* 2x2 Metric Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Dialed */}
                  <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-blue-900 flex items-center gap-1">
                        <PhoneCall className="w-3 h-3 text-blue-600 shrink-0" />
                        Dialed
                      </span>
                      <span className="text-[10px] font-extrabold text-blue-700 bg-blue-100/70 px-1.5 py-0.2 rounded-full">
                        {emp.dialed_pct}%
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {emp.dialed_calls}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">/ {emp.dialed_target}</span>
                      </div>
                      {renderProgressBar(emp.dialed_pct)}
                      {emp.call_reduction && emp.call_reduction > 0 ? (
                        <div className="mt-1 flex items-center justify-between text-[9px]">
                          <span className="text-slate-500">Mtg credit:</span>
                          <span
                            className="font-bold text-amber-700 bg-amber-100/70 px-1 py-0.2 rounded cursor-help"
                            title={`Base: ${emp.base_dialed_target ?? (emp.dialed_target + emp.call_reduction)} calls (-${emp.call_reduction} calls credited)`}
                          >
                            -{emp.call_reduction} calls
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Connected */}
                  <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-emerald-900 flex items-center gap-1">
                        <PhoneForwarded className="w-3 h-3 text-emerald-600 shrink-0" />
                        Connected
                      </span>
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded-full">
                        {emp.connected_pct}%
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {emp.connected_calls}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">/ {emp.connected_target}</span>
                      </div>
                      {renderProgressBar(emp.connected_pct)}
                    </div>
                  </div>

                  {/* Visits */}
                  <div className="p-2.5 rounded-lg bg-purple-50/50 border border-purple-100 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-purple-900 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-purple-600 shrink-0" />
                        Visits
                      </span>
                      <span className="text-[10px] font-extrabold text-purple-700 bg-purple-100/70 px-1.5 py-0.2 rounded-full">
                        {emp.outdoor_pct}%
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {emp.outdoor_visits}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">/ {emp.outdoor_target}</span>
                      </div>
                      {renderProgressBar(emp.outdoor_pct)}
                    </div>
                  </div>

                  {/* Collections */}
                  <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-100 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                        <Banknote className="w-3 h-3 text-amber-600 shrink-0" />
                        Collections
                      </span>
                      <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100/70 px-1.5 py-0.2 rounded-full">
                        {emp.collection_pct}%
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {formatBDT(emp.actual_collections)}
                      </div>
                      {renderProgressBar(emp.collection_pct)}
                    </div>
                  </div>
                </div>

                {/* Target Breakdown & Carry-Forward Deficit */}
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-slate-500 font-medium">Period Target:</span>
                    <span className="font-bold text-slate-800">
                      {formatBDT(emp.collection_target)}
                    </span>
                  </div>

                  {emp.carry_forward_deficit != null && emp.carry_forward_deficit > 0 && (
                    <div className="flex items-center justify-between flex-wrap gap-1 text-[10px]">
                      <span className="text-amber-800 font-medium">Unmet Shortfall:</span>
                      <span
                        className="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded border border-amber-300"
                        title={`Base quota: ${formatBDT(emp.base_collection_target || 0)} + Shortfall: ${formatBDT(emp.carry_forward_deficit)}`}
                      >
                        +{formatBDT(emp.carry_forward_deficit)} Carry-Forward
                      </span>
                    </div>
                  )}

                  {emp.monthly_collection_target != null && emp.monthly_collection_target > 0 && (
                    <div className="flex items-center justify-between flex-wrap gap-1 text-slate-500 pt-0.5 border-t border-slate-200/60 text-[10px]">
                      <span>Monthly Target:</span>
                      <span className="font-semibold text-slate-700">
                        {formatBDT(emp.monthly_collection_target)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Link to Reports */}
                <Link
                  href={`/reports?employee_id=${emp.employee_id}&start_date=${startDate}&end_date=${endDate}`}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold text-xs border border-slate-200 transition-colors"
                >
                  <span>View Reports</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
