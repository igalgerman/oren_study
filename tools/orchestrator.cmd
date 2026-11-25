@echo off
rem Double-click: opens the herdr layout 'oren' = orchestrator pane left, inbox pane right, worker tabs below.
rem (starts the orchestrator + inbox terminals if they are not running, writes the layout, switches to it)
cd /d "%~dp0.."
rem the watchdog (checks every minute that nothing is stuck); already running = this line just fails, fine
"C:\Users\97254\AppData\Local\Programs\herdr-core\hc.exe" run --bg --no-parent --outlive-parent --name watchdog --cwd "%CD%" "C:\Users\97254\miniforge3\python.exe" tools\runner\watchdog.py
"C:\Users\97254\miniforge3\python.exe" tools\herdr_layout.py
