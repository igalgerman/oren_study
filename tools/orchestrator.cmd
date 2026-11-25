@echo off
rem Start a fresh orchestrator (main session) in herdr, with the Oren lanes panel. Double-click.
cd /d "%~dp0.."
"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" run --bg --no-parent --outlive-parent --name orchestrator --cwd "%CD%" claude --plugin-dir "%CD%\tools\mods\oren-lanes" "Read ORCHESTRATOR.md and continue as the orchestrator. Open the Oren lanes panel (/lanes)."
"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" attach orchestrator
