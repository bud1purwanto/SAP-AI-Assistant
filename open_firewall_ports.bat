@echo off
:: Cek izin Administrator
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ========================================================
    echo  ERROR: File ini harus dijalankan sebagai ADMINISTRATOR!
    echo  Klik kanan pada file ini lalu pilih "Run as administrator"
    echo ========================================================
    echo.
    pause
    exit /b 1
)

echo ========================================================
echo  Membuka Port Firewall untuk SAP AI Assistant (5173 & 8000)
echo ========================================================
echo.

echo [1/2] Menambahkan Firewall Rule untuk Frontend (Port 5173)...
netsh advfirewall firewall delete rule name="SAP Assistant Frontend" >nul 2>&1
netsh advfirewall firewall add rule name="SAP Assistant Frontend" dir=in action=allow protocol=TCP localport=5173 profile=any

echo [2/2] Menambahkan Firewall Rule untuk Backend (Port 8000)...
netsh advfirewall firewall delete rule name="SAP Assistant Backend" >nul 2>&1
netsh advfirewall firewall add rule name="SAP Assistant Backend" dir=in action=allow protocol=TCP localport=8000 profile=any

echo.
echo ========================================================
echo  SUKSES! Port 5173 dan 8000 sekarang sudah dibuka.
echo  Sekarang coba akses dari browser/HP:
echo  - Frontend: http://192.168.88.92:5173
echo  - Backend:  http://192.168.88.92:8000/docs
echo ========================================================
echo.
pause