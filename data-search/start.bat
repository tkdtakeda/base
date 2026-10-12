@echo off
rem Data Search - Python version (uses config\config.local.json)
chcp 65001 > nul
cd /d "%~dp0"
set "PY=python"
where py > nul 2> nul && set "PY=py -3"
%PY% python\run_server.py --config config\config.local.json
if errorlevel 1 pause
