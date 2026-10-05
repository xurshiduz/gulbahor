@echo off
rem Ko'prikni yig'adi: gulbahor-bridge.jar. JDK 8 yoki yangiroq kerak (javac va jar PATH da bo'lsin).
rem lib\ papkasida Chainway SDK fayllari bo'lishi shart (README.md ga qarang).
setlocal
cd /d "%~dp0"
if not exist lib\ReaderAPI*.jar (
  echo lib\ papkasida ReaderAPI*.jar topilmadi. README.md dagi "SDK fayllari" bo'limiga qarang.
  exit /b 1
)
if exist out rmdir /s /q out
mkdir out
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -cp "lib\*" -d out src\uz\gulbahor\bridge\Bridge.java || exit /b 1
jar cfe gulbahor-bridge.jar uz.gulbahor.bridge.Bridge -C out . || exit /b 1
echo Tayyor: gulbahor-bridge.jar
