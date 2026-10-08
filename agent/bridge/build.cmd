@echo off
rem Ko'prikni yig'adi: erp-bridge.jar. JDK 8 yoki yangiroq kerak (javac va jar PATH da bo'lsin).
rem lib\ papkasida Chainway SDK fayllari bo'lishi shart (README.md ga qarang).
setlocal
cd /d "%~dp0"
if not exist lib\ReaderAPI*.jar (
  echo lib\ papkasida ReaderAPI*.jar topilmadi. README.md dagi "SDK fayllari" bo'limiga qarang.
  exit /b 1
)
if exist out rmdir /s /q out
mkdir out
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -cp "lib\*" -d out src\uz\erp\bridge\Bridge.java || exit /b 1
jar cfe erp-bridge.jar uz.erp.bridge.Bridge -C out . || exit /b 1
echo Tayyor: erp-bridge.jar
