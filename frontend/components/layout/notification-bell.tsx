"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  Calendar,
  FileText,
  Banknote,
  X,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Megaphone,
} from "lucide-react";
import { api } from "@/lib/api";
import { ReminderItem, ReminderSummary } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useNoticesBadge } from "@/lib/use-notices-badge";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [summary, setSummary] = useState<ReminderSummary | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const { isSubAdmin } = useAuth();
  const {
    unreadNotices,
    unreadCount,
    pendingReviewCount,
    pendingReviewNotices,
    markAllAsRead: markAllNoticesAsRead,
    markOneAsRead: markOneNoticeAsRead,
  } = useNoticesBadge();

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load dismissed IDs from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("sunset_dismissed_reminders");
        if (stored) {
          setDismissedIds(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const fetchReminders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.reminders.get();
      setReminders(res.reminders || []);
      setSummary(res.summary || null);
    } catch {
      // silently fail if network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    // Poll every 60 seconds
    const interval = setInterval(fetchReminders, 60000);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleDismiss = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sunset_dismissed_reminders", JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  };

  const handleClearAll = () => {
    const allIds = reminders.map((r) => r.id);
    const updated = Array.from(new Set([...dismissedIds, ...allIds]));
    setDismissedIds(updated);
    markAllNoticesAsRead();
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sunset_dismissed_reminders", JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  };

  // Filter active reminders
  const activeReminders = reminders.filter((r) => !dismissedIds.includes(r.id));
  const activeCount = activeReminders.length;
  const totalUnread = activeCount + unreadCount + (isSubAdmin ? pendingReviewCount : 0);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-600/20"
        title="Reminders & Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {totalUnread > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-rose-600 rounded-full shadow-xs animate-pulse">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {/* Dropdown Drawer */}
      {isOpen && (
        <>
          {/* Mobile Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-40 sm:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="fixed sm:absolute top-14 sm:top-full left-2 right-2 sm:left-auto sm:right-0 mt-1 sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1rem)] sm:max-w-none max-h-[85vh] sm:max-h-[540px] flex flex-col bg-white rounded-2xl sm:rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-green-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Reminders & Alerts
                </h3>
                {totalUnread > 0 && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {totalUnread} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {totalUnread > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="sm:hidden p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200/60"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

          {/* Sub-admin Notice Approvals Banner */}
          {isSubAdmin && pendingReviewNotices.length > 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-3.5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-950">
                    {pendingReviewNotices.length} Notice{pendingReviewNotices.length > 1 ? "s" : ""} Pending Review
                  </p>
                  <p className="text-[10px] text-amber-700">Sub-Admin approval required</p>
                </div>
              </div>
              <Link
                href="/notices"
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold text-amber-900 bg-amber-200/70 hover:bg-amber-200 px-2.5 py-1 rounded-md transition-colors"
              >
                Review →
              </Link>
            </div>
          )}

          {/* Unread Company Notices */}
          {unreadNotices.length > 0 && (
            <div className="bg-rose-50/60 border-b border-rose-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-rose-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-900">
                    New Notice{unreadNotices.length > 1 ? "s" : ""} ({unreadNotices.length})
                  </span>
                </div>
                <Link
                  href="/notices"
                  onClick={() => {
                    setIsOpen(false);
                    markAllNoticesAsRead();
                  }}
                  className="text-[11px] font-bold text-rose-700 hover:text-rose-900 hover:underline"
                >
                  View All →
                </Link>
              </div>
              <div className="space-y-1.5">
                {unreadNotices.slice(0, 2).map((notice) => (
                  <Link
                    key={notice.id}
                    href="/notices"
                    onClick={() => {
                      setIsOpen(false);
                      markOneNoticeAsRead(notice.id);
                    }}
                    className="block p-2 bg-white rounded-lg border border-rose-200/80 hover:border-rose-400 hover:shadow-xs transition-all"
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {notice.title}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase ${
                          notice.priority === "urgent"
                            ? "bg-rose-100 text-rose-700 font-extrabold"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {notice.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-1">
                      {notice.content || (notice.notice_type === "pdf" ? `PDF Document: ${notice.file_name || "Attachment"}` : "")}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Current Slot Info */}
          {summary?.slot_nudge && (
            <div className="bg-emerald-50/70 border-b border-emerald-100 px-3.5 py-2 flex items-center gap-2 text-xs text-emerald-900">
              <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="font-medium text-[11px] leading-tight">
                {summary.slot_nudge}
              </span>
            </div>
          )}

          {/* List of Reminders */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 overscroll-contain">
            {activeReminders.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-800">
                  All caught up!
                </p>
                <p className="text-[11px] text-slate-500 max-w-[200px] mx-auto">
                  No pending follow-ups or report alerts for today. Great job!
                </p>
              </div>
            ) : (
              activeReminders.map((r) => {
                const isUrgent = r.severity === "urgent";
                const isWarning = r.severity === "warning";

                return (
                  <div
                    key={r.id}
                    className={`p-3.5 hover:bg-slate-50 transition-colors relative group ${
                      isUrgent
                        ? "bg-rose-50/20"
                        : isWarning
                        ? "bg-amber-50/20"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Icon */}
                      <div
                        className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                          r.type.startsWith("follow_up")
                            ? isUrgent
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                            : r.type === "report_submission"
                            ? "bg-blue-100 text-blue-700"
                            : r.type === "commitment_due_today"
                            ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-400"
                            : r.type === "commitment_overdue"
                            ? "bg-rose-100 text-rose-800 ring-2 ring-rose-300"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {r.type.startsWith("follow_up") ? (
                          <Phone className="w-3.5 h-3.5" />
                        ) : r.type === "report_submission" ? (
                          <FileText className="w-3.5 h-3.5" />
                        ) : (
                          <Banknote className="w-3.5 h-3.5" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {r.title}
                          </h4>
                          {r.category && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {r.category}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug line-clamp-2">
                          {r.message}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-2">
                          {r.phone_number && (
                            <a
                              href={`tel:${r.phone_number}`}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition-colors"
                            >
                              <Phone className="w-2.5 h-2.5" />
                              <span>Call {r.phone_number}</span>
                            </a>
                          )}
                          {r.link && (
                            <Link
                              href={r.link}
                              onClick={() => setIsOpen(false)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 hover:text-green-800 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors"
                            >
                              <span>{r.action_label || "Open"}</span>
                              <ChevronRight className="w-2.5 h-2.5" />
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Dismiss 'x' button */}
                      <button
                        type="button"
                        onClick={(e) => handleDismiss(r.id, e)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200/60 transition-colors absolute top-2 right-2"
                        title="Dismiss notification"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 px-3.5 shrink-0">
            <span>Sunset Daily Activity</span>
            <button
              type="button"
              onClick={fetchReminders}
              className="text-green-700 hover:underline font-semibold"
            >
              Refresh
            </button>
          </div>
        </div>
      </>
    )}
  </div>
  );
}
