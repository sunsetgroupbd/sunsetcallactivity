# Run Sunset Dashboard FastAPI Backend using project .venv
Write-Host "Starting Sunset Dashboard Backend with project virtual environment..." -ForegroundColor Cyan
& "$PSScriptRoot\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

