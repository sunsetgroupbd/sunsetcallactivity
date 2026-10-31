@echo off
cd /d "%~dp0"
echo Starting Sunset Dashboard Backend with .venv...
".venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

