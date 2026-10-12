@echo off
rem Data Search - write display labels from schema.local.json column names into view.local.json
chcp 65001 > nul
cd /d "%~dp0"
set "PY=python"
where py > nul 2> nul && set "PY=py -3"
%PY% python\tools\make_view_labels.py %*
pause
