@echo off
rem Owner dashboard with a FRESH AI assessment (#171): asks Claude now (about 15 s), then opens the page. Double-click.
rem (tools\dashboard.cmd is the fast one: it shows the AI text the watchdog wrote in the last hour.)
cd /d "%~dp0.."
"C:\Users\97254\miniforge3\python.exe" tools\runner\dashboard.py --ai
