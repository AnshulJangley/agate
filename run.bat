@echo off
echo ===================================================
echo   Setting up AGATE Backend and Frontend
echo ===================================================

echo.
echo [1/4] Setting up Python Virtual Environment...
if not exist "venv\" (
    python -m venv venv
)
call venv\Scripts\activate

echo.
echo [2/4] Installing Backend Dependencies...
python -m pip install -r requirements.txt

echo.
echo [3/4] Installing Frontend Dependencies...
cd frontend
call npm install
cd ..

echo.
echo [4/4] Starting Servers...
echo Starting Backend (FastAPI)...
start cmd /k "call venv\Scripts\activate && uvicorn backend.main:app --host 127.0.0.1 --port 8000"

echo Starting Frontend (Vite)...
start cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo   Servers are starting in new windows!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000
echo ===================================================
pause
