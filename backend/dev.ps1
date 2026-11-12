# Run Sunset Dashboard FastAPI Backend
Write-Host "Starting Sunset Dashboard Backend..." -ForegroundColor Cyan

# Disable compiled Cython C-extension to avoid Windows Application Control policy blocks
$env:DISABLE_SQLALCHEMY_CEXT = "1"

if ((Test-Path "$PSScriptRoot\.venv\Scripts\python.exe") -and (Test-Path "$PSScriptRoot\.venv\Lib\site-packages\uvicorn")) {
    & "$PSScriptRoot\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
} else {
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}
