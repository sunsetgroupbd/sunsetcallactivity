"""Schemas for the SQL Console and Importer."""
from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


class QueryExecuteRequest(BaseModel):
    query: str = Field(..., description="SQL query or batch of queries to execute")


class QueryResult(BaseModel):
    statement: str
    is_select: bool
    columns: list[str] = []
    rows: list[list[Any]] = []
    rows_count: int = 0
    rows_affected: int = 0
    message: str = ""


class QueryExecuteResponse(BaseModel):
    success: bool
    execution_time_ms: float
    results: list[QueryResult] = []
    error: Optional[str] = None


class ColumnInfo(BaseModel):
    name: str
    type: str
    primary_key: bool = False
    nullable: bool = True


class TableSchemaInfo(BaseModel):
    name: str
    row_count: int
    columns: list[ColumnInfo] = []


class SchemaOverviewResponse(BaseModel):
    database_type: str
    tables: list[TableSchemaInfo] = []


class SqlImportResponse(BaseModel):
    success: bool
    message: str
    statements_executed: int = 0
    tables_imported: list[dict[str, Any]] = []
    execution_time_ms: float = 0.0
    errors: list[str] = []
