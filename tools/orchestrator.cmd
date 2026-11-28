@echo off
rem Double-click (#25): opens the ONE Herdr space "oren" = tabs orchestrator, inbox, inspector, executor (started when missing).
rem The watchdog (and the runner passes it starts) runs with no tab; worker/review windows open in the space "oren-workers".
cd /d "%~dp0.."
"C:\Users\97254\miniforge3\python.exe" "%~dp0runner\recover.py" --open
"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" attach orchestrator
