"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Database,
  Play,
  RotateCcw,
  Upload,
  FileText,
  Table,
  CheckCircle2,
  AlertCircle,
  Download,
  Copy,
  Clock,
  Layers,
  Search,
  Code,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  DatabaseSchemaResponse,
  SqlQueryExecuteResponse,
  SqlImportResponse,
  TableSchemaInfo,
} from "@/types";

const QUICK_PRESETS = [
  { label: "View Users", query: "SELECT id, username, full_name, role, is_active FROM users LIMIT 25;" },
  { label: "View Teams", query: "SELECT * FROM teams;" },
  { label: "Recent Daily Reports", query: "SELECT id, employee_id, report_date, status, created_at FROM daily_activity_reports ORDER BY id DESC LIMIT 20;" },
  { label: "Recent Call Activities", query: "SELECT id, report_id, lead_category, total_dialed, total_connected FROM call_activity_entries ORDER BY id DESC LIMIT 25;" },
  { label: "Monthly Scorecards", query: "SELECT * FROM monthly_scorecards ORDER BY id DESC LIMIT 20;" },
  { label: "Customer Plan Rows", query: "SELECT * FROM scorecard_customers ORDER BY id DESC LIMIT 25;" },
  { label: "Database Version/Settings", query: "SELECT * FROM app_settings;" },
];

export default function SqlConsolePage() {
  const { user, isAdmin, isSubAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<"query" | "import" | "schema">("query");
  const [query, setQuery] = useState("SELECT id, username, full_name, role, is_active FROM users LIMIT 25;");
  const [isExecuting, setIsExecuting] = useState(false);
  const [execResult, setExecResult] = useState<SqlQueryExecuteResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Schema state
  const [schemaData, setSchemaData] = useState<DatabaseSchemaResponse | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<TableSchemaInfo | null>(null);

  // Import file state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<SqlImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load schema
  const fetchSchema = async () => {
    setLoadingSchema(true);
    try {
      const res = await api.sqlConsole.getSchema();
      setSchemaData(res);
      if (res.tables.length > 0 && !selectedTable) {
        setSelectedTable(res.tables[0]);
      }
    } catch (err: any) {
      console.error("Failed to load database schema:", err);
    } finally {
      setLoadingSchema(false);
    }
  };

  useEffect(() => {
    if (isAdmin || isSubAdmin) {
      fetchSchema();
    }
  }, [isAdmin, isSubAdmin]);

  // Execute SQL
  const handleExecute = async () => {
    if (!query.trim()) return;
    setIsExecuting(true);
    setErrorMessage(null);
    setExecResult(null);

    try {
      const res = await api.sqlConsole.execute(query);
      setExecResult(res);
      if (!res.success && res.error) {
        setErrorMessage(res.error);
      } else {
        // Refresh schema in case DDL was run
        fetchSchema();
      }
    } catch (err: any) {
      setErrorMessage(err?.data?.detail || err?.message || "Execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  // Keyboard shortcut (Ctrl/Cmd + Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  // Import file
  const handleImportFile = async () => {
    if (!selectedFile) return;
    setIsImporting(true);
    setImportResult(null);
    setErrorMessage(null);

    try {
      const res = await api.sqlConsole.importFile(selectedFile);
      setImportResult(res);
      // Refresh schema after import
      fetchSchema();
    } catch (err: any) {
      setErrorMessage(err?.data?.detail || err?.message || "File import failed");
    } finally {
      setIsImporting(false);
    }
  };

  // Export current table results to CSV
  const handleExportCsv = (columns: string[], rows: (string | number | boolean | null)[][]) => {
    if (!rows.length) return;
    const headerRow = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
    const dataRows = rows.map((row) =>
      row
        .map((val) => {
          if (val === null || val === undefined) return '""';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csvContent = [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin && !isSubAdmin) {
    return (
      <div className="p-8 text-center">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-sm text-slate-500 mt-1">
          You must have Administrator privileges to access the SQL Importer & Console.
        </p>
      </div>
    );
  }

  const filteredTables = (schemaData?.tables || []).filter((t) =>
    t.name.toLowerCase().includes(schemaSearch.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Title & Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl shadow-sm">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Database SQL Console & Importer
              </h1>
              <p className="text-sm text-slate-500">
                Execute queries directly, import SQL scripts, and inspect database tables.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Database:{" "}
            <span className="uppercase text-emerald-700 font-bold">
              {schemaData?.database_type || "CONNECTING..."}
            </span>
          </div>
          <button
            onClick={fetchSchema}
            disabled={loadingSchema}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            title="Refresh Schema"
          >
            <RotateCcw className={`w-4 h-4 ${loadingSchema ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl flex items-start gap-3 text-xs leading-relaxed">
        <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <strong className="font-semibold">Live Database Access:</strong> SQL queries executed here run directly against the active database.{" "}
          <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-medium">INSERT</code>,{" "}
          <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-medium">UPDATE</code>, and{" "}
          <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-medium">DELETE</code> statements will immediately alter records.
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab("query")}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition ${
            activeTab === "query"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-lg"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Code className="w-4 h-4" />
          SQL Query Editor
        </button>

        <button
          onClick={() => setActiveTab("import")}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition ${
            activeTab === "import"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-lg"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Upload className="w-4 h-4" />
          Import .SQL File / Dump
        </button>

        <button
          onClick={() => setActiveTab("schema")}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition ${
            activeTab === "schema"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-lg"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="w-4 h-4" />
          Tables & Schema ({schemaData?.tables.length || 0})
        </button>
      </div>

      {/* ─── TAB 1: SQL QUERY EDITOR ─────────────────────────────────────────── */}
      {activeTab === "query" && (
        <div className="space-y-4">
          {/* Quick Presets */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Quick Templates
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setQuery(p.query)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition font-medium"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editor Area */}
          <div className="bg-slate-900 rounded-2xl p-4 shadow-inner border border-slate-800">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono">SQL Editor (Separate statements with semicolons)</span>
              <span className="hidden sm:inline">Press <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">Ctrl + Enter</kbd> to run</span>
            </div>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={7}
              placeholder="Enter your SQL query here (e.g. SELECT * FROM users LIMIT 10;)"
              className="w-full bg-transparent text-slate-100 font-mono text-sm resize-y outline-none leading-relaxed placeholder-slate-600"
              spellCheck={false}
            />

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 mt-2">
              <button
                onClick={() => setQuery("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear editor
              </button>

              <button
                onClick={handleExecute}
                disabled={isExecuting || !query.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                {isExecuting ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                {isExecuting ? "Executing..." : "Run Query"}
              </button>
            </div>
          </div>

          {/* Execution Error Message */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">SQL Execution Error:</strong>
                <pre className="mt-1 font-mono text-xs whitespace-pre-wrap text-rose-900 bg-rose-100/60 p-2.5 rounded-lg border border-rose-200">
                  {errorMessage}
                </pre>
              </div>
            </div>
          )}

          {/* Results Display */}
          {execResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Executed in <strong className="text-slate-800">{execResult.execution_time_ms} ms</strong>
                </span>
                <span>{execResult.results.length} statement(s) evaluated</span>
              </div>

              {execResult.results.map((res, sIdx) => (
                <div
                  key={sIdx}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-slate-200 text-slate-800">
                        {res.is_select ? "SELECT" : "COMMAND"}
                      </span>
                      <code className="text-xs text-slate-600 font-mono truncate max-w-md">
                        {res.statement}
                      </code>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">
                        {res.message}
                      </span>
                      {res.is_select && res.rows.length > 0 && (
                        <button
                          onClick={() => handleExportCsv(res.columns, res.rows)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition"
                          title="Export CSV"
                        >
                          <Download className="w-3.5 h-3.5" />
                          CSV
                        </button>
                      )}
                    </div>
                  </div>

                  {res.is_select ? (
                    res.rows.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-sm">
                        No rows returned
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 shadow-xs z-10">
                            <tr>
                              <th className="p-2.5 text-slate-400 font-mono text-[10px] w-12 border-r border-slate-200">
                                #
                              </th>
                              {res.columns.map((col, cIdx) => (
                                <th
                                  key={cIdx}
                                  className="p-2.5 font-bold text-slate-700 border-r border-slate-200 last:border-r-0 whitespace-nowrap"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {res.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50/80 transition">
                                <td className="p-2 text-slate-400 text-[10px] border-r border-slate-100">
                                  {rIdx + 1}
                                </td>
                                {row.map((val, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="p-2 text-slate-800 border-r border-slate-100 last:border-r-0 whitespace-nowrap max-w-xs truncate"
                                    title={val !== null ? String(val) : "NULL"}
                                  >
                                    {val === null ? (
                                      <span className="text-slate-400 italic">null</span>
                                    ) : typeof val === "boolean" ? (
                                      <span className={val ? "text-emerald-700 font-semibold" : "text-rose-700"}>
                                        {val ? "true" : "false"}
                                      </span>
                                    ) : (
                                      String(val)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    <div className="p-4 bg-emerald-50/50 text-emerald-900 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      {res.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: IMPORT .SQL FILE ────────────────────────────────────────── */}
      {activeTab === "import" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Import SQL Script or Database Dump</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.sql</code> file. Standard SQL files and PostgreSQL dumps (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">COPY ... FROM stdin</code>) are automatically parsed and imported into the active database.
              </p>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/30 rounded-2xl p-8 text-center cursor-pointer transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".sql,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              {selectedFile ? (
                <div>
                  <p className="font-bold text-slate-900 text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB — Click to change file
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-bold text-slate-800 text-sm">
                    Click to select or drag & drop your SQL file here
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Supports .sql dump files (up to 50MB)</p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleImportFile}
                disabled={!selectedFile || isImporting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                {isImporting ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isImporting ? "Importing to Database..." : "Import File Now"}
              </button>
            </div>
          </div>

          {/* Import Result Feedback */}
          {importResult && (
            <div
              className={`p-5 rounded-2xl border ${
                importResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                  : "bg-rose-50 border-rose-200 text-rose-950"
              }`}
            >
              <div className="flex items-start gap-3">
                {importResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                )}
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm">{importResult.message}</h3>
                  <p className="text-xs text-slate-600">
                    Execution Time: {importResult.execution_time_ms} ms | Statements / Rows: {importResult.statements_executed}
                  </p>

                  {importResult.tables_imported.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                        Imported Tables Breakdown:
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {importResult.tables_imported.map((tbl, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs flex justify-between"
                          >
                            <span className="font-mono font-medium text-slate-800">{tbl.table}</span>
                            <span className="font-bold text-emerald-700">{tbl.rows} rows</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.errors.length > 0 && (
                    <div className="mt-3 bg-white p-3 rounded-xl border border-rose-200 text-xs text-rose-800">
                      <strong className="block font-bold mb-1">Warnings / Errors:</strong>
                      <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px]">
                        {importResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: SCHEMA BROWSER ───────────────────────────────────────────── */}
      {activeTab === "schema" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Table List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search tables..."
                value={schemaSearch}
                onChange={(e) => setSchemaSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {filteredTables.map((tbl) => (
                <button
                  key={tbl.name}
                  onClick={() => setSelectedTable(tbl)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
                    selectedTable?.name === tbl.name
                      ? "bg-emerald-50 text-emerald-900 font-bold border border-emerald-200"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="font-mono truncate">{tbl.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                    {tbl.row_count} rows
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Table Detail */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            {selectedTable ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold font-mono text-slate-900">{selectedTable.name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Contains {selectedTable.row_count} total records | {selectedTable.columns.length} columns
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setQuery(`SELECT * FROM ${selectedTable.name} LIMIT 50;`);
                      setActiveTab("query");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Query Table
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                        <th className="py-2">Column Name</th>
                        <th className="py-2">Data Type</th>
                        <th className="py-2">Constraints</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {selectedTable.columns.map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 font-bold text-slate-800">{c.name}</td>
                          <td className="py-2.5 text-slate-600">{c.type}</td>
                          <td className="py-2.5">
                            <div className="flex gap-1.5">
                              {c.primary_key && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                  PRIMARY KEY
                                </span>
                              )}
                              {!c.nullable && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                                  NOT NULL
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">
                Select a table to inspect its schema.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
