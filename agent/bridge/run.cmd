@echo off
rem Ko'prikni ishga tushiradi. Misollar:
rem   run.cmd r3
rem   run.cmd ur4 --reader 192.168.99.202:8888 --antennas 1,2
setlocal
cd /d "%~dp0"
java -Djna.library.path=lib -Djava.library.path=lib -cp "gulbahor-bridge.jar;lib\*" uz.gulbahor.bridge.Bridge %*
