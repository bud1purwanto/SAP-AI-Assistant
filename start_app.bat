@echo off
echo =========================================
echo    Starting SAP AI Assistant
echo =========================================
echo.

echo [1/2] Starting Backend Server...
start "SAP Assistant - Backend" cmd /k "cd backend && C:\Users\User\AppData\Local\Python\bin\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] Starting Frontend Server...
start "SAP Assistant - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo =========================================
echo Both services have been launched in separate windows!
echo - Backend will run on http://localhost:8000
echo - Frontend will run on http://localhost:5173
echo.
echo You can safely close this terminal window.
echo =========================================
pause
