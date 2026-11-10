"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Network,
  Users,
  UserCheck,
  UserPlus,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  Phone,
  Shield,
  Trash2,
  Edit2,
  Search,
  Check,
  Layers,
  Plus,
  X,
  AlertTriangle,
  FolderPlus,
  Building2,
  Crown,
  Star,
  Target,
  User as UserIcon,
  RefreshCw,
  SlidersHorizontal,
  ChevronsUpDown,
} from "lucide-react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button, Badge, Card, CardContent, Modal, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { User, UserRole, Team } from "@/types";
import { cn, formatEmployeeId } from "@/lib/utils";

// ─── Role Normalization ───────────────────────────────────────────────────────
function normalizeRole(role?: string | null, designation?: string | null): UserRole {
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

export default function TeamHierarchyPage() {
  const router = useRouter();
  const { user: currentUser, isAdmin, isSubAdmin, loading: authLoading } = useAuth();

  // ─── Data States ────────────────────────────────────────────────────────────
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // ─── View & Filter States ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("all");
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // ─── Modals State ───────────────────────────────────────────────────────────
  // 1. Add CO modal
  const [addCoModal, setAddCoModal] = useState<{ isOpen: boolean; team: Team | null }>({
    isOpen: false,
    team: null,
  });
  const [addCoMode, setAddCoMode] = useState<"existing" | "new">("existing");
  const [selectedExistingCoId, setSelectedExistingCoId] = useState<number | "">("");
  const [newCoName, setNewCoName] = useState("");
  const [newCoUsername, setNewCoUsername] = useState("");
  const [newCoPhone, setNewCoPhone] = useState("");
  const [newCoPassword, setNewCoPassword] = useState("Sunset@1234");
  const [coSubmitting, setCoSubmitting] = useState(false);

  // 2. Add TL modal
  const [addTlModal, setAddTlModal] = useState<{
    isOpen: boolean;
    team: Team | null;
    co: User | null;
  }>({
    isOpen: false,
    team: null,
    co: null,
  });
  const [addTlMode, setAddTlMode] = useState<"existing" | "new">("existing");
  const [selectedExistingTlId, setSelectedExistingTlId] = useState<number | "">("");
  const [newTlName, setNewTlName] = useState("");
  const [newTlUsername, setNewTlUsername] = useState("");
  const [newTlPhone, setNewTlPhone] = useState("");
  const [newTlPassword, setNewTlPassword] = useState("Sunset@1234");
  const [tlSubmitting, setTlSubmitting] = useState(false);

  // 3. Add Executives to TL modal
  const [addExecsModal, setAddExecsModal] = useState<{
    isOpen: boolean;
    team: Team | null;
    co: User | null;
    tl: User | null;
  }>({
    isOpen: false,
    team: null,
    co: null,
    tl: null,
  });
  const [execFilterMode, setExecFilterMode] = useState<"unassigned" | "all">("unassigned");
  const [execSearchQuery, setExecSearchQuery] = useState("");
  const [selectedExecIds, setSelectedExecIds] = useState<number[]>([]);
  const [execSubmitting, setExecSubmitting] = useState(false);

  // 4. Move / Reassign modal
  const [moveModal, setMoveModal] = useState<{
    isOpen: boolean;
    employee: User | null;
  }>({
    isOpen: false,
    employee: null,
  });
  const [targetRole, setTargetRole] = useState<UserRole>("employee");
  const [targetTeamId, setTargetTeamId] = useState<number | "">("");
  const [targetManagerId, setTargetManagerId] = useState<number | "">("");
  const [moveSubmitting, setMoveSubmitting] = useState(false);

  // 5. Team Management (New / Edit GL Team)
  const [teamModal, setTeamModal] = useState<{
    isOpen: boolean;
    editingTeam: Team | null;
  }>({
    isOpen: false,
    editingTeam: null,
  });
  const [teamFormName, setTeamFormName] = useState("");
  const [teamFormDirector, setTeamFormDirector] = useState("");
  const [teamFormOrder, setTeamFormOrder] = useState(0);
  const [teamFormSubmitting, setTeamFormSubmitting] = useState(false);

  // 6. Delete / Unassign Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    onConfirm: async () => {},
  });
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // ─── Fetch Data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [fetchedTeams, fetchedEmployees] = await Promise.all([
        api.teams.list(true),
        api.employees.list({ is_active: true }),
      ]);
      setTeams(fetchedTeams);
      setEmployees(fetchedEmployees);
    } catch (err: any) {
      setError(err?.message || "Failed to load teams & hierarchy data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (isAdmin || isSubAdmin)) {
      loadData();
    }
  }, [authLoading, isAdmin, isSubAdmin, loadData]);

  // Toast Auto-dismiss
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
  };

  // ─── Expand / Collapse helpers ──────────────────────────────────────────────
  const toggleNode = (nodeId: string) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const isCollapsed = (nodeId: string) => !!collapsedNodes[nodeId];

  const expandAll = () => {
    setCollapsedNodes({});
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    teams.forEach((t) => {
      next[`team-${t.id}`] = true;
    });
    setCollapsedNodes(next);
  };

  // ─── Computed Hierarchy Metrics ─────────────────────────────────────────────
  const stats = useMemo(() => {
    let totalCo = 0;
    let totalTl = 0;
    let totalExec = 0;
    let totalUnassigned = 0;

    employees.forEach((emp) => {
      const role = normalizeRole(emp.role, emp.designation);
      if (role === "admin" || role === "sub_admin") return;
      if (!emp.team_id) {
        totalUnassigned++;
      }
      if (role === "co") totalCo++;
      else if (role === "tl") totalTl++;
      else if (role === "employee") totalExec++;
    });

    return {
      teamsCount: teams.length,
      totalCo,
      totalTl,
      totalExec,
      totalUnassigned,
      totalStaff: employees.filter((e) => {
        const r = normalizeRole(e.role, e.designation);
        return r !== "admin" && r !== "sub_admin";
      }).length,
    };
  }, [teams, employees]);

  // ─── Filtered Data ──────────────────────────────────────────────────────────
  const visibleTeams = useMemo(() => {
    if (selectedTeamFilter === "all") return teams;
    if (selectedTeamFilter === "unassigned") return [];
    const teamIdNum = parseInt(selectedTeamFilter, 10);
    return teams.filter((t) => t.id === teamIdNum);
  }, [teams, selectedTeamFilter]);

  const unassignedEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const role = normalizeRole(emp.role, emp.designation);
      return !emp.team_id && role !== "admin" && role !== "sub_admin";
    });
  }, [employees]);

  // Available staff for promoting/assigning (excluding admins)
  const assignableEmployees = useMemo(() => {
    return employees.filter((e) => {
      const r = normalizeRole(e.role, e.designation);
      return r !== "admin" && r !== "sub_admin";
    });
  }, [employees]);

  // ─── Actions: Team CRUD ─────────────────────────────────────────────────────
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamFormName.trim()) return;
    setTeamFormSubmitting(true);
    try {
      if (teamModal.editingTeam) {
        await api.teams.update(teamModal.editingTeam.id, {
          name: teamFormName.trim(),
          director_name: teamFormDirector.trim() || undefined,
          display_order: teamFormOrder,
        });
        showToast(`Team "${teamFormName.trim()}" updated successfully`);
      } else {
        await api.teams.create({
          name: teamFormName.trim(),
          director_name: teamFormDirector.trim() || undefined,
          display_order: teamFormOrder,
          is_active: true,
        });
        showToast(`New Team "${teamFormName.trim()}" created successfully`);
      }
      setTeamModal({ isOpen: false, editingTeam: null });
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to save team");
    } finally {
      setTeamFormSubmitting(false);
    }
  };

  const handleDeleteTeam = (team: Team) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete ${team.name}?`,
      description: `Deleting this team will unassign all its Coordinators, Team Leaders, and Executives, but will NOT delete their accounts.`,
      confirmLabel: "Delete Team",
      onConfirm: async () => {
        setConfirmSubmitting(true);
        try {
          await api.teams.delete(team.id);
          showToast(`Team "${team.name}" deleted. Members unassigned.`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          await loadData();
        } catch (err: any) {
          alert(err?.message || "Failed to delete team");
        } finally {
          setConfirmSubmitting(false);
        }
      },
    });
  };

  // ─── Actions: Add Coordinator (C.O.) ────────────────────────────────────────
  const handleAddCo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCoModal.team) return;
    setCoSubmitting(true);
    try {
      if (addCoMode === "existing") {
        if (!selectedExistingCoId) {
          alert("Please select an existing staff member");
          setCoSubmitting(false);
          return;
        }
        try {
          await api.teams.bulkAssign(
            addCoModal.team.id,
            [Number(selectedExistingCoId)],
            "co",
            0
          );
        } catch {
          await api.employees.update(Number(selectedExistingCoId), {
            team_id: addCoModal.team.id,
            role: "co",
            reporting_manager_id: null,
          });
        }
        showToast(`Staff assigned as Coordinator for ${addCoModal.team.name}`);
      } else {
        if (!newCoName.trim() || !newCoUsername.trim()) {
          alert("Please enter full name and username");
          setCoSubmitting(false);
          return;
        }
        await api.employees.create({
          full_name: newCoName.trim(),
          username: newCoUsername.trim().toLowerCase(),
          email: `${newCoUsername.trim().toLowerCase()}@sunsetgroup.com`,
          phone: newCoPhone.trim() || null,
          password: newCoPassword,
          role: "co",
          team_id: addCoModal.team.id,
          reporting_manager_id: null,
          designation: "Coordinator (C.O.)",
        });
        showToast(`New Coordinator created for ${addCoModal.team.name}`);
      }
      setAddCoModal({ isOpen: false, team: null });
      setSelectedExistingCoId("");
      setNewCoName("");
      setNewCoUsername("");
      setNewCoPhone("");
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to add Coordinator");
    } finally {
      setCoSubmitting(false);
    }
  };

  // ─── Actions: Add Team Leader (T.L.) ────────────────────────────────────────
  const handleAddTl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTlModal.team || !addTlModal.co) return;
    setTlSubmitting(true);
    try {
      if (addTlMode === "existing") {
        if (!selectedExistingTlId) {
          alert("Please select an existing staff member");
          setTlSubmitting(false);
          return;
        }
        try {
          await api.teams.bulkAssign(
            addTlModal.team.id,
            [Number(selectedExistingTlId)],
            "tl",
            addTlModal.co.id
          );
        } catch {
          await api.employees.update(Number(selectedExistingTlId), {
            team_id: addTlModal.team.id,
            role: "tl",
            reporting_manager_id: addTlModal.co.id,
          });
        }
        showToast(`Staff assigned as Team Leader under C.O. ${addTlModal.co.full_name}`);
      } else {
        if (!newTlName.trim() || !newTlUsername.trim()) {
          alert("Please enter full name and username");
          setTlSubmitting(false);
          return;
        }
        await api.employees.create({
          full_name: newTlName.trim(),
          username: newTlUsername.trim().toLowerCase(),
          email: `${newTlUsername.trim().toLowerCase()}@sunsetgroup.com`,
          phone: newTlPhone.trim() || null,
          password: newTlPassword,
          role: "tl",
          team_id: addTlModal.team.id,
          reporting_manager_id: addTlModal.co.id,
          designation: "Team Leader (T.L.)",
        });
        showToast(`New Team Leader created under C.O. ${addTlModal.co.full_name}`);
      }
      setAddTlModal({ isOpen: false, team: null, co: null });
      setSelectedExistingTlId("");
      setNewTlName("");
      setNewTlUsername("");
      setNewTlPhone("");
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to add Team Leader");
    } finally {
      setTlSubmitting(false);
    }
  };

  // ─── Actions: Add Executives to T.L. ────────────────────────────────────────
  const handleAssignExecutives = async () => {
    if (!addExecsModal.team || !addExecsModal.tl) return;
    if (selectedExecIds.length === 0) {
      alert("Please select at least one executive to assign");
      return;
    }
    setExecSubmitting(true);
    try {
      await api.teams.bulkAssign(
        addExecsModal.team.id,
        selectedExecIds,
        "employee",
        addExecsModal.tl.id
      );
      showToast(`Assigned ${selectedExecIds.length} Executives to T.L. ${addExecsModal.tl.full_name}`);
      setAddExecsModal({ isOpen: false, team: null, co: null, tl: null });
      setSelectedExecIds([]);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to assign executives");
    } finally {
      setExecSubmitting(false);
    }
  };

  // ─── Actions: Move / Reassign Employee ──────────────────────────────────────
  const openMoveModal = (emp: User) => {
    const currentRole = normalizeRole(emp.role, emp.designation);
    setTargetRole(currentRole);
    setTargetTeamId(emp.team_id || "");
    setTargetManagerId(emp.reporting_manager_id || "");
    setMoveModal({ isOpen: true, employee: emp });
  };

  const handleSaveMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveModal.employee) return;
    setMoveSubmitting(true);
    try {
      const payload: any = {
        role: targetRole,
        team_id: targetTeamId === "" ? null : Number(targetTeamId),
        reporting_manager_id: targetManagerId === "" ? null : Number(targetManagerId),
      };
      if (targetTeamId !== "") {
        try {
          await api.teams.bulkAssign(
            Number(targetTeamId),
            [moveModal.employee.id],
            targetRole,
            targetManagerId === "" ? 0 : Number(targetManagerId)
          );
        } catch {
          await api.employees.update(moveModal.employee.id, payload);
        }
      } else {
        await api.employees.update(moveModal.employee.id, payload);
      }
      showToast(`Updated hierarchy assignment for ${moveModal.employee.full_name}`);
      setMoveModal({ isOpen: false, employee: null });
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to move staff member");
    } finally {
      setMoveSubmitting(false);
    }
  };

  // ─── Actions: Unassign Staff from Hierarchy ─────────────────────────────────
  const handleUnassignStaff = (emp: User, roleLabel: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Unassign ${emp.full_name}?`,
      description: `This will remove ${emp.full_name} (${roleLabel}) from their current team and supervisor. Their user account will remain active as an unassigned staff member.`,
      confirmLabel: "Unassign Staff",
      onConfirm: async () => {
        setConfirmSubmitting(true);
        try {
          await api.employees.update(emp.id, {
            team_id: null,
            reporting_manager_id: null,
            role: "employee",
          });
          showToast(`Unassigned ${emp.full_name} from team`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          await loadData();
        } catch (err: any) {
          alert(err?.message || "Failed to unassign staff");
        } finally {
          setConfirmSubmitting(false);
        }
      },
    });
  };

  // ─── Quick Assign Unassigned Staff (Batch) ──────────────────────────────────
  const [quickBatchTeamId, setQuickBatchTeamId] = useState<number | "">("");
  const [quickBatchRole, setQuickBatchRole] = useState<UserRole>("employee");
  const [quickBatchManagerId, setQuickBatchManagerId] = useState<number | "">("");
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<number[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const handleBatchAssignUnassigned = async () => {
    if (selectedUnassignedIds.length === 0) {
      alert("Please select unassigned staff members");
      return;
    }
    if (!quickBatchTeamId) {
      alert("Please select a target GL Team");
      return;
    }
    setBatchSubmitting(true);
    try {
      await api.teams.bulkAssign(
        Number(quickBatchTeamId),
        selectedUnassignedIds,
        quickBatchRole,
        quickBatchManagerId ? Number(quickBatchManagerId) : undefined
      );
      showToast(`Assigned ${selectedUnassignedIds.length} staff members successfully`);
      setSelectedUnassignedIds([]);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to assign staff");
    } finally {
      setBatchSubmitting(false);
    }
  };

  // ─── Security Check ─────────────────────────────────────────────────────────
  if (!authLoading && !isAdmin && !isSubAdmin) {
    return (
      <DashboardLayout title="Team Hierarchy" subtitle="Access Restricted">
        <div className="max-w-md mx-auto my-12 p-6 bg-white border border-rose-200 rounded-xl text-center shadow-sm">
          <Shield className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">Administrator Access Required</h2>
          <p className="text-xs text-slate-500 mt-1">
            Only administrators and sub-administrators can view and manage the team organizational hierarchy.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout
      title="Team & Hierarchy Management"
      subtitle="Organize dynamic GL Teams, Coordinators (C.O.), Team Leaders (T.L.), and Executives."
    >
      <div className="space-y-4 max-w-7xl mx-auto pb-12">
        {/* Success Toast */}
        {successToast && (
          <div className="fixed top-20 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-xs font-medium animate-in slide-in-from-top-3">
            <Check className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>{successToast}</span>
            <button
              onClick={() => setSuccessToast(null)}
              className="ml-2 text-emerald-200 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Navigation Tabs: Staff Directory vs Team Hierarchy */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <Link
              href="/employees"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
            >
              <UserCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Staff Directory</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full border border-slate-200">
                {stats.totalStaff}
              </span>
            </Link>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs">
              <Network className="w-3.5 h-3.5 text-indigo-600" />
              <span>Team Hierarchy Tree</span>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
                {stats.teamsCount} Teams
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              loading={loading}
              className="text-xs h-8"
              title="Refresh hierarchy"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setTeamFormName("");
                setTeamFormDirector("");
                setTeamFormOrder(teams.length);
                setTeamModal({ isOpen: true, editingTeam: null });
              }}
              className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs h-8"
            >
              <FolderPlus className="w-3.5 h-3.5 mr-1" />
              + New GL Team
            </Button>
          </div>
        </div>

        {/* Hierarchy Stats Overview Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">GL Teams</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{stats.teamsCount}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-sky-600">Coordinators (C.O.)</p>
              <p className="text-xl font-bold text-sky-900 mt-0.5">{stats.totalCo}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-amber-600">Team Leaders (T.L.)</p>
              <p className="text-xl font-bold text-amber-900 mt-0.5">{stats.totalTl}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Star className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-emerald-600">Executives</p>
              <p className="text-xl font-bold text-emerald-900 mt-0.5">{stats.totalExec}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserIcon className="w-4 h-4" />
            </div>
          </div>

          <div
            onClick={() => setSelectedTeamFilter("unassigned")}
            className="cursor-pointer bg-white hover:bg-rose-50/50 transition p-3 rounded-xl border border-slate-200 col-span-2 sm:col-span-1 flex items-center justify-between"
            title="Click to view unassigned staff"
          >
            <div>
              <p className="text-[10px] uppercase font-bold text-rose-600">Unassigned Staff</p>
              <p className="text-xl font-bold text-rose-700 mt-0.5">{stats.totalUnassigned}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Filter and Search Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff, C.O., T.L., or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={selectedTeamFilter}
              onChange={(e) => setSelectedTeamFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All GL Teams ({teams.length})</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id.toString()}>
                  {t.name}
                </option>
              ))}
              <option value="unassigned">Unassigned Staff ({stats.totalUnassigned})</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-rose-800 text-xs flex items-center justify-between">
            <span>{error}</span>
            <Button size="sm" variant="danger" onClick={loadData}>
              Retry
            </Button>
          </div>
        )}

        {/* ─── HIERARCHY TREE CONTENT ────────────────────────────────────────── */}
        {!loading && (
          <div className="space-y-4">
            {/* If Teams exist, render each GL Team Card */}
            {visibleTeams.map((team) => {
              const teamMembers = employees.filter((e) => e.team_id === team.id);
              const cos = teamMembers.filter((e) => normalizeRole(e.role, e.designation) === "co");
              const tls = teamMembers.filter((e) => normalizeRole(e.role, e.designation) === "tl");
              const execs = teamMembers.filter((e) => normalizeRole(e.role, e.designation) === "employee");

              // Filter by search query if any
              const query = searchQuery.trim().toLowerCase();
              const isMatch = (u: User) =>
                !query ||
                u.full_name.toLowerCase().includes(query) ||
                u.username.toLowerCase().includes(query) ||
                (u.phone && u.phone.includes(query));

              const teamNodeKey = `team-${team.id}`;
              const teamCollapsed = isCollapsed(teamNodeKey);

              return (
                <div
                  key={team.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden transition-all"
                >
                  {/* GL Team Level Header */}
                  <div className="p-3.5 sm:p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleNode(teamNodeKey)}
                        className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition"
                        title={teamCollapsed ? "Expand Team" : "Collapse Team"}
                      >
                        {teamCollapsed ? (
                          <ChevronRight className="w-5 h-5 text-slate-700" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-700" />
                        )}
                      </button>

                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900">{team.name}</h3>
                          {team.director_name && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Director: {team.director_name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {cos.length} Coordinators • {tls.length} Team Leaders • {execs.length} Executives
                        </p>
                      </div>
                    </div>

                    {/* Team Header Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setAddCoModal({ isOpen: true, team });
                          setAddCoMode("existing");
                          setSelectedExistingCoId("");
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-2xs transition"
                        title="Add or assign a Coordinator to this GL Team"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add C.O.</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTeamFormName(team.name);
                          setTeamFormDirector(team.director_name || "");
                          setTeamFormOrder(team.display_order);
                          setTeamModal({ isOpen: true, editingTeam: team });
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition"
                        title="Edit Team Name / Director"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTeam(team)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                        title="Delete Team"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* GL Team Body */}
                  {!teamCollapsed && (
                    <div className="p-3 sm:p-5 space-y-4 bg-slate-50/20">
                      {cos.length === 0 ? (
                        <div className="py-8 px-4 text-center bg-white rounded-xl border border-dashed border-slate-300">
                          <p className="text-xs text-slate-500 font-medium">
                            No Coordinators (C.O.) assigned to {team.name} yet.
                          </p>
                          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setAddCoModal({ isOpen: true, team });
                                setAddCoMode("existing");
                              }}
                              className="px-3 py-1.5 text-xs font-semibold bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-300 rounded-lg transition"
                            >
                              + Assign Existing Staff as C.O.
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddCoModal({ isOpen: true, team });
                                setAddCoMode("new");
                              }}
                              className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition"
                            >
                              + Create New C.O.
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Coordinators Level Cards */}
                          {cos.map((co) => {
                            const tlsUnderCo = tls.filter((tl) => tl.reporting_manager_id === co.id);
                            const directExecsUnderCo = execs.filter(
                              (ex) => ex.reporting_manager_id === co.id
                            );

                            const coNodeKey = `co-${co.id}`;
                            const coCollapsed = isCollapsed(coNodeKey);

                            return (
                              <div
                                key={co.id}
                                className="bg-white border border-sky-200/80 rounded-xl overflow-hidden shadow-2xs"
                              >
                                {/* C.O. Header Bar */}
                                <div className="p-3 sm:p-3.5 bg-gradient-to-r from-sky-50/70 to-white border-b border-sky-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleNode(coNodeKey)}
                                      className="p-1 rounded text-sky-700 hover:bg-sky-100/70 transition"
                                      title={coCollapsed ? "Expand C.O." : "Collapse C.O."}
                                    >
                                      {coCollapsed ? (
                                        <ChevronRight className="w-4 h-4 text-sky-800" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-sky-800" />
                                      )}
                                    </button>

                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-300 shrink-0">
                                      C.O.
                                    </span>

                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                                          {co.full_name}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                          @{co.username}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          {formatEmployeeId(co.id)}
                                        </span>
                                        {co.phone && (
                                          <a
                                            href={`tel:${co.phone}`}
                                            className="text-[10px] text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                                          >
                                            <Phone className="w-2.5 h-2.5" />
                                            {co.phone}
                                          </a>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-sky-700 mt-0.5">
                                        {tlsUnderCo.length} Team Leaders • {directExecsUnderCo.length} Direct Executives
                                      </p>
                                    </div>
                                  </div>

                                  {/* C.O. Action Buttons */}
                                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddTlModal({ isOpen: true, team, co });
                                        setAddTlMode("existing");
                                        setSelectedExistingTlId("");
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-md shadow-2xs transition"
                                      title="Add a Team Leader under this Coordinator"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add T.L.</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => openMoveModal(co)}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-md transition"
                                      title="Reassign or change this Coordinator"
                                    >
                                      <ArrowRightLeft className="w-3 h-3" />
                                      <span>Move</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleUnassignStaff(co, "Coordinator")}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                      title="Unassign Coordinator from team"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* C.O. Branch Content */}
                                {!coCollapsed && (
                                  <div className="p-3 sm:p-4 space-y-3 bg-white">
                                    {tlsUnderCo.length === 0 ? (
                                      <div className="py-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                                        <p>No Team Leaders assigned under {co.full_name} yet.</p>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAddTlModal({ isOpen: true, team, co });
                                            setAddTlMode("existing");
                                          }}
                                          className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 rounded-md transition"
                                        >
                                          <Plus className="w-3 h-3" />
                                          Assign First T.L.
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        {/* T.L. Cards Level */}
                                        {tlsUnderCo.map((tl) => {
                                          const execsUnderTl = execs.filter(
                                            (ex) => ex.reporting_manager_id === tl.id
                                          );

                                          const tlNodeKey = `tl-${tl.id}`;
                                          const tlCollapsed = isCollapsed(tlNodeKey);

                                          return (
                                            <div
                                              key={tl.id}
                                              className="bg-amber-50/30 border border-amber-200/90 rounded-lg overflow-hidden"
                                            >
                                              {/* T.L. Header */}
                                              <div className="p-2.5 sm:p-3 bg-gradient-to-r from-amber-50/90 to-white border-b border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => toggleNode(tlNodeKey)}
                                                    className="p-1 rounded text-amber-700 hover:bg-amber-100/70 transition"
                                                    title={tlCollapsed ? "Expand T.L." : "Collapse T.L."}
                                                  >
                                                    {tlCollapsed ? (
                                                      <ChevronRight className="w-3.5 h-3.5 text-amber-800" />
                                                    ) : (
                                                      <ChevronDown className="w-3.5 h-3.5 text-amber-800" />
                                                    )}
                                                  </button>

                                                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                                    T.L.
                                                  </span>

                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-xs font-bold text-slate-900">
                                                      {tl.full_name}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      @{tl.username}
                                                    </span>
                                                    {tl.phone && (
                                                      <a
                                                        href={`tel:${tl.phone}`}
                                                        className="text-[10px] text-emerald-700 hover:underline"
                                                      >
                                                        {tl.phone}
                                                      </a>
                                                    )}
                                                    <span className="text-[10px] font-medium text-amber-800 bg-amber-100/70 px-1.5 py-0.2 rounded-full">
                                                      {execsUnderTl.length} Executives
                                                    </span>
                                                  </div>
                                                </div>

                                                {/* T.L. Action Buttons */}
                                                <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setAddExecsModal({ isOpen: true, team, co, tl });
                                                      setSelectedExecIds([]);
                                                      setExecSearchQuery("");
                                                      setExecFilterMode("unassigned");
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded transition"
                                                    title="Assign Executives under this Team Leader"
                                                  >
                                                    <Plus className="w-2.5 h-2.5" />
                                                    <span>Add Executive</span>
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={() => openMoveModal(tl)}
                                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded transition"
                                                    title="Move T.L. to another C.O. or team"
                                                  >
                                                    <ArrowRightLeft className="w-2.5 h-2.5" />
                                                    <span>Move</span>
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={() => handleUnassignStaff(tl, "Team Leader")}
                                                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                                    title="Unassign T.L."
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Executives List under T.L. */}
                                              {!tlCollapsed && (
                                                <div className="p-2.5 bg-white">
                                                  {execsUnderTl.length === 0 ? (
                                                    <p className="text-[11px] text-slate-400 py-1.5 px-2">
                                                      No executives assigned under this T.L. yet. Click "Add Executive" above.
                                                    </p>
                                                  ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                                                      {execsUnderTl.map((ex) => (
                                                        <div
                                                          key={ex.id}
                                                          className="flex items-center justify-between gap-1.5 p-1.5 bg-slate-50 hover:bg-slate-100/80 rounded border border-slate-200 transition"
                                                        >
                                                          <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                            <span className="text-xs font-semibold text-slate-800 truncate">
                                                              {ex.full_name}
                                                            </span>
                                                            <span className="text-[9.5px] text-slate-400 font-mono truncate">
                                                              @{ex.username}
                                                            </span>
                                                          </div>

                                                          <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                              type="button"
                                                              onClick={() => openMoveModal(ex)}
                                                              className="p-1 text-slate-400 hover:text-slate-800 rounded"
                                                              title="Change T.L. or Team"
                                                            >
                                                              <ArrowRightLeft className="w-2.5 h-2.5" />
                                                            </button>
                                                            <button
                                                              type="button"
                                                              onClick={() => handleUnassignStaff(ex, "Executive")}
                                                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                                              title="Unassign from T.L."
                                                            >
                                                              <X className="w-2.5 h-2.5" />
                                                            </button>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Direct Executives directly under C.O. (No T.L.) */}
                                    {directExecsUnderCo.length > 0 && (
                                      <div className="border border-dashed border-slate-300 rounded-lg p-2.5 bg-slate-50/50">
                                        <div className="flex items-center justify-between mb-1.5">
                                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Direct Executives under C.O. ({directExecsUnderCo.length})
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {directExecsUnderCo.map((ex) => (
                                            <span
                                              key={ex.id}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-xs text-slate-700 shadow-2xs"
                                            >
                                              <span className="font-medium">{ex.full_name}</span>
                                              <button
                                                type="button"
                                                onClick={() => openMoveModal(ex)}
                                                className="text-slate-400 hover:text-slate-700 ml-0.5"
                                                title="Assign to a T.L."
                                              >
                                                <ArrowRightLeft className="w-2.5 h-2.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleUnassignStaff(ex, "Executive")}
                                                className="text-slate-400 hover:text-rose-600"
                                                title="Unassign"
                                              >
                                                <X className="w-2.5 h-2.5" />
                                              </button>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned Staff Section */}
            {unassignedEmployees.length > 0 && (
              <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-rose-900">
                        Unassigned Staff Accounts ({unassignedEmployees.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        These employees are not assigned to any GL Team or Leader yet. Select and assign them below.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedUnassignedIds.length === unassignedEmployees.length) {
                          setSelectedUnassignedIds([]);
                        } else {
                          setSelectedUnassignedIds(unassignedEmployees.map((e) => e.id));
                        }
                      }}
                      className="px-2.5 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md font-medium transition"
                    >
                      {selectedUnassignedIds.length === unassignedEmployees.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>
                </div>

                {/* Batch Assign Bar */}
                <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-200/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <span className="text-xs font-bold text-rose-900 shrink-0">
                    Assign ({selectedUnassignedIds.length}) Selected:
                  </span>

                  <select
                    value={quickBatchTeamId}
                    onChange={(e) => setQuickBatchTeamId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="text-xs bg-white border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="">Select GL Team...</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={quickBatchRole}
                    onChange={(e) => setQuickBatchRole(e.target.value as UserRole)}
                    className="text-xs bg-white border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="employee">As Executive</option>
                    <option value="tl">As Team Leader (T.L.)</option>
                    <option value="co">As Coordinator (C.O.)</option>
                  </select>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleBatchAssignUnassigned}
                    disabled={selectedUnassignedIds.length === 0 || !quickBatchTeamId}
                    loading={batchSubmitting}
                    className="bg-rose-700 hover:bg-rose-800 text-white text-xs h-8 ml-auto"
                  >
                    Assign Now
                  </Button>
                </div>

                {/* Unassigned Staff Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-1 max-h-60 overflow-y-auto">
                  {unassignedEmployees.map((emp) => {
                    const isSelected = selectedUnassignedIds.includes(emp.id);
                    return (
                      <label
                        key={emp.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition",
                          isSelected
                            ? "bg-rose-50 border-rose-400 text-rose-950 font-semibold"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUnassignedIds((prev) => [...prev, emp.id]);
                            } else {
                              setSelectedUnassignedIds((prev) => prev.filter((id) => id !== emp.id));
                            }
                          }}
                          className="rounded text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                        />
                        <div className="truncate flex-1">
                          <p className="truncate font-semibold">{emp.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">@{emp.username}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.preventDefault();
                            openMoveModal(emp);
                          }}
                          className="text-slate-400 hover:text-slate-700 p-1"
                          title="Assign individually"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                        </button>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── MODAL 1: ADD COORDINATOR (C.O.) ─────────────────────────────── */}
        <Modal
          isOpen={addCoModal.isOpen}
          onClose={() => setAddCoModal({ isOpen: false, team: null })}
          title={`Add Coordinator (C.O.) to ${addCoModal.team?.name || ""}`}
          description="Promote an existing staff member or create a new Coordinator account."
        >
          <form onSubmit={handleAddCo} className="space-y-4">
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setAddCoMode("existing")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition",
                  addCoMode === "existing"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Select Existing Staff
              </button>
              <button
                type="button"
                onClick={() => setAddCoMode("new")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition",
                  addCoMode === "new"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Create New C.O.
              </button>
            </div>

            {addCoMode === "existing" ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Staff Member to Promote as C.O. *
                </label>
                <select
                  value={selectedExistingCoId}
                  onChange={(e) => setSelectedExistingCoId(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                  className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {assignableEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} (@{emp.username}) — Current: {emp.role.toUpperCase()}
                      {emp.team_name ? ` in ${emp.team_name}` : " (Unassigned)"}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  This person will be set as Coordinator for {addCoModal.team?.name}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newCoName}
                    onChange={(e) => setNewCoName(e.target.value)}
                    placeholder="e.g. Rahim Ahmed"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Username *</label>
                  <input
                    type="text"
                    required
                    value={newCoUsername}
                    onChange={(e) => setNewCoUsername(e.target.value)}
                    placeholder="e.g. rahim"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={newCoPhone}
                    onChange={(e) => setNewCoPhone(e.target.value)}
                    placeholder="017xxxxxxxx"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Default Password</label>
                  <input
                    type="text"
                    value={newCoPassword}
                    onChange={(e) => setNewCoPassword(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddCoModal({ isOpen: false, team: null })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={coSubmitting}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                Add Coordinator
              </Button>
            </div>
          </form>
        </Modal>

        {/* ─── MODAL 2: ADD TEAM LEADER (T.L.) ─────────────────────────────── */}
        <Modal
          isOpen={addTlModal.isOpen}
          onClose={() => setAddTlModal({ isOpen: false, team: null, co: null })}
          title={`Add Team Leader under C.O. ${addTlModal.co?.full_name || ""}`}
          description={`Assigned under Coordinator ${addTlModal.co?.full_name} (${addTlModal.team?.name}).`}
        >
          <form onSubmit={handleAddTl} className="space-y-4">
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setAddTlMode("existing")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition",
                  addTlMode === "existing"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Select Existing Staff
              </button>
              <button
                type="button"
                onClick={() => setAddTlMode("new")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition",
                  addTlMode === "new"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Create New T.L.
              </button>
            </div>

            {addTlMode === "existing" ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Staff Member to Promote as T.L. *
                </label>
                <select
                  value={selectedExistingTlId}
                  onChange={(e) => setSelectedExistingTlId(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                  className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {assignableEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} (@{emp.username}) — Current: {emp.role.toUpperCase()}
                      {emp.team_name ? ` in ${emp.team_name}` : " (Unassigned)"}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Reports to Coordinator <strong>{addTlModal.co?.full_name}</strong> in{" "}
                  <strong>{addTlModal.team?.name}</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newTlName}
                    onChange={(e) => setNewTlName(e.target.value)}
                    placeholder="e.g. Karim Ullah"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Username *</label>
                  <input
                    type="text"
                    required
                    value={newTlUsername}
                    onChange={(e) => setNewTlUsername(e.target.value)}
                    placeholder="e.g. karim"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={newTlPhone}
                    onChange={(e) => setNewTlPhone(e.target.value)}
                    placeholder="017xxxxxxxx"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Default Password</label>
                  <input
                    type="text"
                    value={newTlPassword}
                    onChange={(e) => setNewTlPassword(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddTlModal({ isOpen: false, team: null, co: null })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={tlSubmitting}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Add Team Leader
              </Button>
            </div>
          </form>
        </Modal>

        {/* ─── MODAL 3: ADD EXECUTIVES UNDER T.L. ─────────────────────────── */}
        <Modal
          isOpen={addExecsModal.isOpen}
          onClose={() => setAddExecsModal({ isOpen: false, team: null, co: null, tl: null })}
          title={`Assign Executives under T.L. ${addExecsModal.tl?.full_name || ""}`}
          description={`Team: ${addExecsModal.team?.name} • Coordinator: ${addExecsModal.co?.full_name || "Direct"}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-3.5">
            {/* Filter Tabs & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setExecFilterMode("unassigned")}
                  className={cn(
                    "px-3 py-1 font-semibold rounded-md transition",
                    execFilterMode === "unassigned"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Unassigned Staff ({unassignedEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setExecFilterMode("all")}
                  className={cn(
                    "px-3 py-1 font-semibold rounded-md transition",
                    execFilterMode === "all"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  All Staff ({assignableEmployees.length})
                </button>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter staff..."
                  value={execSearchQuery}
                  onChange={(e) => setExecSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Checklist Header */}
            <div className="flex items-center justify-between text-xs text-slate-600 px-1 pt-1">
              <span className="font-semibold">
                Selected: {selectedExecIds.length} staff member(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const list =
                      execFilterMode === "unassigned" ? unassignedEmployees : assignableEmployees;
                    const filtered = list.filter(
                      (e) =>
                        !execSearchQuery ||
                        e.full_name.toLowerCase().includes(execSearchQuery.toLowerCase()) ||
                        e.username.toLowerCase().includes(execSearchQuery.toLowerCase())
                    );
                    if (selectedExecIds.length === filtered.length) {
                      setSelectedExecIds([]);
                    } else {
                      setSelectedExecIds(filtered.map((e) => e.id));
                    }
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Toggle All Visible
                </button>
              </div>
            </div>

            {/* Executives Checklist Box */}
            <div className="border border-slate-200 rounded-lg p-2 max-h-72 overflow-y-auto space-y-1 bg-slate-50/50">
              {(() => {
                const list =
                  execFilterMode === "unassigned" ? unassignedEmployees : assignableEmployees;
                const filtered = list.filter(
                  (e) =>
                    !execSearchQuery ||
                    e.full_name.toLowerCase().includes(execSearchQuery.toLowerCase()) ||
                    e.username.toLowerCase().includes(execSearchQuery.toLowerCase())
                );

                if (filtered.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-slate-400">
                      No matching staff found in this view.
                    </div>
                  );
                }

                return filtered.map((emp) => {
                  const isChecked = selectedExecIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      className={cn(
                        "flex items-center gap-2.5 p-2 rounded-md border text-xs cursor-pointer select-none transition",
                        isChecked
                          ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExecIds((prev) => [...prev, emp.id]);
                          } else {
                            setSelectedExecIds((prev) => prev.filter((id) => id !== emp.id));
                          }
                        }}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="truncate">{emp.full_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono ml-1.5">
                          @{emp.username}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {emp.team_name ? emp.team_name : "Unassigned"}
                      </span>
                    </label>
                  );
                });
              })()}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                They will report directly to T.L. <strong>{addExecsModal.tl?.full_name}</strong>.
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddExecsModal({ isOpen: false, team: null, co: null, tl: null })}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={execSubmitting}
                  disabled={selectedExecIds.length === 0}
                  onClick={handleAssignExecutives}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  Assign ({selectedExecIds.length}) to T.L.
                </Button>
              </div>
            </div>
          </div>
        </Modal>

        {/* ─── MODAL 4: MOVE / REASSIGN STAFF ─────────────────────────────── */}
        <Modal
          isOpen={moveModal.isOpen}
          onClose={() => setMoveModal({ isOpen: false, employee: null })}
          title={`Move / Reassign ${moveModal.employee?.full_name || ""}`}
          description={`Employee ID: ${formatEmployeeId(moveModal.employee?.id)} • Username: @${moveModal.employee?.username || ""}`}
        >
          <form onSubmit={handleSaveMove} className="space-y-4">
            {/* Role Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role in Hierarchy</label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as UserRole)}
                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="employee">Executive</option>
                <option value="tl">Team Leader (T.L.)</option>
                <option value="co">Coordinator (C.O.)</option>
              </select>
            </div>

            {/* Target GL Team */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target GL Team</label>
              <select
                value={targetTeamId}
                onChange={(e) => {
                  setTargetTeamId(e.target.value === "" ? "" : Number(e.target.value));
                  setTargetManagerId(""); // reset manager if team changes
                }}
                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">-- Unassigned (No Team) --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Reporting Supervisor */}
            {targetTeamId !== "" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reports To (Supervisor)
                </label>
                <select
                  value={targetManagerId}
                  onChange={(e) => setTargetManagerId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- No Direct Supervisor (Reports to Team) --</option>
                  {employees
                    .filter((e) => {
                      if (e.id === moveModal.employee?.id) return false;
                      if (e.team_id !== Number(targetTeamId)) return false;
                      const r = normalizeRole(e.role, e.designation);
                      if (targetRole === "tl") return r === "co";
                      if (targetRole === "employee") return r === "tl" || r === "co";
                      return false;
                    })
                    .map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.full_name} ({normalizeRole(sup.role, sup.designation).toUpperCase()})
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {targetRole === "tl"
                    ? "Team Leaders should report to a Coordinator (C.O.)."
                    : targetRole === "employee"
                    ? "Executives should report to a Team Leader (T.L.) or Coordinator."
                    : "Coordinators report directly to the GL Team / Director."}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMoveModal({ isOpen: false, employee: null })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={moveSubmitting}
                className="bg-indigo-700 hover:bg-indigo-800 text-white"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>

        {/* ─── MODAL 5: NEW / EDIT GL TEAM ─────────────────────────────────── */}
        <Modal
          isOpen={teamModal.isOpen}
          onClose={() => setTeamModal({ isOpen: false, editingTeam: null })}
          title={teamModal.editingTeam ? `Edit Team: ${teamModal.editingTeam.name}` : "Create New GL Team"}
          description="A GL Team groups Coordinators, Team Leaders, and Executives under a Director."
        >
          <form onSubmit={handleSaveTeam} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GL Team Name * (e.g. Gazi Sir Team, Hasib Sir Team)
              </label>
              <input
                type="text"
                required
                value={teamFormName}
                onChange={(e) => setTeamFormName(e.target.value)}
                placeholder="Team Name"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Director / Head Name (e.g. Gazi Sir, Hasib Sir)
              </label>
              <input
                type="text"
                value={teamFormDirector}
                onChange={(e) => setTeamFormDirector(e.target.value)}
                placeholder="Director Name"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Display Order</label>
              <input
                type="number"
                value={teamFormOrder}
                onChange={(e) => setTeamFormOrder(parseInt(e.target.value) || 0)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTeamModal({ isOpen: false, editingTeam: null })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={teamFormSubmitting}
                className="bg-indigo-700 hover:bg-indigo-800 text-white"
              >
                {teamModal.editingTeam ? "Save Team" : "Create GL Team"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* ─── MODAL 6: CONFIRMATION MODAL ─────────────────────────────────── */}
        <Modal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          title={confirmModal.title}
          description={confirmModal.description}
        >
          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={confirmSubmitting}
              onClick={confirmModal.onConfirm}
            >
              {confirmModal.confirmLabel}
            </Button>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
