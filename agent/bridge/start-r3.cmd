@echo off
cd /d "%~dp0"
call run.cmd r3 >> bridge.log 2>&1
