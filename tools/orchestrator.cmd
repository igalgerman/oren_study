@echo off
rem Start a fresh orchestrator (main session) in herdr, with the Oren lanes panel. Double-click.
cd /d "%~dp0.."
"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" run --bg --no-parent --outlive-parent --name orchestrator --cwd "%CD%" claude --remote-control "oren-orchestrator" --plugin-dir "%CD%\tools\mods\oren-lanes" "Read ORCHESTRATOR.md and continue as the orchestrator. Open the Oren lanes panel (/lanes)."
rem the watchdog (checks every minute that nothing is stuck); already running = this line just fails, fine
"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" run --bg --no-parent --outlive-parent --name watchdog --cwd "%CD%" "C:\Users\97254\miniforge3\python.exe" tools\runner\watchdog.py
"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" attach orchestrator
