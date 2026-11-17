"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Database,
  Play,
  RotateCcw,
  Upload,
  Table,
  CheckCircle2,
  AlertCircle,
  Download,
  Layers,
  Search,
  Code,
  ShieldAlert,
  Server,
  FileCode2,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Alert,
} from "@/components/ui";
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
  { label: "Daily Activity Reports", query: "SELECT id, employee_id, report_date, status, created_at FROM daily_activity_reports ORDER BY id DESC LIMIT 20;" },
  { label: "Call Activity Entries", query: "SELECT id, report_id, lead_category, total_dialed, total_connected FROM call_activity_entries ORDER BY id DESC LIMIT 25;" },
  { label: "Monthly Scorecards", query: "SELECT * FROM monthly_scorecards ORDER BY id DESC LIMIT 20;" },
  { label: "Customer Plan Rows", query: "SELECT * FROM scorecard_customers ORDER BY id DESC LIMIT 25;" },
  { label: "Application Settings", query: "SELECT * FROM app_settings;" },
];

export default function SqlConsolePage() {
  const { user, isAdmin } = useAuth();

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
    if (isAdmin) {
      fetchSchema();
    }
  }, [isAdmin]);

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
        // Refresh schema in case table definition or rows changed
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
      fetchSchema();
    } catch (err: any) {
      setErrorMessage(err?.data?.detail || err?.message || "File import failed");
    } finally {
      setIsImporting(false);
    }
  };

  // Export table results to CSV
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

  // Strict Admin Check: Only ADMIN role is permitted
  if (!isAdmin) {
    return (
      <DashboardLayout
        title="SQL Console & Importer"
        subtitle="Direct database query execution and dump importer"
        adminOnly={true}
      >
        <div className="max-w-md mx-auto my-16 text-center">
          <Card className="p-8 border-rose-200 bg-white">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Restricted Service</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              This service is strictly restricted to <strong>Administrator</strong> accounts. Sub-administrators, supervisors, and employees are not authorized to view or run direct SQL operations.
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const filteredTables = (schemaData?.tables || []).filter((t) =>
    t.name.toLowerCase().includes(schemaSearch.toLowerCase())
  );

  return (
    <DashboardLayout
      title="SQL Console & Importer"
      subtitle="Direct database query execution and dump importer"
      adminOnly={true}
    >
      <div className="space-y-6">
        {/* Header matching Sunset Group theme */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-50 text-green-700 rounded-lg border border-green-200">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  SQL Importer & Console
                </h1>
                <Badge variant="default" className="text-[11px] font-semibold">
                  Admin Only
                </Badge>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Execute queries against the database, import SQL dump files, and inspect tables.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-2xs">
              <Server className="w-3.5 h-3.5 text-green-700" />
              <span>Engine:</span>
              <span className="uppercase text-green-700 font-bold">
                {schemaData?.database_type || "CONNECTING..."}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSchema}
              loading={loadingSchema}
              title="Refresh Schema"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Warning Alert */}
        <Alert type="warning">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Direct Database Access:</strong> SQL statements executed here run directly against the live database. Modifying queries (<code className="font-mono font-bold">INSERT</code>, <code className="font-mono font-bold">UPDATE</code>, <code className="font-mono font-bold">DELETE</code>) will alter records immediately.
            </span>
          </div>
        </Alert>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab("query")}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm border-b-2 transition cursor-pointer select-none ${
              activeTab === "query"
                ? "border-green-700 text-green-800 bg-green-50/50 rounded-t-md"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Code className="w-4 h-4" />
            SQL Query Editor
          </button>

          <button
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm border-b-2 transition cursor-pointer select-none ${
              activeTab === "import"
                ? "border-green-700 text-green-800 bg-green-50/50 rounded-t-md"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Upload className="w-4 h-4" />
            Import .SQL File / Dump
          </button>

          <button
            onClick={() => setActiveTab("schema")}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm border-b-2 transition cursor-pointer select-none ${
              activeTab === "schema"
                ? "border-green-700 text-green-800 bg-green-50/50 rounded-t-md"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Layers className="w-4 h-4" />
            Database Tables ({schemaData?.tables.length || 0})
          </button>
        </div>

        {/* ─── TAB 1: SQL QUERY EDITOR ───────────────────────────────────────── */}
        {activeTab === "query" && (
          <div className="space-y-4">
            {/* Quick Templates */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Quick Query Presets
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuery(p.query)}
                    className="text-xs px-2.5 py-1 rounded bg-white hover:bg-green-50 hover:text-green-800 hover:border-green-300 text-slate-700 border border-slate-200 transition font-medium cursor-pointer shadow-2xs"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor Box */}
            <Card className="border-slate-300 shadow-xs">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold flex items-center gap-1.5">
                  <FileCode2 className="w-4 h-4 text-green-700" />
                  SQL Editor (Supports multiple statements separated by semicolon)
                </span>
                <span className="hidden sm:inline text-slate-500">
                  Run: <kbd className="bg-white border border-slate-300 px-1.5 py-0.5 rounded font-mono text-[11px] text-slate-700">Ctrl + Enter</kbd>
                </span>
              </div>

              <div className="p-3 bg-white">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={7}
                  placeholder="Enter your SQL statement here (e.g., SELECT * FROM users LIMIT 10;)"
                  className="w-full bg-slate-50/50 border border-slate-200 rounded p-3 text-slate-800 font-mono text-xs sm:text-sm resize-y outline-none leading-relaxed focus:bg-white focus:border-green-600 focus:ring-2 focus:ring-green-600/15 transition placeholder-slate-400"
                  spellCheck={false}
                />
              </div>

              <div className="bg-slate-50/70 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuery("")}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Clear Editor
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleExecute}
                  loading={isExecuting}
                  disabled={!query.trim()}
                >
                  <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                  {isExecuting ? "Executing..." : "Run Query"}
                </Button>
              </div>
            </Card>

            {/* Error Banner */}
            {errorMessage && (
              <Alert type="error">
                <div className="space-y-1">
                  <strong className="font-bold">SQL Execution Error:</strong>
                  <pre className="font-mono text-xs whitespace-pre-wrap text-rose-900 bg-rose-100/60 p-2.5 rounded border border-rose-200">
                    {errorMessage}
                  </pre>
                </div>
              </Alert>
            )}

            {/* Results Display */}
            {execResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium px-1">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-green-700" />
                    Query completed in <strong className="text-slate-800">{execResult.execution_time_ms} ms</strong>
                  </span>
                  <span>{execResult.results.length} statement(s) evaluated</span>
                </div>

                {execResult.results.map((res, sIdx) => (
                  <Card key={sIdx} className="overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={res.is_select ? "default" : "info"} className="font-mono text-[11px]">
                          {res.is_select ? "SELECT" : "COMMAND"}
                        </Badge>
                        <code className="text-xs text-slate-600 font-mono truncate max-w-md">
                          {res.statement}
                        </code>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">
                          {res.message}
                        </span>
                        {res.is_select && res.rows.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportCsv(res.columns, res.rows)}
                            className="h-7 text-xs"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            CSV
                          </Button>
                        )}
                      </div>
                    </div>

                    {res.is_select ? (
                      res.rows.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                          Query returned 0 rows.
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-[500px]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-2xs z-10">
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
                                <tr key={rIdx} className="hover:bg-green-50/30 transition">
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
                      <div className="p-4 bg-green-50/50 text-green-900 text-xs sm:text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-700" />
                        {res.message}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: IMPORT .SQL FILE ──────────────────────────────────────── */}
        {activeTab === "import" && (
          <div className="space-y-6">
            <Card className="p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Import SQL Script or PostgreSQL Dump</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Upload a <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.sql</code> file to import into the database. Standard SQL queries as well as PostgreSQL dumps (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">COPY ... FROM stdin</code>) are automatically parsed and inserted.
                </p>
              </div>

              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-green-600 hover:bg-green-50/30 rounded-lg p-8 text-center cursor-pointer transition select-none"
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
                <Upload className="w-9 h-9 text-slate-400 mx-auto mb-2" />
                {selectedFile ? (
                  <div>
                    <p className="font-bold text-green-800 text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB — Click to choose a different file
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-bold text-slate-800 text-sm">
                      Click to choose or drag and drop your .sql file
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Supported formats: .sql, .txt (up to 50MB)</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleImportFile}
                  loading={isImporting}
                  disabled={!selectedFile}
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  {isImporting ? "Importing to Database..." : "Import File Now"}
                </Button>
              </div>
            </Card>

            {/* Import Result Feedback */}
            {importResult && (
              <Card
                className={`p-5 ${
                  importResult.success
                    ? "bg-green-50/40 border-green-200"
                    : "bg-rose-50/40 border-rose-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  {importResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  <div className="space-y-2 flex-1">
                    <h3 className="font-bold text-sm text-slate-900">{importResult.message}</h3>
                    <p className="text-xs text-slate-600">
                      Execution Time: {importResult.execution_time_ms} ms | Statements / Rows Processed: {importResult.statements_executed}
                    </p>

                    {importResult.tables_imported.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Imported Tables Summary:
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {importResult.tables_imported.map((tbl, idx) => (
                            <div
                              key={idx}
                              className="bg-white border border-slate-200 px-3 py-1.5 rounded text-xs flex justify-between shadow-2xs"
                            >
                              <span className="font-mono font-medium text-slate-800">{tbl.table}</span>
                              <span className="font-bold text-green-700">{tbl.rows} rows</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {importResult.errors.length > 0 && (
                      <div className="mt-3 bg-white p-3 rounded border border-rose-200 text-xs text-rose-800">
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
              </Card>
            )}
          </div>
        )}

        {/* ─── TAB 3: SCHEMA BROWSER ───────────────────────────────────────── */}
        {activeTab === "schema" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Table List */}
            <Card className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter tables..."
                  value={schemaSearch}
                  onChange={(e) => setSchemaSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded outline-none focus:border-green-600 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {filteredTables.map((tbl) => (
                  <button
                    key={tbl.name}
                    onClick={() => setSelectedTable(tbl)}
                    className={`w-full text-left px-3 py-2 rounded text-xs flex items-center justify-between transition cursor-pointer ${
                      selectedTable?.name === tbl.name
                        ? "bg-green-50 text-green-900 font-bold border border-green-200"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-mono truncate">{tbl.name}</span>
                    <Badge variant="neutral" className="text-[10px] font-semibold">
                      {tbl.row_count} rows
                    </Badge>
                  </button>
                ))}
              </div>
            </Card>

            {/* Table Detail */}
            <Card className="md:col-span-2 p-6 space-y-4">
              {selectedTable ? (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-base font-bold font-mono text-slate-900">{selectedTable.name}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedTable.row_count} records | {selectedTable.columns.length} columns
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuery(`SELECT * FROM ${selectedTable.name} LIMIT 50;`);
                        setActiveTab("query");
                      }}
                    >
                      <Play className="w-3 h-3 mr-1.5 fill-current text-green-700" />
                      Query Table
                    </Button>
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
                                  <Badge variant="warning" className="text-[10px]">
                                    PRIMARY KEY
                                  </Badge>
                                )}
                                {!c.nullable && (
                                  <Badge variant="neutral" className="text-[10px]">
                                    NOT NULL
                                  </Badge>
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
                  Select a table from the list to view its schema.
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
