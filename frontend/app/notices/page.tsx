"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import {
  BellRing,
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileDown,
  Trash2,
  Printer,
  ShieldCheck,
  Lock,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Bookmark,
  Building2,
  Calendar,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Modal,
  Alert,
  Skeleton,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useNoticesBadge } from "@/lib/use-notices-badge";
import { api, ApiError } from "@/lib/api";
import { Notice, NoticePriority, NoticeStatus, NoticeType } from "@/types";
import { formatReadableDate } from "@/lib/utils";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api/v1", "") || "http://127.0.0.1:8000";

export default function NoticesPage() {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const { markAllAsRead } = useNoticesBadge();
  const isManagement = isAdmin || isSubAdmin;

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Create Notice Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<NoticeType>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<NoticePriority>("normal");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // View Formal Notice Modal
  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null);

  // Review (Sub-admin approval) Modal
  const [reviewingNotice, setReviewingNotice] = useState<Notice | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"published" | "rejected">("published");
  const [approvalNote, setApprovalNote] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Delete Confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const data = await api.notices.list();
      setNotices(data);
      // Mark all notices as read through context
      markAllAsRead();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load notice board items.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  // Counts for management tabs
  const pendingCount = useMemo(
    () => notices.filter((n) => n.status === "pending_approval").length,
    [notices]
  );

  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      // Status filter
      if (isManagement && statusTab !== "all") {
        if (n.status !== statusTab) return false;
      }
      // Type filter
      if (typeFilter !== "all" && n.notice_type !== typeFilter) return false;
      // Priority filter
      if (priorityFilter !== "all" && n.priority !== priorityFilter) return false;
      // Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const inTitle = n.title.toLowerCase().includes(q);
        const inContent = n.content?.toLowerCase().includes(q);
        const inAuthor = n.created_by_name?.toLowerCase().includes(q);
        if (!inTitle && !inContent && !inAuthor) return false;
      }
      return true;
    });
  }, [notices, isManagement, statusTab, typeFilter, priorityFilter, search]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (createType === "text") {
        if (!content.trim()) {
          setFormError("Notice content text is required.");
          setSubmitting(false);
          return;
        }
        const created = await api.notices.createText({
          title: title.trim(),
          content: content.trim(),
          priority,
        });

        setNotices((prev) => [created, ...prev]);
        setStatusMessage({
          type: "success",
          text:
            created.status === "pending_approval"
              ? `Notice "${created.title}" submitted for Sub-Admin approval.`
              : `Notice "${created.title}" published successfully.`,
        });
      } else {
        if (!pdfFile) {
          setFormError("Please select a PDF document to upload.");
          setSubmitting(false);
          return;
        }
        const formData = new FormData();
        formData.append("title", title.trim());
        formData.append("priority", priority);
        formData.append("file", pdfFile);

        const created = await api.notices.createPdf(formData);
        setNotices((prev) => [created, ...prev]);
        setStatusMessage({
          type: "success",
          text: `PDF Notice "${created.title}" published directly to all employees.`,
        });
      }

      setIsCreateOpen(false);
      setTitle("");
      setContent("");
      setPdfFile(null);
      setPriority("normal");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to issue notice. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingNotice) return;
    setReviewSubmitting(true);

    try {
      const updated = await api.notices.review(reviewingNotice.id, {
        status: reviewStatus,
        approval_note: approvalNote.trim() || undefined,
      });

      setNotices((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setStatusMessage({
        type: "success",
        text: `Notice "${updated.title}" ${
          updated.status === "published" ? "approved & published" : "rejected"
        } with your review remarks.`,
      });
      setReviewingNotice(null);
      setApprovalNote("");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        alert(err.message);
      } else {
        alert("Failed to review notice.");
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.notices.delete(id);
      setNotices((prev) => prev.filter((n) => n.id !== id));
      setDeleteId(null);
      setStatusMessage({
        type: "success",
        text: "Notice removed from board successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        alert(err.message);
      } else {
        alert("Failed to delete notice.");
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getPriorityBadge = (p: NoticePriority) => {
    switch (p) {
      case "urgent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
            <AlertTriangle className="w-3 h-3 text-rose-600" /> Urgent
          </span>
        );
      case "important":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Sparkles className="w-3 h-3 text-amber-600" /> Important
          </span>
        );
      case "normal":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Standard
          </span>
        );
    }
  };

  const getStatusBadge = (s: NoticeStatus) => {
    switch (s) {
      case "published":
        return (
          <Badge variant="success" className="text-[10px]">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Published
          </Badge>
        );
      case "pending_approval":
        return (
          <Badge variant="warning" className="text-[10px]">
            <Clock className="w-3 h-3 mr-1" /> Pending Approval
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="danger" className="text-[10px]">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </Badge>
        );
    }
  };

  return (
    <DashboardLayout
      title="Notice Board"
      subtitle="Company circulars & announcements"
    >
      <div className="space-y-6">
        {/* ── Status Feedback Alert ────────────────────────────────────────── */}
        {statusMessage && (
          <Alert
            type={statusMessage.type}
            onDismiss={() => setStatusMessage(null)}
          >
            {statusMessage.text}
          </Alert>
        )}

        {/* ── Action and Filter Bar ─────────────────────────────────────────── */}
        <Card className="border border-slate-200/80 shadow-xs">
          <CardContent className="p-4 space-y-3">
            {/* Management Status Tabs */}
            {isManagement && (
              <div className="flex items-center gap-1.5 border-b border-slate-200 pb-3 overflow-x-auto text-xs">
                {[
                  { key: "all", label: `All Notices (${notices.length})` },
                  {
                    key: "published",
                    label: `Published (${
                      notices.filter((n) => n.status === "published").length
                    })`,
                  },
                  {
                    key: "pending_approval",
                    label: `Pending Sub-Admin Approval`,
                    badge: pendingCount,
                  },
                  {
                    key: "rejected",
                    label: `Rejected (${
                      notices.filter((n) => n.status === "rejected").length
                    })`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusTab(tab.key)}
                    className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                      statusTab === tab.key
                        ? "bg-emerald-800 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-900">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search & Filters */}
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative min-w-[200px] max-w-sm flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search notice by title, keyword, author..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-600 focus:outline-none bg-white"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Type Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-600">Type:</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="text">Official Text Memo</option>
                    <option value="pdf">PDF Circular Document</option>
                  </select>
                </div>

                {/* Priority Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-600">Priority:</span>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Priorities</option>
                    <option value="urgent">Urgent</option>
                    <option value="important">Important</option>
                    <option value="normal">Standard</option>
                  </select>
                </div>
              </div>

              {/* Action Button for Management */}
              {isManagement && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsCreateOpen(true)}
                  className="shrink-0 bg-emerald-800 hover:bg-emerald-900 text-white"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Issue New Notice
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Notice Cards Feed ─────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-4 w-32" />
              </Card>
            ))}
          </div>
        ) : filteredNotices.length === 0 ? (
          <Card className="border border-dashed border-slate-300 py-16 text-center shadow-xs">
            <BellRing className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No notices found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              There are currently no circulars or announcements matching your criteria.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredNotices.map((notice) => {
              const isPdf = notice.notice_type === "pdf";
              const isPending = notice.status === "pending_approval";

              return (
                <Card
                  key={notice.id}
                  className={`border transition-all duration-200 hover:shadow-md flex flex-col justify-between overflow-hidden ${
                    isPending
                      ? "border-amber-300 bg-amber-50/20"
                      : "border-slate-200/90 bg-white"
                  }`}
                >
                  <div>
                    {/* Card Top Pill Bar */}
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap bg-slate-50/60">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isPdf ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <FileText className="w-3 h-3 text-rose-600" /> PDF Document
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <Bookmark className="w-3 h-3 text-emerald-600" /> Official Memo
                          </span>
                        )}
                        {getPriorityBadge(notice.priority)}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isManagement && getStatusBadge(notice.status)}
                      </div>
                    </div>

                    {/* Notice Main Content */}
                    <div className="p-4 space-y-2.5">
                      <h3
                        onClick={() =>
                          isPdf
                            ? window.open(`${API_BASE_URL}${notice.file_url}`, "_blank")
                            : setViewingNotice(notice)
                        }
                        className="text-sm font-bold text-slate-900 leading-snug cursor-pointer hover:text-emerald-700 transition-colors line-clamp-2"
                        title={notice.title}
                      >
                        {notice.title}
                      </h3>

                      {isPdf ? (
                        <div className="p-2.5 rounded-lg bg-rose-50/60 border border-rose-100 flex items-center gap-2.5">
                          <FileText className="w-6 h-6 text-rose-600 shrink-0" />
                          <div className="min-w-0 flex-1 text-xs">
                            <p className="font-semibold text-rose-950 truncate">
                              {notice.file_name || "Official_Notice.pdf"}
                            </p>
                            <span className="text-[10px] text-rose-700">
                              Instant publish document
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                          {notice.content}
                        </p>
                      )}

                      {/* Internal Sub-Admin Review Note (Visible ONLY to Admins & Sub-Admins) */}
                      {isManagement && notice.approval_note && (
                        <div className="mt-3 p-2.5 rounded-md bg-amber-50/90 border border-amber-200 text-xs">
                          <div className="flex items-center gap-1 font-bold text-amber-900 text-[11px] mb-1">
                            <Lock className="w-3 h-3 text-amber-700" />
                            Internal Review Note (Management Only):
                          </div>
                          <p className="text-slate-700 italic text-[11px]">
                            &ldquo;{notice.approval_note}&rdquo;
                          </p>
                          {notice.approved_by_name && (
                            <p className="text-[10px] text-amber-800 font-semibold mt-1">
                              — Reviewed by {notice.approved_by_name}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-4 pt-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs text-slate-500">
                    <div className="space-y-0.5">
                      <span className="block text-[11px] text-slate-600 font-medium">
                        {formatReadableDate(notice.created_at.slice(0, 10))}
                      </span>
                      {notice.created_by_name && (
                        <span className="block text-[10px] text-slate-400">
                          By {notice.created_by_name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Review Button for Sub-Admins / Admins if pending */}
                      {isManagement && isPending && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setReviewingNotice(notice);
                            setReviewStatus("published");
                            setApprovalNote("");
                          }}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-2.5 py-1 h-7"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                          Review
                        </Button>
                      )}

                      {/* Primary View Action */}
                      {isPdf ? (
                        <a
                          href={`${API_BASE_URL}${notice.file_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200 transition-colors"
                        >
                          <FileDown className="w-3.5 h-3.5" /> View PDF
                        </a>
                      ) : (
                        <button
                          onClick={() => setViewingNotice(notice)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs border border-emerald-200 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> Read Memo
                        </button>
                      )}

                      {/* Delete Action for Management */}
                      {isManagement && (
                        <button
                          onClick={() => setDeleteId(notice.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Delete notice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Official Letterhead View Modal (PDF-like Corporate Memo) ─────── */}
        <Modal
          isOpen={!!viewingNotice}
          onClose={() => setViewingNotice(null)}
          title="Official Corporate Memo"
          maxWidth="max-w-3xl"
        >
          {viewingNotice && (
            <div className="space-y-4">
              {/* Top Action Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-xs">
                <span className="text-slate-500 font-mono">
                  Official Communication Document
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrint}
                    className="text-xs"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                    Print / Save PDF
                  </Button>
                </div>
              </div>

              {/* ── Official A4 Letterhead Document Canvas ──────────────────── */}
              <div
                ref={printRef}
                className="bg-white p-6 sm:p-10 border border-slate-300 rounded-lg shadow-sm space-y-6 text-slate-900 font-sans print:border-none print:shadow-none print:p-0"
              >
                {/* Official Letterhead Header */}
                <div className="flex items-start justify-between border-b-2 border-emerald-900 pb-4 gap-4">
                  <div className="flex items-center gap-4">
                    <Image
                      src="/Sunset-Group-Logo.png"
                      alt="Sunset Group Logo"
                      width={60}
                      height={75}
                      className="h-16 w-auto object-contain"
                      priority
                    />
                    <div>
                      <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight leading-none uppercase">
                        Sunset Group
                      </h1>
                      <p className="text-xs font-bold text-emerald-800 tracking-wider uppercase mt-1">
                        Corporate Head Office • Executive Administration
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Dhaka, Bangladesh | Official Corporate Notice & Circular
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-3 py-1 bg-emerald-900 text-white text-[11px] font-extrabold uppercase tracking-widest rounded">
                      Official Memo
                    </span>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">
                      ISO 9001:2015 Certified
                    </p>
                  </div>
                </div>

                {/* Memo Meta Table */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded border border-slate-200 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">
                      Reference No:
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      SG/HR-NOT/{viewingNotice.id.toString().padStart(4, "0")}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">
                      Date Issued:
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatReadableDate(viewingNotice.created_at.slice(0, 10))}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">
                      Recipient:
                    </span>
                    <span className="font-semibold text-slate-800">
                      All Staff & Personnel
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">
                      Priority Level:
                    </span>
                    <span className="capitalize font-bold text-emerald-800">
                      {viewingNotice.priority}
                    </span>
                  </div>
                </div>

                {/* Subject Title */}
                <div className="border-b border-slate-200 pb-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-950 leading-snug">
                    <span className="uppercase text-emerald-900 underline font-extrabold mr-2">
                      Subject:
                    </span>
                    {viewingNotice.title}
                  </h2>
                </div>

                {/* Document Body */}
                <div className="text-xs sm:text-sm text-slate-800 leading-relaxed space-y-4 min-h-[140px] whitespace-pre-wrap">
                  {viewingNotice.content}
                </div>

                {/* Formal Corporate Sign-off Footer */}
                <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
                  <div className="space-y-1 text-xs">
                    <p className="text-[10px] text-slate-400 font-mono">
                      Issued electronically through Sunset Group Internal Portal
                    </p>
                    <p className="text-[10px] text-slate-400">
                      This is an authorized corporate memorandum.
                    </p>
                  </div>

                  <div className="text-right space-y-1 sm:self-end">
                    <div className="w-36 border-b border-slate-400 mx-auto sm:ml-auto pb-1 text-center font-serif italic text-emerald-900 font-semibold text-sm">
                      Executive Authority
                    </div>
                    <p className="text-xs font-bold text-slate-900">
                      Corporate Administration
                    </p>
                    <p className="text-[10px] text-slate-500">Sunset Group</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* ── Create Notice Modal (Text or PDF) ─────────────────────────────── */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Issue Corporate Notice"
          description="Publish official announcements or circulars for employees"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {formError}
              </div>
            )}

            {/* Notice Type Selector Toggle */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Notice Format Type *
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateType("text")}
                  className={`py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    createType === "text"
                      ? "bg-white text-emerald-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileText className="w-4 h-4 text-emerald-700" />
                  Official Text Memo
                </button>
                <button
                  type="button"
                  onClick={() => setCreateType("pdf")}
                  className={`py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    createType === "pdf"
                      ? "bg-white text-rose-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileDown className="w-4 h-4 text-rose-600" />
                  PDF Document Upload
                </button>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Notice Subject / Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Eid-ul-Fitr Office Holiday & Roster Notice"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Priority Level *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as NoticePriority)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none bg-white"
              >
                <option value="normal">Standard Notice</option>
                <option value="important">Important Circular</option>
                <option value="urgent">Urgent Announcement</option>
              </select>
            </div>

            {/* Conditional Input based on Type */}
            {createType === "text" ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Notice Content Text *
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="Type the full corporate notice or circular message here. It will be beautifully rendered in official corporate letterhead format for all employees..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-normal text-slate-800 leading-relaxed focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />

                <div className="mt-2 p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Approval Policy:</strong> If any sub-administrators
                    exist in the system, this text notice will be placed in{" "}
                    <strong>Pending Approval</strong> for sub-admin review.
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Upload PDF Document *
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-5 text-center bg-slate-50 hover:bg-slate-100/60 transition-colors">
                  <FileText className="w-8 h-8 text-rose-600 mx-auto mb-2" />
                  <input
                    type="file"
                    accept=".pdf"
                    required
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setPdfFile(e.target.files[0]);
                      }
                    }}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-800 file:text-white hover:file:bg-emerald-900 cursor-pointer"
                  />
                  {pdfFile && (
                    <p className="text-xs font-semibold text-slate-800 mt-2">
                      Selected: {pdfFile.name} ({(pdfFile.size / 1024).toFixed(1)}{" "}
                      KB)
                    </p>
                  )}
                </div>

                <div className="mt-2 p-2.5 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Direct Publish:</strong> PDF document notices are
                    published immediately to all employees without requiring
                    sub-admin approval.
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting}
                className="bg-emerald-800 hover:bg-emerald-900 text-white"
              >
                {submitting
                  ? "Processing..."
                  : createType === "text"
                  ? "Submit Notice"
                  : "Publish PDF Notice"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Sub-Admin Approval / Review Modal ─────────────────────────────── */}
        <Modal
          isOpen={!!reviewingNotice}
          onClose={() => setReviewingNotice(null)}
          title="Sub-Admin Notice Review & Decision"
          description="Review text notice draft, add internal remarks, and approve or reject"
        >
          {reviewingNotice && (
            <form onSubmit={handleReviewSubmit} className="space-y-4">
              {/* Notice Brief Preview */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                <span className="block text-[10px] uppercase font-bold text-slate-500">
                  Notice Title:
                </span>
                <p className="font-bold text-slate-900">
                  {reviewingNotice.title}
                </p>
                <span className="block text-[10px] uppercase font-bold text-slate-500 pt-2">
                  Content Preview:
                </span>
                <p className="text-slate-700 line-clamp-3 italic">
                  &ldquo;{reviewingNotice.content}&rdquo;
                </p>
              </div>

              {/* Review Decision */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Review Decision *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs font-bold transition-colors ${
                      reviewStatus === "published"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="decision"
                      value="published"
                      checked={reviewStatus === "published"}
                      onChange={() => setReviewStatus("published")}
                      className="text-emerald-700 focus:ring-emerald-600"
                    />
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Approve & Publish
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs font-bold transition-colors ${
                      reviewStatus === "rejected"
                        ? "border-rose-600 bg-rose-50 text-rose-900"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="decision"
                      value="rejected"
                      checked={reviewStatus === "rejected"}
                      onChange={() => setReviewStatus("rejected")}
                      className="text-rose-700 focus:ring-rose-600"
                    />
                    <XCircle className="w-4 h-4 text-rose-600" />
                    Reject Notice
                  </label>
                </div>
              </div>

              {/* Internal Approval Note / Comment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Internal Review Remarks / Note
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter remarks or approval notes (e.g. Verified with HR policy; approved for circulation)..."
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-normal text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  This note is strictly confidential and visible only to
                  Administrators and Sub-Administrators.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewingNotice(null)}
                  disabled={reviewSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={reviewStatus === "published" ? "primary" : "danger"}
                  size="sm"
                  disabled={reviewSubmitting}
                  className={
                    reviewStatus === "published"
                      ? "bg-emerald-800 hover:bg-emerald-900 text-white"
                      : ""
                  }
                >
                  {reviewSubmitting
                    ? "Submitting..."
                    : reviewStatus === "published"
                    ? "Confirm Approval"
                    : "Confirm Rejection"}
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
        <Modal
          isOpen={deleteId !== null}
          onClose={() => setDeleteId(null)}
          title="Delete Notice"
          description="Are you sure you want to remove this notice from the board? This action cannot be undone."
        >
          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete Notice
            </Button>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
