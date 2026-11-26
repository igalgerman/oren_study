@echo off
rem Owner dashboard (#142): fresh numbers on open issues, progress and the pipeline, opened in the browser. Double-click.
cd /d "%~dp0.."
"C:\Users\97254\miniforge3\python.exe" tools\runner\dashboard.py
