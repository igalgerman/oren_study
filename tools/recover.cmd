@echo off
rem Recover (#140): after a PC restart (or crash) start Herdr, orchestrator and watchdog, clear stale locks, resume the issues that were running.
rem Runs by itself at logon; install that once with: tools\recover.cmd --install
cd /d "%~dp0.."
"C:\Users\97254\miniforge3\python.exe" "%~dp0runner\recover.py" %*
