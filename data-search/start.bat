@echo off
rem Data Search - Python version
rem Settings: config\sample\*.sample.json overridden by config\local\*.local.json (if present)
chcp 65001 > nul
cd /d "%~dp0"
set "PY=python"
where py > nul 2> nul && set "PY=py -3"
%PY% python\run_server.py
if errorlevel 1 pause
