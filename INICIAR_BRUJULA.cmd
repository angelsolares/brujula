@echo off
setlocal
cd /d "%~dp0"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process 'http://127.0.0.1:8787'"
set "BRUJULA_PYTHON=C:\Users\angel\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%BRUJULA_PYTHON%" (
  "%BRUJULA_PYTHON%" server.py
  goto :done
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  python server.py
)
:done
endlocal
