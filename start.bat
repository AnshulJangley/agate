@echo off
title AGATE Launcher
echo ===================================================
echo   Starting AGATE (Backend + Frontend)
echo ===================================================
echo.
echo Starting FastAPI Backend on http://localhost:8000 ...
start "AGATE Backend (:8000)" cmd /k "call venv\Scripts\activate && uvicorn backend.main:app --host 127.0.0.1 --port 8000"

echo Starting Vite Frontend on http://localhost:5173 ...
start "AGATE Frontend (:5173)" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo   Both servers are launching in separate windows!
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:8000
echo ===================================================
echo You can close this window now.
timeout /t 5 >nul
