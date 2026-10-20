@echo off
cd /d "%~dp0"
node dist\main.js >> agent.log 2>&1
