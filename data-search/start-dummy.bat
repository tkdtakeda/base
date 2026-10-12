@echo off
rem Data Search - Python version with dummy data (no real data is used)
chcp 65001 > nul
cd /d "%~dp0"
set "PY=python"
where py > nul 2> nul && set "PY=py -3"
%PY% python\tools\make_dummy_db.py --if-missing
%PY% python\run_server.py --config config\config.dummy.json
if errorlevel 1 pause
