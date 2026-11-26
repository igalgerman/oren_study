@echo off
rem Recover (#140): after a PC restart (or crash) start Herdr, remove finished terminals, start orchestrator/inbox/inspector (space Oren control) and the watchdog, clear stale locks, give dead runs back to the runner.
rem Runs by itself at logon; install that once with: tools\recover.cmd --install
cd /d "%~dp0.."
"C:\Users\97254\miniforge3\python.exe" "%~dp0runner\recover.py" %*
