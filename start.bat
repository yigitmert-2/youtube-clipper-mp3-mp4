@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo   YouTube MP3 Clipper - Setup ^& Launch
echo ==================================================
echo.

REM ---- Step 1: Check for Python ----
set PYTHON_CMD=
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set PYTHON_CMD=python
) else (
    python3 --version >nul 2>&1
    if %errorlevel% equ 0 (
        set PYTHON_CMD=python3
    )
)

if "%PYTHON_CMD%"=="" (
    echo [ERROR] Python is required but not found.
    echo.
    echo   Download it from: https://www.python.org/downloads/
    echo   Make sure to check 'Add Python to PATH' during installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Found Python:
%PYTHON_CMD% --version
echo.

REM ---- Step 2: Create virtual environment if needed ----
if not exist "venv\" (
    echo Creating virtual environment...
    %PYTHON_CMD% -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created.
    echo.
)

REM ---- Step 3: Activate venv ----
call venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)
echo [OK] Virtual environment activated.
echo.

REM ---- Step 4: Install dependencies ----
echo Installing dependencies...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.
echo.

REM ---- Step 5: Ensure tools directory exists ----
if not exist "tools\" mkdir tools

REM ---- Step 6: Check for FFmpeg ----
if not exist "tools\ffmpeg.exe" (
    echo FFmpeg not found. Downloading portable FFmpeg...
    echo This may take a minute...
    echo.

    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile 'tools\ffmpeg.zip'"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to download FFmpeg.
        echo You can manually download it from:
        echo   https://github.com/BtbN/FFmpeg-Builds/releases
        echo Place ffmpeg.exe and ffprobe.exe in the tools\ folder.
        echo.
        pause
        exit /b 1
    )

    echo Extracting FFmpeg...
    powershell -Command "Expand-Archive -Path 'tools\ffmpeg.zip' -DestinationPath 'tools\ffmpeg-temp' -Force"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to extract FFmpeg.
        pause
        exit /b 1
    )

    REM Copy ffmpeg.exe and ffprobe.exe from nested bin folder
    for /r tools\ffmpeg-temp %%f in (ffmpeg.exe ffprobe.exe) do (
        copy "%%f" tools\ /Y >nul
    )

    REM Clean up temp files
    del /q tools\ffmpeg.zip 2>nul
    rmdir /s /q tools\ffmpeg-temp 2>nul

    if exist "tools\ffmpeg.exe" (
        echo [OK] FFmpeg downloaded successfully!
    ) else (
        echo [WARNING] FFmpeg extraction may have failed.
        echo Please manually place ffmpeg.exe in the tools\ folder.
    )
    echo.
)

echo [OK] FFmpeg is available in tools\
echo.

REM ---- Step 6.5: Check for Node.js (Required for YouTube JS signatures) ----
if not exist "tools\node.exe" (
    echo Node.js not found. Downloading portable Node.js...
    echo This is required to solve YouTube signature challenges...
    echo.

    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.13.1/node-v20.13.1-win-x64.zip' -OutFile 'tools\node.zip'"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to download Node.js.
        echo YouTube downloads might fail with 'Signature solving failed'.
    ) else (
        echo Extracting Node.js...
        powershell -Command "Expand-Archive -Path 'tools\node.zip' -DestinationPath 'tools' -Force"
        
        copy "tools\node-v20.13.1-win-x64\node.exe" tools\ /Y >nul
        
        REM Clean up temp files
        del /q tools\node.zip 2>nul
        rmdir /s /q tools\node-v20.13.1-win-x64 2>nul
        
        if exist "tools\node.exe" (
            echo [OK] Node.js downloaded successfully!
        ) else (
            echo [WARNING] Node.js extraction failed.
        )
    )
    echo.
)

echo [OK] Node.js is available in tools\
echo.

REM ---- Step 7: Launch the server ----
echo ==================================================
echo   Starting YouTube MP3 Clipper...
echo   Open your browser to: http://localhost:5000
echo ==================================================
echo.

start http://localhost:5000
%PYTHON_CMD% app.py

pause
