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
  Layers,
  Save,
  Users,
  ChevronRight,
  ChevronDown,
  UserPlus,
  ArrowRight,
  Sparkles,
  CornerDownRight,
  RefreshCw,
  Network,
} from "lucide-react";
import Link from "next/link";
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
import { User, UserRole, BulkUploadEmployeesResponse, Team } from "@/types";
import { formatReadableDate, formatEmployeeId } from "@/lib/utils";

export function normalizeRole(role?: string | null, designation?: string | null): UserRole {
  if (role) {
    const r = role.toString().trim().toLowerCase();
    if (r === "co" || r === "coordinator" || r.includes("coord")) return "co";
    if (
      r === "tl" ||
      r === "team_leader" ||
      r === "team leader" ||
      r === "teamlead" ||
      r === "team lead" ||
      r === "lead" ||
      r.includes("leader")
    )
      return "tl";
    if (r === "admin" || r === "administrator") return "admin";
    if (r === "sub_admin" || r === "subadmin" || r === "sub admin") return "sub_admin";
    if (r === "employee" || r === "executive") {
      if (designation) {
        const d = designation.trim().toLowerCase();
        if (d.includes("coordinator") || d === "co" || d.startsWith("co ")) return "co";
        if (d.includes("team leader") || d.includes("team lead") || d === "tl" || d.startsWith("tl ")) return "tl";
      }
      return "employee";
    }
  }
  if (designation) {
    const d = designation.trim().toLowerCase();
    if (d.includes("coordinator") || d === "co" || d.startsWith("co ")) return "co";
    if (d.includes("team leader") || d.includes("team lead") || d === "tl" || d.startsWith("tl ")) return "tl";
  }
  return "employee";
}

function renderRoleBadge(userRole: string) {
  const norm = normalizeRole(userRole);
  switch (norm) {
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

interface HierarchyInfo {
  glTeamName: string | null;
  glDirectorName: string | null;
  coUser: User | null;
  coName: string | null;
  tlUser: User | null;
  tlName: string | null;
}

function resolveHierarchy(emp: User, allEmployees: User[], teams: Team[]): HierarchyInfo {
  const team = teams.find((t) => t.id === emp.team_id);
  const glTeamName = emp.team_name || team?.name || null;
  const glDirectorName =
    team?.director_name ||
    (glTeamName?.toLowerCase().includes("gazi")
      ? "Gazi Sir"
      : glTeamName?.toLowerCase().includes("hasib")
      ? "Hasib Sir"
      : null);

  const empRole = normalizeRole(emp.role, emp.designation);

  if (empRole === "admin" || empRole === "sub_admin") {
    return {
      glTeamName,
      glDirectorName,
      coUser: null,
      coName: null,
      tlUser: null,
      tlName: null,
    };
  }

  if (empRole === "co") {
    return {
      glTeamName,
      glDirectorName,
      coUser: emp,
      coName: emp.full_name,
      tlUser: null,
      tlName: null,
    };
  }

  const directManager = emp.reporting_manager_id
    ? allEmployees.find((u) => u.id === emp.reporting_manager_id) || null
    : null;
  const mgrRole = directManager
    ? normalizeRole(directManager.role, directManager.designation)
    : null;

  if (empRole === "tl") {
    const coUser = mgrRole === "co" ? directManager : directManager;
    return {
      glTeamName,
      glDirectorName,
      coUser,
      coName: coUser ? coUser.full_name : emp.reporting_manager_name || null,
      tlUser: emp,
      tlName: emp.full_name,
    };
  }

  // Role: employee / executive
  let tlUser: User | null = null;
  let coUser: User | null = null;

  if (directManager) {
    if (mgrRole === "tl") {
      tlUser = directManager;
      if (directManager.reporting_manager_id) {
        coUser =
          allEmployees.find((u) => u.id === directManager.reporting_manager_id) || null;
      }
    } else if (mgrRole === "co") {
      coUser = directManager;
    } else {
      tlUser = directManager;
    }
  }

  return {
    glTeamName,
    glDirectorName,
    coUser,
    coName: coUser ? coUser.full_name : tlUser ? (tlUser.reporting_manager_name ?? null) : null,
    tlUser,
    tlName: tlUser ? tlUser.full_name : (emp.reporting_manager_name ?? null),
  };
}

export default function EmployeesPage() {
  const { user: currentUser } = useAuth();

  const [employees, setEmployees] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
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
  const [teamId, setTeamId] = useState<number | "">("");
  const [reportingManagerId, setReportingManagerId] = useState<number | "">("");
  const [clientCount, setClientCount] = useState<number>(0);
  const [clientShareCount, setClientShareCount] = useState<number>(0);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Teams & Hierarchy states
  const [teams, setTeams] = useState<Team[]>([]);
  const [isManageTeamsOpen, setIsManageTeamsOpen] = useState(false);
  const [manageTeamsTab, setManageTeamsTab] = useState<"tree" | "quick_assign" | "settings">("tree");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDirector, setNewTeamDirector] = useState("");
  const [newTeamOrder, setNewTeamOrder] = useState(0);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDirector, setEditTeamDirector] = useState("");
  const [editTeamOrder, setEditTeamOrder] = useState(0);
  const [editTeamActive, setEditTeamActive] = useState(true);
  const [teamFormSubmitting, setTeamFormSubmitting] = useState(false);
  const [teamFormError, setTeamFormError] = useState<string | null>(null);

  // Quick Assign Staff states
  const [quickAssignUserId, setQuickAssignUserId] = useState<number | "">("");
  const [quickAssignRole, setQuickAssignRole] = useState<UserRole>("employee");
  const [quickAssignTeamId, setQuickAssignTeamId] = useState<number | "">("");
  const [quickAssignManagerId, setQuickAssignManagerId] = useState<number | "">("");
  const [quickAssignLoading, setQuickAssignLoading] = useState(false);
  const [quickAssignSuccess, setQuickAssignSuccess] = useState<string | null>(null);
  const [quickAssignError, setQuickAssignError] = useState<string | null>(null);
  const [quickAssignMode, setQuickAssignMode] = useState<"single" | "batch">("single");
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [batchTargetTeamId, setBatchTargetTeamId] = useState<number | "">("");
  const [batchTargetRole, setBatchTargetRole] = useState<UserRole>("employee");
  const [batchTargetManagerId, setBatchTargetManagerId] = useState<number | "">("");
  const [batchLoading, setBatchLoading] = useState(false);

  // Bulk CSV Upload states
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkDefaultPassword, setBulkDefaultPassword] = useState("Sunset@1234");
  const [bulkShowPassword, setBulkShowPassword] = useState(false);
  const [bulkRole, setBulkRole] = useState<string>("auto");
  const [bulkTargetTeamId, setBulkTargetTeamId] = useState<number | "">("");
  const [bulkTargetManagerId, setBulkTargetManagerId] = useState<number | "">("");
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
        limit: 500,
      });
      const normalized = data.map((u: User) => ({
        ...u,
        role: normalizeRole(u.role, u.designation),
      }));
      setEmployees(normalized);
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

  const loadTeams = useCallback(async () => {
    try {
      const data = await api.teams.list(true);
      setTeams(data);
    } catch (err) {
      console.error("Failed to load teams:", err);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    loadTeams();
  }, [loadEmployees, loadTeams]);

  // Client-side filter combining search, team filter, role and status
  const displayedEmployees = useMemo(() => {
    let list = employees;

    // Filter by Team
    if (teamFilter === "unassigned") {
      list = list.filter((emp) => !emp.team_id);
    } else if (teamFilter !== "all") {
      const tid = Number(teamFilter);
      list = list.filter((emp) => emp.team_id === tid);
    }

    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (emp) =>
        emp.full_name?.toLowerCase().includes(q) ||
        emp.username?.toLowerCase().includes(q) ||
        emp.email?.toLowerCase().includes(q) ||
        emp.phone?.toLowerCase().includes(q) ||
        emp.designation?.toLowerCase().includes(q) ||
        emp.team_name?.toLowerCase().includes(q) ||
        emp.reporting_manager_name?.toLowerCase().includes(q)
    );
  }, [employees, search, teamFilter]);

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

  // Available supervisors grouped by role
  const availableCoordinators = useMemo(() => {
    return employees.filter(
      (e) =>
        normalizeRole(e.role, e.designation) === "co" &&
        e.is_active &&
        (!editingEmployee || e.id !== editingEmployee.id)
    );
  }, [employees, editingEmployee]);

  const availableTeamLeaders = useMemo(() => {
    return employees.filter(
      (e) =>
        normalizeRole(e.role, e.designation) === "tl" &&
        e.is_active &&
        (!editingEmployee || e.id !== editingEmployee.id)
    );
  }, [employees, editingEmployee]);

  const availableOtherStaff = useMemo(() => {
    return employees.filter((e) => {
      const nr = normalizeRole(e.role, e.designation);
      return (
        nr !== "admin" &&
        nr !== "sub_admin" &&
        nr !== "co" &&
        nr !== "tl" &&
        e.is_active &&
        (!editingEmployee || e.id !== editingEmployee.id)
      );
    });
  }, [employees, editingEmployee]);

  interface CreatePreset {
    role?: UserRole;
    teamId?: number | "";
    reportingManagerId?: number | "";
    designation?: string;
  }

  const openCreateModal = (preset?: CreatePreset) => {
    setEditingEmployee(null);
    setEmployeeIdInput("");
    setFullName("");
    setEmail("");
    setPhone("");
    setDesignation(preset?.designation || "");
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setRole(preset?.role ? normalizeRole(preset.role) : "employee");
    setIsActive(true);
    setTeamId(preset?.teamId !== undefined ? preset.teamId : "");
    setReportingManagerId(preset?.reportingManagerId !== undefined ? preset.reportingManagerId : "");
    setClientCount(0);
    setClientShareCount(0);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleQuickAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAssignUserId) return;
    setQuickAssignLoading(true);
    setQuickAssignError(null);
    setQuickAssignSuccess(null);
    try {
      const updated = await api.employees.update(Number(quickAssignUserId), {
        role: quickAssignRole,
        team_id: quickAssignTeamId ? Number(quickAssignTeamId) : null,
        reporting_manager_id: quickAssignManagerId ? Number(quickAssignManagerId) : null,
      });
      const normUpdated = { ...updated, role: normalizeRole(updated.role, updated.designation) };
      setEmployees((prev) =>
        prev.map((item) => (item.id === normUpdated.id ? normUpdated : item))
      );
      await loadEmployees();
      await loadTeams();
      setQuickAssignSuccess(`Hierarchy and role updated successfully for "${updated.full_name}"!`);
      setTimeout(() => setQuickAssignSuccess(null), 3500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setQuickAssignError(err.message);
      } else {
        setQuickAssignError("Failed to update team hierarchy assignment.");
      }
    } finally {
      setQuickAssignLoading(false);
    }
  };

  const unassignedStaff = useMemo(() => {
    return employees.filter((e) => {
      const r = normalizeRole(e.role, e.designation);
      return !e.team_id && r !== "admin" && r !== "sub_admin";
    });
  }, [employees]);

  const handleBatchAssign = async () => {
    if (!batchTargetTeamId || selectedBatchIds.length === 0) return;
    setBatchLoading(true);
    setQuickAssignError(null);
    setQuickAssignSuccess(null);
    try {
      const res = await api.teams.bulkAssign(
        Number(batchTargetTeamId),
        selectedBatchIds,
        batchTargetRole,
        batchTargetManagerId ? Number(batchTargetManagerId) : null
      );
      await loadEmployees();
      await loadTeams();
      const count = selectedBatchIds.length;
      setSelectedBatchIds([]);
      setQuickAssignSuccess(
        res.message || `Successfully assigned ${count} staff members to the selected team.`
      );
      setTimeout(() => setQuickAssignSuccess(null), 3500);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setQuickAssignError(err.message);
      } else {
        setQuickAssignError("Failed to bulk assign staff to team.");
      }
    } finally {
      setBatchLoading(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent =
      "Employee ID,Full Name,Email,Phone Number,Designation,Role,GL Team,Reporting Manager\n" +
      "101,Gazi Coordinator 1,co1@sunset.com,01700000001,Coordinator,co,Gazi Sir Team,\n" +
      "102,Gazi TL 1,tl1@sunset.com,01700000002,Team Leader,tl,Gazi Sir Team,Gazi Coordinator 1\n" +
      "103,Executive 1,exec1@sunset.com,01700000003,Sales Executive,employee,Gazi Sir Team,Gazi TL 1\n" +
      "201,Hasib Coordinator 1,co2@sunset.com,01700000004,Coordinator,co,Hasib Sir Team,\n" +
      "202,Hasib TL 1,tl2@sunset.com,01700000005,Team Leader,tl,Hasib Sir Team,Hasib Coordinator 1\n" +
      "203,Executive 2,exec2@sunset.com,01700000006,Sales Executive,employee,Hasib Sir Team,Hasib TL 1\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Sunset_Staff_Role_Hierarchy_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleSelectBatchId = (id: number) => {
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllUnassigned = () => {
    if (selectedBatchIds.length === unassignedStaff.length) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(unassignedStaff.map((u) => u.id));
    }
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
    setRole(normalizeRole(emp.role, emp.designation));
    setIsActive(emp.is_active);
    setTeamId(emp.team_id ?? "");
    setReportingManagerId(emp.reporting_manager_id ?? "");
    setClientCount(emp.client_count || 0);
    setClientShareCount(emp.client_share_count || 0);
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
      if (bulkTargetTeamId) {
        formData.append("target_team_id", String(bulkTargetTeamId));
      }
      if (bulkTargetManagerId) {
        formData.append("target_manager_id", String(bulkTargetManagerId));
      }
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

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setTeamFormSubmitting(true);
    setTeamFormError(null);
    try {
      await api.teams.create({
        name: newTeamName.trim(),
        director_name: newTeamDirector.trim() || null,
        display_order: Number(newTeamOrder) || 0,
        is_active: true,
      });
      setNewTeamName("");
      setNewTeamDirector("");
      setNewTeamOrder(0);
      await loadTeams();
      setStatusMessage({
        type: "success",
        text: `Team "${newTeamName.trim()}" created successfully.`,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setTeamFormError(err.message);
      } else {
        setTeamFormError("Failed to create team.");
      }
    } finally {
      setTeamFormSubmitting(false);
    }
  };

  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeamId || !editTeamName.trim()) return;
    setTeamFormSubmitting(true);
    setTeamFormError(null);
    try {
      await api.teams.update(editingTeamId, {
        name: editTeamName.trim(),
        director_name: editTeamDirector.trim() || null,
        display_order: Number(editTeamOrder) || 0,
        is_active: editTeamActive,
      });
      setEditingTeamId(null);
      await loadTeams();
      await loadEmployees();
      setStatusMessage({
        type: "success",
        text: `Team "${editTeamName.trim()}" updated successfully.`,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setTeamFormError(err.message);
      } else {
        setTeamFormError("Failed to update team.");
      }
    } finally {
      setTeamFormSubmitting(false);
    }
  };

  const handleDeleteTeam = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete team "${name}"? Members assigned to this team will be unassigned.`)) {
      return;
    }
    try {
      await api.teams.delete(id);
      await loadTeams();
      await loadEmployees();
      setStatusMessage({
        type: "success",
        text: `Team "${name}" deleted successfully.`,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setTeamFormError(err.message);
      } else {
        setTeamFormError("Failed to delete team.");
      }
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
          team_id?: number | null;
          reporting_manager_id?: number | null;
          client_count?: number;
          client_share_count?: number;
        } = {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          designation: designation.trim() || null,
          role: normalizeRole(role),
          is_active: isActive,
          team_id: teamId ? Number(teamId) : null,
          reporting_manager_id: reportingManagerId ? Number(reportingManagerId) : null,
          client_count: Number(clientCount) || 0,
          client_share_count: Number(clientShareCount) || 0,
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
          role: normalizeRole(role),
          team_id: teamId ? Number(teamId) : null,
          reporting_manager_id: reportingManagerId ? Number(reportingManagerId) : null,
          client_count: Number(clientCount) || 0,
          client_share_count: Number(clientShareCount) || 0,
        });
        const normCreated = { ...created, role: normalizeRole(created.role, created.designation) };
        setEmployees((prev) => [normCreated, ...prev]);
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
      <div className="space-y-4">
        {/* Top Navigation Tabs: Staff Directory vs Team Hierarchy */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white shadow-2xs">
              <UserCheck className="w-3.5 h-3.5 text-white" />
              <span>Staff Directory</span>
              <span className="text-[10px] bg-slate-800 text-slate-200 px-1.5 py-0.2 rounded-full">
                {employees.length}
              </span>
            </span>

            <Link
              href="/teams"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 border border-indigo-200 transition"
            >
              <Network className="w-3.5 h-3.5 text-indigo-600" />
              <span>Group & Team Hierarchy</span>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
                {teams.length} Groups
              </span>
            </Link>
          </div>

          <Link
            href="/teams"
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900"
          >
            <span>Open Dynamic Tree ➔</span>
          </Link>
        </div>

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
                    <option value="active">Available (Active Only)</option>
                    <option value="inactive">Unavailable (Inactive Only)</option>
                  </select>
                </div>

                {/* GL Group filter */}
                <div className="flex items-center gap-1.5 text-xs text-slate-700">
                  <span className="font-semibold text-slate-700">Group:</span>
                  <select
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  >
                    <option value="all">All Groups</option>
                    {teams.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name} {t.director_name ? `(${t.director_name})` : ""}
                      </option>
                    ))}
                    <option value="unassigned">Unassigned to Group</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTeamFormError(null);
                    setEditingTeamId(null);
                    setIsManageTeamsOpen(true);
                  }}
                  className="bg-indigo-50 text-indigo-800 border-indigo-300 hover:bg-indigo-100 font-semibold"
                >
                  <Layers className="w-4 h-4 mr-1.5 text-indigo-600" />
                  Manage Teams
                </Button>
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
                <Button variant="primary" size="sm" onClick={() => openCreateModal()}>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-green-700" />
                Staff Accounts Directory
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-slate-500 font-medium">
                  {displayedEmployees.length} {displayedEmployees.length === 1 ? "account" : "accounts"}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {displayedEmployees.filter((e) => e.is_active).length} Available
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600 font-medium inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  {displayedEmployees.filter((e) => !!e.phone).length} with Phone
                </span>
              </div>
            </div>
          </CardHeader>

          {/* ── Mobile App Cards View (< md) ─────────────────────────────────── */}
          <div className="md:hidden space-y-2.5 p-3 sm:p-4">
            {loading && employees.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))
            ) : displayedEmployees.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-200 text-xs">
                No employees match your search criteria.
              </div>
            ) : (
              displayedEmployees.map((emp, idx) => (
                <div
                  key={emp.id}
                  className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2 transition-all hover:border-slate-300"
                >
                  {/* Top Bar: Serial + ID + Role + Actions */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                      <span className="font-mono font-bold text-[10px] bg-slate-50 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1 shadow-2xs">
                        {formatEmployeeId(emp.id, emp.created_at)}
                      </span>
                      {renderRoleBadge(emp.role)}
                      {currentUser?.id === emp.id && (
                        <span className="text-[9.5px] text-green-800 bg-green-50 px-1.5 py-0.2 rounded border border-green-200 font-semibold">
                          You
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(emp)}
                        className="p-1 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                        title="Edit Employee"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {currentUser?.id !== emp.id && (
                        <button
                          onClick={() => setDeleteConfirmId(emp.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 bg-rose-50/70 hover:bg-rose-100 rounded-md border border-rose-200 transition-colors"
                          title="Delete Employee"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Name, Designation & Username */}
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs leading-snug">{emp.full_name}</h3>
                    {emp.designation && (
                      <p className="text-[10px] font-medium text-emerald-700 mt-0.5">{emp.designation}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-mono">@{emp.username}</span>
                      {(() => {
                        const h = resolveHierarchy(emp, employees, teams);
                        return (
                          <>
                            {h.glTeamName ? (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-900 border border-blue-200 inline-flex items-center gap-1">
                                <Crown className="w-2.5 h-2.5 text-blue-700" />
                                {h.glTeamName}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickAssignUserId(emp.id);
                                  setQuickAssignMode("single");
                                  setManageTeamsTab("quick_assign");
                                  setIsManageTeamsOpen(true);
                                }}
                                className="text-[9.5px] font-bold px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1 hover:bg-rose-100"
                              >
                                <AlertTriangle className="w-2 h-2 text-rose-500" />
                                Assign Team
                              </button>
                            )}

                            {normalizeRole(emp.role, emp.designation) === "employee" && h.tlName && (
                              <span className="text-[9.5px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 inline-flex items-center gap-1">
                                <Star className="w-2 h-2 text-amber-600" />
                                TL: {h.tlName}
                              </span>
                            )}

                            {h.coName && (
                              <span className="text-[9.5px] font-semibold text-sky-800 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200 inline-flex items-center gap-1">
                                <Target className="w-2 h-2 text-sky-600" />
                                CO: {h.coName}
                              </span>
                            )}

                            {normalizeRole(emp.role, emp.designation) === "co" && (
                              <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                Direct to GL
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Contact Info (Phone & Email) */}
                  <div className="grid grid-cols-1 gap-1.5 text-[10.5px] pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 text-[10px] font-semibold flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" /> Phone:
                      </span>
                      {emp.phone ? (
                        <a
                          href={`tel:${emp.phone}`}
                          className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shadow-2xs"
                        >
                          <Phone className="w-2.5 h-2.5 text-emerald-600" />
                          <span>{emp.phone}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 italic text-[10px]">
                          Not Available
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-slate-600">
                      <span className="text-slate-500 text-[10px] font-semibold flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" /> Email:
                      </span>
                      <span className="truncate font-medium text-[10.5px] text-slate-700">{emp.email}</span>
                    </div>
                  </div>

                  {/* Bottom: Availability & Member Since */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                    <span
                      className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full ${
                        emp.is_active
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {emp.is_active ? (
                        <>
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          Available
                        </>
                      ) : (
                        <>
                          <XCircle className="w-2.5 h-2.5 text-rose-500" />
                          Unavailable
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
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 text-[10.5px] font-semibold uppercase tracking-wider">
                  <th className="py-2 px-2.5 w-10 text-center">#</th>
                  <th className="py-2 px-2.5 w-24">Employee ID</th>
                  <th className="py-2 px-3">Full Name</th>
                  <th className="py-2 px-2.5">Phone Number</th>
                  <th className="py-2 px-2.5">Email Address</th>
                  <th className="py-2 px-2.5">Team & Hierarchy</th>
                  <th className="py-2 px-2.5 text-center">Clients / Share</th>
                  <th className="py-2 px-2.5">Username</th>
                  <th className="py-2 px-2.5 text-center">Role</th>
                  <th className="py-2 px-2.5 text-center">Availability</th>
                  <th className="py-2 px-2.5">Member Since</th>
                  <th className="py-2 px-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && employees.length === 0 ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-2 px-2.5 text-center"><Skeleton className="h-3 w-4 mx-auto" /></td>
                      <td className="py-2 px-2.5"><Skeleton className="h-3.5 w-14" /></td>
                      <td className="py-2 px-3"><Skeleton className="h-3.5 w-28" /></td>
                      <td className="py-2 px-2.5"><Skeleton className="h-3.5 w-20" /></td>
                      <td className="py-2 px-2.5"><Skeleton className="h-3.5 w-24" /></td>
                      <td className="py-2 px-2.5"><Skeleton className="h-3.5 w-20" /></td>
                      <td className="py-2 px-2.5 text-center"><Skeleton className="h-3.5 w-12 mx-auto" /></td>
                      <td className="py-2 px-2.5"><Skeleton className="h-3.5 w-16" /></td>
                      <td className="py-2 px-2.5 text-center"><Skeleton className="h-3.5 w-14 mx-auto" /></td>
                      <td className="py-2 px-2.5 text-center"><Skeleton className="h-3.5 w-12 mx-auto" /></td>
                      <td className="py-2 px-2.5"><Skeleton className="h-3.5 w-16" /></td>
                      <td className="py-2 px-2.5 text-right"><Skeleton className="h-3.5 w-10 ml-auto" /></td>
                    </tr>
                  ))
                ) : displayedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-slate-400 text-xs">
                      No employees match your search criteria.
                    </td>
                  </tr>
                ) : (
                  displayedEmployees.map((emp, idx) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-2.5 text-center font-mono text-[10px] font-semibold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5">
                        <span className="font-mono font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1 shadow-2xs">
                          {formatEmployeeId(emp.id, emp.created_at)}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-900 text-xs">
                          {emp.full_name}
                          {currentUser?.id === emp.id && (
                            <span className="ml-1 text-[9px] text-green-800 bg-green-50 px-1 py-0.2 rounded font-normal">
                              (You)
                            </span>
                          )}
                        </div>
                        {emp.designation && (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            {emp.designation}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2.5">
                        {emp.phone ? (
                          <a
                            href={`tel:${emp.phone}`}
                            className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 transition-colors shadow-2xs whitespace-nowrap"
                            title={`Call ${emp.phone}`}
                          >
                            <Phone className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                            <span>{emp.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-[10px] inline-flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                            <span>None</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5">
                        <span className="text-slate-700 text-[10.5px] font-medium">{emp.email}</span>
                      </td>
                      <td className="py-2 px-2.5">
                        {(() => {
                          const h = resolveHierarchy(emp, employees, teams);
                          return (
                            <div className="space-y-0.5">
                              {h.glTeamName ? (
                                <div className="inline-flex items-center gap-1 font-bold text-[10px] text-blue-900 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 shadow-2xs">
                                  <Crown className="w-2.5 h-2.5 text-blue-700 shrink-0" />
                                  <span>{h.glTeamName}</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickAssignUserId(emp.id);
                                    setQuickAssignMode("single");
                                    setManageTeamsTab("quick_assign");
                                    setIsManageTeamsOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-[9.5px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded-full transition"
                                  title="Click to assign team and supervisor"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                                  <span>Assign Team</span>
                                </button>
                              )}

                              {(() => {
                                const r = normalizeRole(emp.role, emp.designation);
                                if (r === "co") {
                                  return (
                                    <div className="text-[9.5px] text-sky-800 font-semibold flex items-center gap-1">
                                      <Target className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                                      <span>Direct to GL ({h.glDirectorName || "Director"})</span>
                                    </div>
                                  );
                                }
                                if (r === "tl") {
                                  return (
                                    <div className="text-[9.5px] text-slate-600 font-medium flex items-center gap-1">
                                      <Target className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                                      <span>C.O: {h.coName || <span className="text-amber-700 italic">Unassigned</span>}</span>
                                    </div>
                                  );
                                }
                                if (r === "employee") {
                                  return (
                                    <div className="space-y-0.5">
                                      <div className="text-[9.5px] text-slate-800 font-semibold flex items-center gap-1">
                                        <Star className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                        <span>T.L: {h.tlName || <span className="text-amber-700 italic">None</span>}</span>
                                      </div>
                                      {h.coName && (
                                        <div className="text-[9px] text-slate-500 font-medium flex items-center gap-1">
                                          <Target className="w-2 h-2 text-sky-600 shrink-0" />
                                          <span>C.O: {h.coName}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="text-[9.5px] text-purple-700 font-medium">
                                    HQ Management
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          <span className="text-slate-700 font-semibold" title="Clients">{emp.client_count || 0} C</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-emerald-700 font-semibold" title="Shares">{emp.client_share_count || 0} S</span>
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-slate-600 font-mono text-[10px]">
                        @{emp.username}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        {renderRoleBadge(emp.role)}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full ${
                            emp.is_active
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {emp.is_active ? (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              Available
                            </>
                          ) : (
                            <>
                              <XCircle className="w-2.5 h-2.5 text-rose-500" />
                              Unavailable
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-slate-500 text-[10px]">
                        {formatReadableDate(emp.created_at.slice(0, 10))}
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {currentUser?.id !== emp.id && (
                            <button
                              onClick={() => setDeleteConfirmId(emp.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="Delete Employee"
                            >
                              <Trash2 className="w-3 h-3" />
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

            {/* Team & Hierarchy Assignment */}
            <div className="pt-3 border-t border-slate-200 space-y-3 bg-slate-50/90 p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  Team & Hierarchy Assignment
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsManageTeamsOpen(true);
                  }}
                  className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1"
                >
                  <Users className="w-3 h-3" />
                  Manage Teams
                </button>
              </div>

              {/* Dynamic Hierarchy Selection by Role */}
              {role === "employee" && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] text-blue-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Team Hierarchy:</strong> Assign this Executive to a <strong>GL Team</strong> and select their <strong>Reporting Supervisor (T.L. or C.O.)</strong>.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        1. GL Team (Group Leader Team) *
                      </label>
                      <select
                        value={teamId}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : "";
                          setTeamId(val);
                        }}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                      >
                        <option value="">None (Unassigned GL Team)</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.director_name ? `(${t.director_name})` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">Team Gazi Sir or Team Hasib Sir</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        2. Reporting Supervisor (T.L., C.O., or Member)
                      </label>
                      <select
                        value={reportingManagerId}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : "";
                          setReportingManagerId(val);
                          if (val) {
                            const chosen = employees.find((u) => u.id === val);
                            if (chosen?.team_id) {
                              setTeamId(chosen.team_id);
                            }
                          }
                        }}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                      >
                        <option value="">None (Direct to GL Team / Director)</option>

                        {availableTeamLeaders.length > 0 && (
                          <optgroup label="Team Leaders (T.L.)">
                            {availableTeamLeaders.map((tl) => {
                              const tlTeam = teams.find((t) => t.id === tl.team_id);
                              const tlCo = tl.reporting_manager_id
                                ? employees.find((u) => u.id === tl.reporting_manager_id)
                                : null;
                              const isMatch = teamId && tl.team_id === Number(teamId);
                              return (
                                <option key={tl.id} value={tl.id}>
                                  TL: {tl.full_name} (#{formatEmployeeId(tl.id)}) {tlTeam ? `[${tlTeam.name}]` : "[No Team]"} {tlCo ? `(C.O: ${tlCo.full_name})` : ""} {isMatch ? "✓" : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}

                        {availableCoordinators.length > 0 && (
                          <optgroup label="Coordinators (C.O.)">
                            {availableCoordinators.map((co) => {
                              const coTeam = teams.find((t) => t.id === co.team_id);
                              const isMatch = teamId && co.team_id === Number(teamId);
                              return (
                                <option key={co.id} value={co.id}>
                                  CO: {co.full_name} (#{formatEmployeeId(co.id)}) {coTeam ? `[${coTeam.name}]` : "[No Team]"} {isMatch ? "✓" : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}

                        {availableOtherStaff.length > 0 && (
                          <optgroup label="Other Staff / Team Members">
                            {availableOtherStaff.map((st) => {
                              const stTeam = teams.find((t) => t.id === st.team_id);
                              return (
                                <option key={st.id} value={st.id}>
                                  Staff: {st.full_name} (#{formatEmployeeId(st.id)}) (@{st.username}) {stTeam ? `[${stTeam.name}]` : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Selecting a supervisor auto-syncs their GL Team.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {role === "tl" && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                    <Star className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Team Leader Hierarchy:</strong> Team Leaders report directly to a <strong>Coordinator (C.O.)</strong> in their GL Team or directly to the <strong>GL Director</strong>.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        1. GL Team (Group Leader Team) *
                      </label>
                      <select
                        value={teamId}
                        onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : "")}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                      >
                        <option value="">None (Unassigned GL Team)</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.director_name ? `(${t.director_name})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        2. Select Reporting Coordinator (C.O.)
                      </label>
                      <select
                        value={reportingManagerId}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : "";
                          setReportingManagerId(val);
                          if (val) {
                            const chosenCo = employees.find((u) => u.id === val);
                            if (chosenCo?.team_id) {
                              setTeamId(chosenCo.team_id);
                            }
                          }
                        }}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                      >
                        <option value="">Direct to GL Director (No C.O.)</option>
                        <optgroup label="Coordinators (C.O.)">
                          {availableCoordinators.map((co) => {
                            const coTeam = teams.find((t) => t.id === co.team_id);
                            const isMatch = teamId && co.team_id === Number(teamId);
                            return (
                              <option key={co.id} value={co.id}>
                                CO: {co.full_name} (#{formatEmployeeId(co.id, co.created_at)}) {coTeam ? `[${coTeam.name}]` : "[No Team]"} {isMatch ? "✓" : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                        {availableOtherStaff.length > 0 && (
                          <optgroup label="Other Staff">
                            {availableOtherStaff.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.full_name} (#{formatEmployeeId(st.id, st.created_at)}) (@{st.username})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {availableCoordinators.length === 0 && (
                        <p className="text-[10px] text-amber-700 mt-1">
                          No C.O. accounts created yet. You can assign direct to GL Director or create a C.O.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {role === "co" && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-sky-50/70 border border-sky-200 rounded-lg text-[11px] text-sky-900 flex items-start gap-2">
                    <Target className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Coordinator Hierarchy:</strong> Coordinators report directly to the <strong>GL Director (Gazi Sir / Hasib Sir)</strong> of their assigned team.
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      GL Team (Group Leader Team) *
                    </label>
                    <select
                      value={teamId}
                      onChange={(e) => {
                        setTeamId(e.target.value ? Number(e.target.value) : "");
                        setReportingManagerId(""); // CO reports to top GL
                      }}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                    >
                      <option value="">None (Unassigned GL Team)</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.director_name ? `(${t.director_name})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {(role === "admin" || role === "sub_admin") && (
                <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-lg text-[11px] text-purple-900">
                  <div className="font-semibold flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-purple-600" />
                    Corporate Administration Account
                  </div>
                  <p className="text-[10px] text-purple-700 mt-0.5">
                    Admins have organization-wide supervisory access across all teams. Team assignment is optional.
                  </p>
                </div>
              )}

              {/* Dynamic Live Breadcrumb Preview */}
              {(() => {
                const selectedTeam = teams.find((t) => t.id === Number(teamId));
                const mgr = reportingManagerId
                  ? employees.find((u) => u.id === Number(reportingManagerId))
                  : null;
                const mgrRole = mgr ? normalizeRole(mgr.role, mgr.designation) : null;
                const currentRole = normalizeRole(role, designation);

                const tl = currentRole === "employee" && mgrRole === "tl" ? mgr : null;
                const co =
                  currentRole === "co"
                    ? null
                    : currentRole === "tl"
                    ? (mgrRole === "co" ? mgr : null)
                    : tl?.reporting_manager_id
                    ? employees.find((u) => u.id === tl.reporting_manager_id)
                    : mgrRole === "co"
                    ? mgr
                    : null;

                return (
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Live Hierarchy Path Preview:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      {/* Level 1: GL Team */}
                      <span className="inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                        <Crown className="w-3 h-3 text-blue-700" />
                        {selectedTeam ? selectedTeam.name : "No GL Team Selected"}
                      </span>

                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                      {/* Level 2: C.O. */}
                      {currentRole === "co" ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-300">
                          <Target className="w-3 h-3 text-sky-700" />
                          {fullName.trim() || "New Coordinator"} (C.O.)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-200">
                          <Target className="w-3 h-3 text-sky-700" />
                          {co ? `C.O: ${co.full_name}` : "C.O. Pending"}
                        </span>
                      )}

                      {/* Level 3: T.L. */}
                      {currentRole !== "co" && (
                        <>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {currentRole === "tl" ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300">
                              <Star className="w-3 h-3 text-amber-700" />
                              {fullName.trim() || "New Team Leader"} (T.L.)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                              <Star className="w-3 h-3 text-amber-700" />
                              {tl ? `T.L: ${tl.full_name}` : "T.L. Pending"}
                            </span>
                          )}
                        </>
                      )}

                      {/* Level 4: Executive */}
                      {currentRole === "employee" && (
                        <>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-300">
                            <UserIcon className="w-3 h-3 text-emerald-700" />
                            {fullName.trim() || "New Executive"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Client Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={clientCount}
                    onChange={(e) => setClientCount(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Base assigned clients (or auto from sales)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Assigned Share Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={clientShareCount}
                    onChange={(e) => setClientShareCount(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Column 'Sahre' in executive report</p>
                </div>
              </div>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Select CSV File *
                </label>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 rotate-180" />
                  Download Sample CSV Template
                </button>
              </div>
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
                    Supports columns: Employee ID, Full Name, Email, Phone Number, Designation, Role (co/tl/employee), GL Team, Reporting Manager
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
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Assign Role to Uploaded Employees
                </label>
                <select
                  value={bulkRole}
                  onChange={(e) => setBulkRole(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-green-600 focus:outline-none bg-white"
                >
                  <option value="auto">Auto-detect from Role / Designation in CSV (Recommended)</option>
                  <option value="employee">Sales Executive (Employee)</option>
                  <option value="tl">Team Leader (T.L.)</option>
                  <option value="co">Coordinator (C.O.)</option>
                  <option value="sub_admin">Sub Admin</option>
                  <option value="admin">Administrator</option>
                </select>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Reads &quot;Role&quot; or &quot;Designation&quot; column from CSV, or assigns the selected role to all records in this file.
                </span>
              </div>

              {/* Optional Team and Supervisor for Batch Assign */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Default GL Team (Optional)
                  </label>
                  <select
                    value={bulkTargetTeamId}
                    onChange={(e) => setBulkTargetTeamId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-indigo-600 focus:outline-none"
                  >
                    <option value="">Detect from CSV or Leave Unassigned</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.director_name ? `(${t.director_name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Default Supervisor (Optional)
                  </label>
                  <select
                    value={bulkTargetManagerId}
                    onChange={(e) => setBulkTargetManagerId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-indigo-600 focus:outline-none"
                  >
                    <option value="">Detect from CSV or None</option>
                    <optgroup label="Coordinators (C.O.)">
                      {availableCoordinators.map((co) => (
                        <option key={co.id} value={co.id}>
                          CO: {co.full_name} (#{formatEmployeeId(co.id, co.created_at)}) ({co.team_name || "Team"})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Team Leaders (T.L.)">
                      {availableTeamLeaders.map((tl) => (
                        <option key={tl.id} value={tl.id}>
                          TL: {tl.full_name} (#{formatEmployeeId(tl.id, tl.created_at)}) ({tl.team_name || "Team"})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
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
                  Also reset existing employees&apos; passwords to this default password
                </span>
              </label>

              {bulkResetExisting && (
                <div className="text-[10px] text-amber-700 font-semibold bg-amber-50 p-2 rounded border border-amber-200">
                  Note: Existing employees will need to login with &quot;{bulkDefaultPassword || "the default password"}&quot; after import.
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
        {/* ── Manage Teams Modal ────────────────────────────────────────────── */}
        <Modal
          isOpen={isManageTeamsOpen}
          onClose={() => {
            setIsManageTeamsOpen(false);
            setEditingTeamId(null);
            setQuickAssignSuccess(null);
            setQuickAssignError(null);
          }}
          title="Manage Teams"
          description="Gazi Sir Team & Hasib Sir Team hierarchy and member assignments."
          maxWidth="max-w-3xl"
        >
          <div className="space-y-3.5">
            {teamFormError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {teamFormError}
              </div>
            )}

            {/* Modal Tabs Navigation */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setManageTeamsTab("tree")}
                className={`px-3 py-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  manageTeamsTab === "tree"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Teams & Members
              </button>

              <button
                type="button"
                onClick={() => setManageTeamsTab("quick_assign")}
                className={`px-3 py-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  manageTeamsTab === "quick_assign"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span>Quick Assign</span>
                {unassignedStaff.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 text-amber-900 font-bold">
                    {unassignedStaff.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setManageTeamsTab("settings")}
                className={`px-3 py-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  manageTeamsTab === "settings"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Team Settings ({teams.length})
              </button>
            </div>

            {/* ── TAB 1: Teams & Members ───────────────────────────────────────── */}
            {manageTeamsTab === "tree" && (
              <div className="space-y-3 max-h-[68vh] overflow-y-auto pr-1">
                {/* Compact Global Status Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span><strong>{teams.length}</strong> Teams</span>
                    <span>•</span>
                    <span>
                      <strong>
                        {
                          employees.filter((e) => {
                            const r = normalizeRole(e.role, e.designation);
                            return r !== "admin" && r !== "sub_admin";
                          }).length
                        }
                      </strong>{" "}
                      Total Staff
                    </span>
                    <span>•</span>
                    <span className={unassignedStaff.length > 0 ? "text-amber-700 font-bold" : "text-emerald-700 font-semibold"}>
                      {unassignedStaff.length} Unassigned
                    </span>
                  </div>
                  {unassignedStaff.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAssignMode("batch");
                        setManageTeamsTab("quick_assign");
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline self-start sm:self-auto"
                    >
                      Assign {unassignedStaff.length} Staff
                    </button>
                  )}
                </div>

                {/* Team Cards */}
                {teams.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    No teams configured yet. Go to Team Settings to add Gazi Sir Team and Hasib Sir Team.
                  </div>
                ) : (
                  teams.map((t) => {
                    const membersInTeam = employees.filter((e) => e.team_id === t.id);
                    const cos = membersInTeam.filter((e) => normalizeRole(e.role, e.designation) === "co");
                    const tls = membersInTeam.filter((e) => normalizeRole(e.role, e.designation) === "tl");
                    const execs = membersInTeam.filter((e) => normalizeRole(e.role, e.designation) === "employee");
                    const unmanagedInTeam = membersInTeam.filter(
                      (e) => !e.reporting_manager_id && normalizeRole(e.role, e.designation) === "employee"
                    );

                    return (
                      <div
                        key={t.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition hover:border-slate-300"
                      >
                        {/* Team Header */}
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">
                                {t.name}
                              </span>
                              {t.director_name && (
                                <span className="text-[11px] font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                                  Director: {t.director_name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                              <span>{membersInTeam.length} Members</span>
                              <span>•</span>
                              <span>{cos.length} C.O.</span>
                              <span>•</span>
                              <span>{tls.length} T.L.</span>
                              <span>•</span>
                              <span>{execs.length} Executives</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-start sm:self-center flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setIsManageTeamsOpen(false);
                                openCreateModal({ role: "co", teamId: t.id });
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-300 rounded-lg transition"
                            >
                              + Add C.O.
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsManageTeamsOpen(false);
                                openCreateModal({ role: "tl", teamId: t.id });
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 rounded-lg transition"
                            >
                              + Add T.L.
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsManageTeamsOpen(false);
                                openCreateModal({ role: "employee", teamId: t.id });
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition"
                            >
                              + Add Executive
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBatchTargetTeamId(t.id);
                                setQuickAssignTeamId(t.id);
                                setQuickAssignMode("batch");
                                setManageTeamsTab("quick_assign");
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-lg transition"
                            >
                              Assign Staff
                            </button>
                          </div>
                        </div>

                        {/* Team Body */}
                        <div className="p-3">
                          {membersInTeam.length === 0 ? (
                            <div className="py-4 text-center text-xs text-slate-400 space-y-2">
                              <p>No members assigned to {t.name} yet.</p>
                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsManageTeamsOpen(false);
                                    openCreateModal({ role: "co", teamId: t.id });
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-300 rounded-lg transition"
                                >
                                  + Add First C.O.
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchTargetTeamId(t.id);
                                    setQuickAssignTeamId(t.id);
                                    setQuickAssignMode("batch");
                                    setManageTeamsTab("quick_assign");
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition"
                                >
                                  Assign Staff to this Team
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {/* Coordinators */}
                              {cos.map((co) => {
                                const tlsUnderCo = tls.filter((tl) => tl.reporting_manager_id === co.id);
                                const directExecsUnderCo = execs.filter(
                                  (ex) => ex.reporting_manager_id === co.id
                                );

                                return (
                                  <div
                                    key={co.id}
                                    className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 space-y-2"
                                  >
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                                          C.O.
                                        </span>
                                        <span className="font-semibold text-xs text-slate-900">
                                          {co.full_name}
                                        </span>
                                        <span className="text-[11px] text-slate-500 font-mono">
                                          @{co.username}
                                        </span>
                                        {co.phone && (
                                          <a
                                            href={`tel:${co.phone}`}
                                            className="text-[11px] text-emerald-700 hover:underline"
                                          >
                                            {co.phone}
                                          </a>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setIsManageTeamsOpen(false);
                                            openCreateModal({
                                              role: "tl",
                                              teamId: t.id,
                                              reportingManagerId: co.id,
                                            });
                                          }}
                                          className="px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 rounded"
                                        >
                                          + Add T.L.
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setQuickAssignMode("single");
                                            setQuickAssignRole("tl");
                                            setQuickAssignTeamId(t.id);
                                            setQuickAssignManagerId(co.id);
                                            setManageTeamsTab("quick_assign");
                                          }}
                                          className="px-2 py-0.5 text-[11px] font-medium bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 rounded"
                                          title="Assign an existing staff member as T.L. under this C.O."
                                        >
                                          Assign T.L.
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setIsManageTeamsOpen(false);
                                            openEditModal(co);
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-700"
                                          title="Edit C.O."
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Team Leaders under C.O. */}
                                    {tlsUnderCo.length > 0 && (
                                      <div className="pl-3 sm:pl-4 border-l-2 border-slate-200 space-y-2 pt-1">
                                        {tlsUnderCo.map((tl) => {
                                          const execsUnderTl = execs.filter(
                                            (ex) => ex.reporting_manager_id === tl.id
                                          );

                                          return (
                                            <div
                                              key={tl.id}
                                              className="bg-white border border-slate-200 rounded-lg p-2 space-y-1.5"
                                            >
                                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                                    T.L.
                                                  </span>
                                                  <span className="font-semibold text-xs text-slate-900">
                                                    {tl.full_name}
                                                  </span>
                                                  <span className="text-[10px] text-slate-500 font-mono">
                                                    @{tl.username}
                                                  </span>
                                                  {tl.phone && (
                                                    <span className="text-[10px] text-slate-600">
                                                      {tl.phone}
                                                    </span>
                                                  )}
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setIsManageTeamsOpen(false);
                                                      openCreateModal({
                                                        role: "employee",
                                                        teamId: t.id,
                                                        reportingManagerId: tl.id,
                                                      });
                                                    }}
                                                    className="px-2 py-0.5 text-[10px] font-medium bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded"
                                                  >
                                                    Add Executive
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setIsManageTeamsOpen(false);
                                                      openEditModal(tl);
                                                    }}
                                                    className="p-1 text-slate-400 hover:text-slate-700"
                                                    title="Edit T.L."
                                                  >
                                                    <Edit2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Executives */}
                                              {execsUnderTl.length > 0 && (
                                                <div className="flex flex-wrap gap-1 pt-1">
                                                  {execsUnderTl.map((ex) => (
                                                    <span
                                                      key={ex.id}
                                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700"
                                                    >
                                                      <span>{ex.full_name}</span>
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          setIsManageTeamsOpen(false);
                                                          openEditModal(ex);
                                                        }}
                                                        className="text-slate-400 hover:text-slate-700"
                                                      >
                                                        <Edit2 className="w-2.5 h-2.5" />
                                                      </button>
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Direct Executives under C.O. */}
                                    {directExecsUnderCo.length > 0 && (
                                      <div className="pl-3 sm:pl-4 border-l-2 border-slate-200 pt-1">
                                        <div className="text-[10px] font-semibold text-slate-500 mb-1">
                                          Direct Executives:
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {directExecsUnderCo.map((ex) => (
                                            <span
                                              key={ex.id}
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700"
                                            >
                                              <span>{ex.full_name}</span>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setIsManageTeamsOpen(false);
                                                  openEditModal(ex);
                                                }}
                                                className="text-slate-400 hover:text-slate-700"
                                              >
                                                <Edit2 className="w-2.5 h-2.5" />
                                              </button>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Members in team not assigned to a supervisor */}
                              {unmanagedInTeam.length > 0 && (
                                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                                  <span className="font-semibold text-slate-700 block text-[11px]">
                                    Team Members ({unmanagedInTeam.length}):
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {unmanagedInTeam.map((u) => (
                                      <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => {
                                          setQuickAssignUserId(u.id);
                                          setQuickAssignTeamId(t.id);
                                          setQuickAssignMode("single");
                                          setManageTeamsTab("quick_assign");
                                        }}
                                        className="px-2 py-0.5 rounded bg-white border border-slate-300 text-[11px] text-slate-800 hover:border-indigo-400 transition"
                                      >
                                        {u.full_name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── TAB 2: Quick Assign Staff ────────────────────────────────────── */}
            {manageTeamsTab === "quick_assign" && (
              <div className="space-y-3 max-h-[68vh] overflow-y-auto pr-1">
                {/* Sub-tabs: Batch Assign vs Single Assign */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuickAssignMode("batch")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                        quickAssignMode === "batch"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Batch Assign ({unassignedStaff.length} unassigned)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAssignMode("single")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                        quickAssignMode === "single"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      Single Assign
                    </button>
                  </div>
                </div>

                {quickAssignSuccess && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{quickAssignSuccess}</span>
                  </div>
                )}
                {quickAssignError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                    {quickAssignError}
                  </div>
                )}

                {/* Sub-tab 1: Batch Assign Mode */}
                {quickAssignMode === "batch" ? (
                  <div className="space-y-3 bg-slate-50/70 p-3 sm:p-4 rounded-xl border border-slate-200">
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            1. Target GL Team *
                          </label>
                          <select
                            value={batchTargetTeamId}
                            onChange={(e) =>
                              setBatchTargetTeamId(e.target.value ? Number(e.target.value) : "")
                            }
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                          >
                            <option value="">-- Choose Team --</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} {t.director_name ? `(${t.director_name})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            2. Assign Role *
                          </label>
                          <select
                            value={batchTargetRole}
                            onChange={(e) => {
                              const r = e.target.value as UserRole;
                              setBatchTargetRole(r);
                              if (r === "co") setBatchTargetManagerId("");
                            }}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                          >
                            <option value="employee">Sales Executive</option>
                            <option value="tl">Team Leader (T.L.)</option>
                            <option value="co">Coordinator (C.O.)</option>
                          </select>
                        </div>

                        {batchTargetRole === "tl" && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              3. Reporting Coordinator (C.O.)
                            </label>
                            <select
                              value={batchTargetManagerId}
                              onChange={(e) =>
                                setBatchTargetManagerId(e.target.value ? Number(e.target.value) : "")
                              }
                              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            >
                              <option value="">Direct to GL (No C.O.)</option>
                              <optgroup label="Coordinators (C.O.)">
                                {availableCoordinators.map((co) => (
                                  <option key={co.id} value={co.id}>
                                    CO: {co.full_name} (#{formatEmployeeId(co.id, co.created_at)}) ({co.team_name || "Team"})
                                  </option>
                                ))}
                              </optgroup>
                              {availableOtherStaff.length > 0 && (
                                <optgroup label="Other Staff">
                                  {availableOtherStaff.map((st) => (
                                    <option key={st.id} value={st.id}>
                                      Staff: {st.full_name} (#{formatEmployeeId(st.id, st.created_at)}) (@{st.username})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        )}

                        {batchTargetRole === "employee" && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              3. Supervisor (Optional)
                            </label>
                            <select
                              value={batchTargetManagerId}
                              onChange={(e) =>
                                setBatchTargetManagerId(e.target.value ? Number(e.target.value) : "")
                              }
                              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            >
                              <option value="">Direct to Team / GL (No Supervisor)</option>
                              {availableTeamLeaders.length > 0 && (
                                <optgroup label="Team Leaders (T.L.)">
                                  {availableTeamLeaders.map((tl) => (
                                    <option key={tl.id} value={tl.id}>
                                      TL: {tl.full_name} (#{formatEmployeeId(tl.id, tl.created_at)}) ({tl.team_name || "Team"})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {availableCoordinators.length > 0 && (
                                <optgroup label="Coordinators (C.O.)">
                                  {availableCoordinators.map((co) => (
                                    <option key={co.id} value={co.id}>
                                      CO: {co.full_name} (#{formatEmployeeId(co.id, co.created_at)}) ({co.team_name || "Team"})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {availableOtherStaff.length > 0 && (
                                <optgroup label="Other Staff">
                                  {availableOtherStaff.map((st) => (
                                    <option key={st.id} value={st.id}>
                                      Staff: {st.full_name} (#{formatEmployeeId(st.id, st.created_at)}) (@{st.username})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        )}

                        {batchTargetRole === "co" && (
                          <div className="flex items-center text-xs text-sky-800 bg-sky-50 p-2 rounded border border-sky-200">
                            Coordinators report directly to the GL Director.
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end pt-1">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={!batchTargetTeamId || selectedBatchIds.length === 0 || batchLoading}
                          loading={batchLoading}
                          onClick={handleBatchAssign}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          Assign {selectedBatchIds.length} Staff as{" "}
                          {batchTargetRole === "tl"
                            ? "Team Leaders"
                            : batchTargetRole === "co"
                            ? "Coordinators"
                            : "Executives"}{" "}
                          to Team
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 text-slate-600 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={selectAllUnassigned}
                        className="font-semibold text-indigo-600 hover:underline"
                      >
                        {selectedBatchIds.length === unassignedStaff.length
                          ? "Deselect All"
                          : `Select All Unassigned (${unassignedStaff.length})`}
                      </button>
                      <span>
                        {selectedBatchIds.length} of {unassignedStaff.length} selected
                      </span>
                    </div>

                    {unassignedStaff.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        All staff members are currently assigned to a team.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                        {unassignedStaff.map((u) => {
                          const isSelected = selectedBatchIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              onClick={() => toggleSelectBatchId(u.id)}
                              className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition select-none ${
                                isSelected
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-950 font-medium"
                                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded text-indigo-600 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold">{u.full_name}</div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  @{u.username} • {u.role.toUpperCase()} {u.phone ? `• ${u.phone}` : ""}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Sub-tab 2: Single Assign Mode */
                  <form
                    onSubmit={handleQuickAssign}
                    className="space-y-3 bg-slate-50/70 p-3 sm:p-4 rounded-xl border border-slate-200"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Staff Account *
                      </label>
                      <select
                        value={quickAssignUserId}
                        required
                        onChange={(e) => {
                          const idVal = e.target.value ? Number(e.target.value) : "";
                          setQuickAssignUserId(idVal);
                          if (idVal) {
                            const sel = employees.find((u) => u.id === idVal);
                            const selRole = normalizeRole(sel?.role, sel?.designation);
                            if (!quickAssignTeamId && sel?.team_id) {
                              setQuickAssignTeamId(sel.team_id);
                            }
                            if (quickAssignRole === "employee" && selRole !== "employee") {
                              setQuickAssignRole(selRole);
                            }
                            if (!quickAssignManagerId && sel?.reporting_manager_id) {
                              setQuickAssignManagerId(sel.reporting_manager_id);
                            }
                          }
                        }}
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                      >
                        <option value="">-- Choose Employee --</option>
                        <optgroup label="Unassigned Staff">
                          {employees
                            .filter((u) => {
                              const r = normalizeRole(u.role, u.designation);
                              return !u.team_id && r !== "admin" && r !== "sub_admin";
                            })
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.full_name} (#{formatEmployeeId(u.id, u.created_at)}) (@{u.username}) — {normalizeRole(u.role, u.designation).toUpperCase()}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Currently Assigned Staff">
                          {employees
                            .filter((u) => {
                              const r = normalizeRole(u.role, u.designation);
                              return !!u.team_id && r !== "admin" && r !== "sub_admin";
                            })
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.full_name} (#{formatEmployeeId(u.id, u.created_at)}) (@{u.username}) — {u.team_name || "Assigned"} ({normalizeRole(u.role, u.designation).toUpperCase()})
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>

                    {quickAssignUserId && (
                      <div className="space-y-3 pt-2 border-t border-slate-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Role Assignment *
                            </label>
                            <select
                              value={quickAssignRole}
                              onChange={(e) => {
                                const newR = e.target.value as UserRole;
                                setQuickAssignRole(newR);
                                if (newR === "co") setQuickAssignManagerId("");
                              }}
                              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            >
                              <option value="employee">Sales Executive</option>
                              <option value="tl">Team Leader (T.L.)</option>
                              <option value="co">Coordinator (C.O.)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              GL Team *
                            </label>
                            <select
                              value={quickAssignTeamId}
                              required
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : "";
                                setQuickAssignTeamId(val);
                              }}
                              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            >
                              <option value="">-- Select Team --</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} {t.director_name ? `(${t.director_name})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {quickAssignRole === "tl" && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Reporting Coordinator (C.O.)
                            </label>
                            <select
                              value={quickAssignManagerId}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : "";
                                setQuickAssignManagerId(val);
                                if (val) {
                                  const co = employees.find((u) => u.id === val);
                                  if (co?.team_id) setQuickAssignTeamId(co.team_id);
                                }
                              }}
                              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            >
                              <option value="">Direct to GL Director (No C.O.)</option>
                              <optgroup label="Coordinators (C.O.)">
                                {availableCoordinators
                                  .filter((co) => co.id !== quickAssignUserId)
                                  .map((co) => {
                                    const coTeam = teams.find((t) => t.id === co.team_id);
                                    return (
                                      <option key={co.id} value={co.id}>
                                        CO: {co.full_name} (#{formatEmployeeId(co.id, co.created_at)}) {coTeam ? `[${coTeam.name}]` : "[No Team]"}
                                      </option>
                                    );
                                  })}
                              </optgroup>
                              {availableOtherStaff.length > 0 && (
                                <optgroup label="Other Staff">
                                  {availableOtherStaff
                                    .filter((st) => st.id !== quickAssignUserId)
                                    .map((st) => (
                                      <option key={st.id} value={st.id}>
                                        {st.full_name} (#{formatEmployeeId(st.id, st.created_at)}) (@{st.username})
                                      </option>
                                    ))}
                                </optgroup>
                              )}
                            </select>
                            {availableCoordinators.length === 0 && (
                              <p className="text-[10px] text-amber-700 mt-1">
                                No Coordinators exist yet. This T.L. will report directly to the GL Director.
                              </p>
                            )}
                          </div>
                        )}

                        {quickAssignRole === "employee" && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Supervisor (T.L., C.O., or Staff)
                            </label>
                            <select
                              value={quickAssignManagerId}
                              onChange={(e) => {
                                const val = e.target.value ? Number(e.target.value) : "";
                                setQuickAssignManagerId(val);
                                if (val) {
                                  const s = employees.find((u) => u.id === val);
                                  if (s?.team_id) setQuickAssignTeamId(s.team_id);
                                }
                              }}
                              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            >
                              <option value="">None (Reports directly to Team / GL)</option>
                              {availableTeamLeaders.length > 0 && (
                                <optgroup label="Team Leaders (T.L.)">
                                  {availableTeamLeaders
                                    .filter((tl) => tl.id !== quickAssignUserId)
                                    .map((tl) => {
                                      const tlTeam = teams.find((t) => t.id === tl.team_id);
                                      return (
                                        <option key={tl.id} value={tl.id}>
                                          TL: {tl.full_name} (#{formatEmployeeId(tl.id, tl.created_at)}) {tlTeam ? `[${tlTeam.name}]` : "[No Team]"}
                                        </option>
                                      );
                                    })}
                                </optgroup>
                              )}
                              {availableCoordinators.length > 0 && (
                                <optgroup label="Coordinators (C.O.)">
                                  {availableCoordinators
                                    .filter((co) => co.id !== quickAssignUserId)
                                    .map((co) => {
                                      const coTeam = teams.find((t) => t.id === co.team_id);
                                      return (
                                        <option key={co.id} value={co.id}>
                                          CO: {co.full_name} (#{formatEmployeeId(co.id, co.created_at)}) {coTeam ? `[${coTeam.name}]` : "[No Team]"}
                                        </option>
                                      );
                                    })}
                                </optgroup>
                              )}
                              {availableOtherStaff.length > 0 && (
                                <optgroup label="Other Staff">
                                  {availableOtherStaff
                                    .filter((st) => st.id !== quickAssignUserId)
                                    .map((st) => {
                                      const stTeam = teams.find((t) => t.id === st.team_id);
                                      return (
                                        <option key={st.id} value={st.id}>
                                          Staff: {st.full_name} (#{formatEmployeeId(st.id, st.created_at)}) (@{st.username}) {stTeam ? `[${stTeam.name}]` : ""}
                                        </option>
                                      );
                                    })}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        )}

                        {quickAssignRole === "co" && (
                          <div className="p-2 bg-sky-50 border border-sky-200 rounded text-xs text-sky-800">
                            Coordinators report directly to the GL Director of their team.
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        loading={quickAssignLoading}
                        disabled={quickAssignLoading || !quickAssignUserId}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        Save Assignment
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ── TAB 3: Team Settings ────────────────────────────────────────── */}
            {manageTeamsTab === "settings" && (
              <div className="space-y-4 max-h-[68vh] overflow-y-auto pr-1">
                {/* Existing Teams List */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                    Configured Teams ({teams.length})
                  </span>

                  {teams.length === 0 ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                      No teams created yet. Add your first team below.
                    </div>
                  ) : (
                    teams.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex flex-col gap-2 transition hover:border-slate-300"
                      >
                        {editingTeamId === t.id ? (
                          <form onSubmit={handleUpdateTeam} className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                                  Team Name *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={editTeamName}
                                  onChange={(e) => setEditTeamName(e.target.value)}
                                  className="w-full border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-600 bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                                  Director / Head Name
                                </label>
                                <input
                                  type="text"
                                  value={editTeamDirector}
                                  onChange={(e) => setEditTeamDirector(e.target.value)}
                                  placeholder="e.g. Gazi Sir"
                                  className="w-full border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-600 bg-white"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-[11px] text-slate-600 font-medium">Order:</span>
                                  <input
                                    type="number"
                                    value={editTeamOrder}
                                    onChange={(e) => setEditTeamOrder(Number(e.target.value) || 0)}
                                    className="w-14 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-center"
                                  />
                                </div>
                                <label className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editTeamActive}
                                    onChange={(e) => setEditTeamActive(e.target.checked)}
                                    className="rounded text-indigo-600"
                                  />
                                  <span>Active</span>
                                </label>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingTeamId(null)}
                                  disabled={teamFormSubmitting}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="submit"
                                  variant="primary"
                                  size="sm"
                                  loading={teamFormSubmitting}
                                  className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                  Save Changes
                                </Button>
                              </div>
                            </div>
                          </form>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 text-xs">{t.name}</span>
                                {t.director_name && (
                                  <span className="text-[11px] text-indigo-700 font-medium bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                    {t.director_name}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                                  Seq #{t.display_order}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 mt-0.5 block">
                                {t.member_count} active {t.member_count === 1 ? "member" : "members"} assigned
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTeamId(t.id);
                                  setEditTeamName(t.name);
                                  setEditTeamDirector(t.director_name || "");
                                  setEditTeamOrder(t.display_order);
                                  setEditTeamActive(t.is_active);
                                }}
                                className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                title="Edit Team"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTeam(t.id, t.name)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                title="Delete Team"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add New Team Box */}
                <div className="pt-3 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                    Create New Team
                  </span>
                  <form onSubmit={handleCreateTeam} className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Team Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Gazi Sir Team"
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-600 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                          Director Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Gazi Sir"
                          value={newTeamDirector}
                          onChange={(e) => setNewTeamDirector(e.target.value)}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-600 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-[11px] text-slate-600 font-medium">Display Sequence:</span>
                        <input
                          type="number"
                          value={newTeamOrder}
                          onChange={(e) => setNewTeamOrder(Number(e.target.value) || 0)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-center bg-white"
                        />
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        loading={teamFormSubmitting}
                        disabled={teamFormSubmitting || !newTeamName.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        Add Team
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
