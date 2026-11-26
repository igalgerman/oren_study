@echo off
rem Freeze (#139): stop new work, park running issues at a safe point, save where each is, say "safe to restart". Add --unfreeze to continue.
"C:\Users\97254\miniforge3\python.exe" "%~dp0runner\runner.py" --freeze %*
