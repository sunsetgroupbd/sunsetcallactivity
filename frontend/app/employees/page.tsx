"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  UserCheck,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  Mail,
  Phone,
  Crown,
  Shield,
  Star,
  Target,
  User as UserIcon,
  AlertTriangle,
  Eye,
  EyeOff,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  Info,
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
import { api, ApiError } from "@/lib/api";
import { User, UserRole, BulkUploadEmployeesResponse } from "@/types";
import { formatReadableDate, formatEmployeeId } from "@/lib/utils";

export function renderRoleBadge(userRole: UserRole) {
  switch (userRole) {
    case "admin":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
          <Crown className="w-3 h-3 text-purple-700 shrink-0" />
          <span>Admin</span>
        </span>
      );
    case "sub_admin":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-200">
          <Shield className="w-3 h-3 text-teal-700 shrink-0" />
          <span>Sub Admin</span>
        </span>
      );
    case "tl":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
          <Star className="w-3 h-3 text-amber-700 shrink-0" />
          <span>Team Lead (TL)</span>
        </span>
      );
    case "co":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-300">
          <Target className="w-3 h-3 text-sky-700 shrink-0" />
          <span>Coordinator (CO)</span>
        </span>
      );
    case "employee":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
          <UserIcon className="w-3 h-3 text-emerald-700 shrink-0" />
          <span>Executive</span>
        </span>
      );
  }
}

export default function EmployeesPage() {
  const { user: currentUser } = useAuth();

  const [employees, setEmployees] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Debounce search input for backend query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form states
  const [employeeIdInput, setEmployeeIdInput] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("employee");
  const [isActive, setIsActive] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk CSV Upload states
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkDefaultPassword, setBulkDefaultPassword] = useState("Sunset@1234");
  const [bulkShowPassword, setBulkShowPassword] = useState(false);
  const [bulkRole, setBulkRole] = useState<string>("auto");
  const [bulkResetExisting, setBulkResetExisting] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkUploadEmployeesResponse | null>(null);
  const [bulkPreviewCount, setBulkPreviewCount] = useState<number>(0);
  const [bulkPreviewSample, setBulkPreviewSample] = useState<
    Array<{
      id: string;
      name: string;
      username: string;
      email: string;
      phone: string;
      designation: string;
    }>
  >([]);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const activeParam =
        statusFilter === "all" ? undefined : statusFilter === "active";
      const roleParam = roleFilter === "all" ? undefined : roleFilter;

      const data = await api.employees.list({
        search: debouncedSearch.trim() || undefined,
        role: roleParam,
        is_active: activeParam,
      });
      setEmployees(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to load employee accounts.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Instant client-side filter fallback so typing has 0ms perceived latency
  const displayedEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter(
      (emp) =>
        emp.full_name?.toLowerCase().includes(q) ||
        emp.username?.toLowerCase().includes(q) ||
        emp.email?.toLowerCase().includes(q) ||
        emp.phone?.toLowerCase().includes(q)
    );
  }, [employees, search]);

  // Check if entered custom Employee ID conflicts with any other existing employee
  const duplicateEmployee = useMemo(() => {
    const trimmed = employeeIdInput.trim();
    if (!trimmed) return null;
    const numericInput = parseInt(trimmed, 10);
    if (isNaN(numericInput) || numericInput <= 0) return null;

    return employees.find((e) => {
      // Exclude current employee being edited
      if (editingEmployee && e.id === editingEmployee.id) return false;

      // Check raw ID match
      if (e.id === numericInput) return true;

      // Check formatted employee ID match (e.g. 20260001)
      const formatted = formatEmployeeId(e.id, e.created_at);
      if (formatted === trimmed) return true;

      const formattedNum = parseInt(formatted, 10);
      if (!isNaN(formattedNum) && formattedNum === numericInput) return true;

      return false;
    });
  }, [employeeIdInput, employees, editingEmployee]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setEmployeeIdInput("");
    setFullName("");
    setEmail("");
    setPhone("");
    setDesignation("");
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setRole("employee");
    setIsActive(true);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (emp: User) => {
    setEditingEmployee(emp);
    setEmployeeIdInput(formatEmployeeId(emp.id, emp.created_at));
    setFullName(emp.full_name);
    setEmail(emp.email);
    setPhone(emp.phone || "");
    setDesignation(emp.designation || "");
    setUsername(emp.username);
    setPassword("");
    setShowPassword(false);
    setRole(emp.role);
    setIsActive(emp.is_active);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleBulkFileSelect = (file: File) => {
    setBulkFile(file);
    setBulkError(null);
    setBulkResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) {
          setBulkError("CSV file seems empty or has no data rows.");
          return;
        }

        const headers = lines[0]
          .split(",")
          .map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
        const idCol = headers.findIndex(
          (h) => h.includes("employee id") || h.includes("empid") || h === "id"
        );
        const nameCol = headers.findIndex((h) => h.includes("name"));
        const userCol = headers.findIndex((h) => h.includes("username"));
        const emailCol = headers.findIndex((h) => h.includes("email"));
        const phoneCol = headers.findIndex((h) => h.includes("phone"));
        const desigCol = headers.findIndex(
          (h) => h.includes("designation") || h.includes("position")
        );

        setBulkPreviewCount(lines.length - 1);

        const sample = lines.slice(1, 4).map((line) => {
          const parts = line
            .split(",")
            .map((p) => p.replace(/^"|"$/g, "").trim());
          return {
            id: idCol !== -1 ? parts[idCol] || "-" : "-",
            name: nameCol !== -1 ? parts[nameCol] || "-" : "-",
            username: userCol !== -1 ? parts[userCol] || "-" : "-",
            email: emailCol !== -1 ? parts[emailCol] || "-" : "-",
            phone: phoneCol !== -1 ? parts[phoneCol] || "-" : "-",
            designation: desigCol !== -1 ? parts[desigCol] || "-" : "-",
          };
        });
        setBulkPreviewSample(sample);
      } catch (err) {
        console.error("Preview parse error", err);
      }
    };
    reader.readAsText(file);
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) {
      setBulkError("Please select a CSV file to upload.");
      return;
    }
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      const formData = new FormData();
      formData.append("file", bulkFile);
      formData.append("default_password", bulkDefaultPassword.trim() || "Sunset@1234");
      formData.append("role", bulkRole);
      formData.append("reset_existing_passwords", String(bulkResetExisting));

      const res = await api.employees.bulkUpload(formData);
      setBulkResult(res);
      await loadEmployees();
      setStatusMessage({
        type: "success",
        text: res.message,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setBulkError(err.message);
      } else {
        setBulkError("Failed to upload CSV. Please ensure the CSV format is valid.");
      }
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    if (duplicateEmployee) {
      setFormError(
        `Employee ID "${employeeIdInput.trim()}" is already assigned to ${duplicateEmployee.full_name} (@${duplicateEmployee.username}). Please choose a unique ID.`
      );
      setFormSubmitting(false);
      return;
    }

    try {
      if (editingEmployee) {
        const payload: {
          id?: number;
          full_name: string;
          email: string;
          role: UserRole;
          is_active: boolean;
          password?: string;
          phone?: string | null;
          designation?: string | null;
        } = {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          designation: designation.trim() || null,
          role,
          is_active: isActive,
        };
        if (password.trim()) {
          payload.password = password.trim();
        }

        const trimmedId = employeeIdInput.trim();
        if (trimmedId) {
          const parsedId = parseInt(trimmedId, 10);
          if (isNaN(parsedId) || parsedId <= 0) {
            setFormError("Employee ID must be a valid positive number.");
            setFormSubmitting(false);
            return;
          }
          if (parsedId !== editingEmployee.id) {
            payload.id = parsedId;
          }
        }

        const updated = await api.employees.update(editingEmployee.id, payload);
        setEmployees((prev) =>
          prev.map((item) => (item.id === editingEmployee.id ? updated : item))
        );
        await loadEmployees();
        setStatusMessage({
          type: "success",
          text: `Employee account "${updated.full_name}" updated successfully.`,
        });
      } else {
        if (!password.trim()) {
          setFormError("Password is required when creating a new employee.");
          setFormSubmitting(false);
          return;
        }

        let parsedId: number | undefined = undefined;
        const trimmedId = employeeIdInput.trim();
        if (trimmedId) {
          parsedId = parseInt(trimmedId, 10);
          if (isNaN(parsedId) || parsedId <= 0) {
            setFormError("Employee ID must be a valid positive number.");
            setFormSubmitting(false);
            return;
          }
        }

        const created = await api.employees.create({
          id: parsedId,
          full_name: fullName.trim(),
          email: email.trim(),
          username: username.trim(),
          password: password.trim(),
          phone: phone.trim() || null,
          designation: designation.trim() || null,
          role,
        });
        setEmployees((prev) => [created, ...prev]);
        await loadEmployees();
        setStatusMessage({
          type: "success",
          text: `New employee "${created.full_name}" added successfully.`,
        });
      }
      setIsCreateOpen(false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save employee. Please try again.");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (empId: number) => {
    try {
      await api.employees.delete(empId);
      setEmployees((prev) => prev.filter((item) => item.id !== empId));
      setDeleteConfirmId(null);
      setStatusMessage({
        type: "success",
        text: "Employee account deleted successfully.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setStatusMessage({ type: "error", text: err.message });
      } else {
        setStatusMessage({
          type: "error",
          text: "Failed to delete employee account.",
        });
      }
    }
  };

  return (
    <DashboardLayout
      title="Employee Management"
      subtitle="Manage corporate staff accounts, roles, access permissions, and activity"
      adminOnly
    >
      <div className="space-y-6">
        {/* ── Action and Search Bar ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Search */}
                <div className="relative min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by name, username, email or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-500 border border-slate-300 rounded focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Role filter */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span className="font-semibold text-slate-700">Role:</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Roles</option>
                    <option value="employee">Sales Executive</option>
                    <option value="co">Coordinator (CO)</option>
                    <option value="tl">Team Leader (TL)</option>
                    <option value="sub_admin">Sub Admin</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span className="font-semibold text-slate-700">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setBulkFile(null);
                    setBulkError(null);
                    setBulkResult(null);
                    setBulkPreviewCount(0);
                    setBulkPreviewSample([]);
                    setIsBulkUploadOpen(true);
                  }}
                  className="bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Import CSV
                </Button>
                <Button variant="primary" size="sm" onClick={openCreateModal}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Employee
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Status Feedback Alert ────────────────────────────────────────── */}
        {statusMessage && (
          <Alert
            type={statusMessage.type}
            onDismiss={() => setStatusMessage(null)}
          >
            {statusMessage.text}
          </Alert>
        )}

        {/* ── Employee List Table ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-green-700" />
              Staff Accounts Directory
            </CardTitle>
            <span className="text-xs text-slate-500">
              {displayedEmployees.length} {displayedEmployees.length === 1 ? "account" : "accounts"}
            </span>
          </CardHeader>

          {/* ── Mobile App Cards View (< md) ─────────────────────────────────── */}
          <div className="md:hidden space-y-3 p-3 sm:p-4">
            {loading && employees.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))
            ) : displayedEmployees.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-200 text-xs">
                No employees match your search criteria.
              </div>
            ) : (
              displayedEmployees.map((emp) => (
                <div
                  key={emp.id}
                  className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3 transition-all hover:border-slate-300"
                >
                  {/* Top Bar: ID + Role + Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        {formatEmployeeId(emp.id, emp.created_at)}
                      </span>
                      {renderRoleBadge(emp.role)}
                      {currentUser?.id === emp.id && (
                        <span className="text-[10px] text-green-800 bg-green-50 px-1.5 py-0.5 rounded border border-green-200 font-semibold">
                          You
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(emp)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                        title="Edit Employee"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {currentUser?.id !== emp.id && (
                        <button
                          onClick={() => setDeleteConfirmId(emp.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                          title="Delete Employee"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Name, Designation & Username */}
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-snug">{emp.full_name}</h3>
                    {emp.designation && (
                      <p className="text-xs font-medium text-emerald-700 mt-0.5">{emp.designation}</p>
                    )}
                    <p className="text-xs text-slate-500 font-mono mt-0.5">@{emp.username}</p>
                  </div>

                  {/* Contact Info (Email & Phone) */}
                  <div className="grid grid-cols-1 gap-2 text-xs pt-2.5 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-slate-600 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{emp.email}</span>
                    </div>

                    {emp.phone ? (
                      <a
                        href={`tel:${emp.phone}`}
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-800 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 w-fit"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{emp.phone}</span>
                      </a>
                    ) : (
                      <span className="text-slate-400 italic flex items-center gap-1 text-[11px]">
                        <Phone className="w-3.5 h-3.5 text-slate-300" /> No phone recorded
                      </span>
                    )}
                  </div>

                  {/* Bottom: Status & Member Since */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        emp.is_active ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {emp.is_active ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Active
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          Inactive
                        </>
                      )}
                    </span>
                    <span>Joined {formatReadableDate(emp.created_at.slice(0, 10))}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Desktop Table View (>= md) ───────────────────────────────────── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                  <th className="py-2.5 px-3 w-28">Employee ID</th>
                  <th className="py-2.5 px-4">Full Name</th>
                  <th className="py-2.5 px-3">Username</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3 text-center">Role</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Member Since</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && employees.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-36" /></td>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-3 px-3 text-center"><Skeleton className="h-4 w-16 mx-auto" /></td>
                      <td className="py-3 px-3 text-center"><Skeleton className="h-4 w-14 mx-auto" /></td>
                      <td className="py-3 px-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-3 px-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    </tr>
                  ))
                ) : displayedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No employees match your search criteria.
                    </td>
                  </tr>
                ) : (
                  displayedEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                          {formatEmployeeId(emp.id, emp.created_at)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {emp.full_name}
                          {currentUser?.id === emp.id && (
                            <span className="ml-1.5 text-[10px] text-green-800 bg-green-50 px-1.5 py-0.5 rounded font-normal">
                              (You)
                            </span>
                          )}
                        </div>
                        {emp.designation && (
                          <div className="text-[11px] text-emerald-700 font-medium">
                            {emp.designation}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                        @{emp.username}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{emp.email}</td>
                      <td className="py-3 px-3 text-slate-700 font-mono text-[11px] whitespace-nowrap">
                        {emp.phone ? (
                          <a href={`tel:${emp.phone}`} className="hover:text-green-700 hover:underline">
                            {emp.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderRoleBadge(emp.role)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            emp.is_active ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          {emp.is_active ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              Inactive
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {formatReadableDate(emp.created_at.slice(0, 10))}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {currentUser?.id !== emp.id && (
                            <button
                              onClick={() => setDeleteConfirmId(emp.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Delete Employee"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Create / Edit Employee Modal ─────────────────────────────────── */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title={editingEmployee ? `Edit ${editingEmployee.full_name}` : "Create New Employee"}
          description="Enter employee details and access permissions"
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {formError}
              </div>
            )}

            {/* Employee ID Field (Editable with duplicate warning) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Employee ID {editingEmployee ? "(Editable)" : "(Optional)"}
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                  {editingEmployee
                    ? "Unique numeric code (e.g. 20260001)"
                    : "Leave blank to auto-generate"}
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder={
                    editingEmployee
                      ? "e.g. 20260001"
                      : "Auto-assigned (or enter custom e.g. 20260001)"
                  }
                  value={employeeIdInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setEmployeeIdInput(val);
                  }}
                  className={`w-full font-mono font-bold text-xs px-3 py-2 border rounded-lg focus:outline-none transition-colors ${
                    duplicateEmployee
                      ? "border-rose-400 bg-rose-50/50 text-rose-900 focus:ring-2 focus:ring-rose-500/20"
                      : "border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-green-600/20 focus:border-green-600"
                  }`}
                />
              </div>

              {/* Duplicate Warning Banner */}
              {duplicateEmployee && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg flex items-start gap-2 text-xs text-rose-900 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Duplicate Employee ID Warning:</span> ID{" "}
                    <span className="font-mono font-bold underline">
                      {employeeIdInput.trim()}
                    </span>{" "}
                    is already assigned to{" "}
                    <span className="font-semibold">{duplicateEmployee.full_name}</span>{" "}
                    (@{duplicateEmployee.username}). Please enter a unique ID.
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Shakil Ahmed"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Designation / Position
              </label>
              <input
                type="text"
                placeholder="e.g. Manager (Sales & Marketing), Executive"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingEmployee}
                  placeholder="e.g. shakil"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 01712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="shakil@sunsetgroup.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {editingEmployee ? "Reset Password (Optional)" : "Password *"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={editingEmployee ? "Leave blank to keep unchanged" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2 pr-9 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded focus:outline-none"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-slate-500" />
                    ) : (
                      <Eye className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                >
                  <option value="employee">Sales Executive (Employee)</option>
                  <option value="co">Coordinator (CO)</option>
                  <option value="tl">Team Leader (TL)</option>
                  <option value="sub_admin">Sub Admin</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {editingEmployee && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Account Status
                  </label>
                  <select
                    value={isActive ? "active" : "inactive"}
                    onChange={(e) => setIsActive(e.target.value === "active")}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={formSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={formSubmitting}
                disabled={formSubmitting || !!duplicateEmployee}
              >
                {editingEmployee ? "Update Employee" : "Create Account"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Bulk Upload CSV Modal ────────────────────────────────────────── */}
        <Modal
          isOpen={isBulkUploadOpen}
          onClose={() => {
            if (!bulkSubmitting) {
              setIsBulkUploadOpen(false);
            }
          }}
          title="Bulk Register / Update Employees via CSV"
          description="Upload your sales team CSV file to register new employees or update existing ones"
        >
          <form onSubmit={handleBulkSubmit} className="space-y-4">
            {bulkError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {bulkError}
              </div>
            )}

            {bulkResult && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>{bulkResult.message}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                  <div className="p-1.5 bg-white rounded border border-emerald-100">
                    <span className="text-[10px] text-slate-500 block">Created</span>
                    <span className="font-bold text-emerald-700">{bulkResult.created_count}</span>
                  </div>
                  <div className="p-1.5 bg-white rounded border border-emerald-100">
                    <span className="text-[10px] text-slate-500 block">Updated</span>
                    <span className="font-bold text-blue-700">{bulkResult.updated_count}</span>
                  </div>
                  <div className="p-1.5 bg-white rounded border border-emerald-100">
                    <span className="text-[10px] text-slate-500 block">Skipped</span>
                    <span className="font-bold text-slate-600">{bulkResult.skipped_count}</span>
                  </div>
                </div>

                {bulkResult.errors && bulkResult.errors.length > 0 && (
                  <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 max-h-28 overflow-y-auto space-y-1">
                    <span className="font-semibold block">Notes & Warnings:</span>
                    {bulkResult.errors.map((err, idx) => (
                      <div key={idx} className="font-mono text-[10px]">• {err}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* File Upload Zone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Select CSV File *
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
                <input
                  type="file"
                  accept=".csv,text/csv,application/vnd.ms-excel"
                  id="csv-file-input"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleBulkFileSelect(f);
                  }}
                />
                <label
                  htmlFor="csv-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                >
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-800">
                    {bulkFile ? bulkFile.name : "Click to select CSV file (or drag & drop)"}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Accepts columns: S.L, Name, Employee ID, Username, Email, Phone Number, Designation
                  </span>
                </label>
              </div>
            </div>

            {/* CSV Quick Preview */}
            {bulkPreviewCount > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-700 font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {bulkPreviewCount} Employee Records Detected
                  </span>
                  <span className="text-[10px] text-slate-400">Sample preview</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse bg-white rounded border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                        <th className="py-1 px-2">ID</th>
                        <th className="py-1 px-2">Name</th>
                        <th className="py-1 px-2">Email</th>
                        <th className="py-1 px-2">Designation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkPreviewSample.map((s, idx) => (
                        <tr key={idx}>
                          <td className="py-1 px-2 font-mono">{s.id}</td>
                          <td className="py-1 px-2 font-medium">{s.name}</td>
                          <td className="py-1 px-2 text-slate-500">{s.email}</td>
                          <td className="py-1 px-2 text-emerald-700">{s.designation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Default Password Setting */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Default Common Password *
                </label>
                <span className="text-[10px] text-slate-400">
                  Assigned to all newly registered accounts
                </span>
              </div>
              <div className="relative">
                <input
                  type={bulkShowPassword ? "text" : "password"}
                  required
                  placeholder="e.g. Sunset@1234"
                  value={bulkDefaultPassword}
                  onChange={(e) => setBulkDefaultPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 pr-9 text-xs font-semibold text-slate-800 placeholder:text-slate-500 focus:ring-1 focus:ring-green-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setBulkShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded focus:outline-none"
                  title={bulkShowPassword ? "Hide password" : "Show password"}
                >
                  {bulkShowPassword ? (
                    <EyeOff className="w-4 h-4 text-slate-500" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-500" />
                  )}
                </button>
              </div>
            </div>

            {/* Role Selection */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Assign Role to Uploaded Employees
              </label>
              <select
                value={bulkRole}
                onChange={(e) => setBulkRole(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
              >
                <option value="auto">Auto-detect from Designation (Recommended)</option>
                <option value="employee">Sales Executive (Employee)</option>
                <option value="tl">Team Leader (TL)</option>
                <option value="co">Coordinator (CO)</option>
                <option value="sub_admin">Sub Admin</option>
                <option value="admin">Administrator</option>
              </select>
              <span className="text-[10px] text-slate-500">
                Auto-detect assigns Team Leader if designation has &quot;Team Leader&quot;, Coordinator if &quot;Coordinator&quot;, etc.
              </span>
            </div>

            {/* Smart Update & Password Option */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-blue-900 leading-relaxed text-[11px]">
                  <strong>Smart Update:</strong> If an employee already exists in the system (matching Employee ID, username or email), their Name, Phone, and Designation will be updated automatically.
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-blue-100">
                <input
                  type="checkbox"
                  checked={bulkResetExisting}
                  onChange={(e) => setBulkResetExisting(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-700 font-medium">
                  Also reset existing employees' passwords to this default password
                </span>
              </label>

              {bulkResetExisting && (
                <div className="text-[10px] text-amber-700 font-semibold bg-amber-50 p-2 rounded border border-amber-200">
                  ⚠️ Note: Existing employees will need to login with &quot;{bulkDefaultPassword || "the default password"}&quot; after import.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsBulkUploadOpen(false)}
                disabled={bulkSubmitting}
              >
                {bulkResult ? "Done" : "Cancel"}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={bulkSubmitting}
                disabled={bulkSubmitting || !bulkFile}
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                {bulkSubmitting ? "Importing..." : "Import & Sync Employees"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
        <Modal
          isOpen={deleteConfirmId !== null}
          onClose={() => setDeleteConfirmId(null)}
          title="Confirm Delete Employee"
          description="Are you sure you want to remove this staff account?"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Deleting an employee account will remove their access to the Sunset Group dashboard.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              >
                Delete Account
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
