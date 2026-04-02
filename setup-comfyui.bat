@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   ABOV3 Eden - ComfyUI Auto Setup
echo   AI Image Generation Installation
echo ============================================
echo.

:: Check for admin rights (needed for some operations)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Note: Running without admin rights. Some features may be limited.
    echo.
)

:: Configuration
set COMFYUI_DIR=%~dp0comfyui
set MODELS_DIR=%COMFYUI_DIR%\models\checkpoints
set TORCH_VERSION=2.5.1
set CUDA_VERSION=cu121
set PYTHON_CMD=

:: Check Python - need 3.10, 3.11, or 3.12 (PyTorch doesn't support 3.13 yet)
echo [1/7] Checking Python installation...

:: First try the Python Launcher to find compatible versions
echo Searching for compatible Python version (3.10-3.12)...

:: Try Python 3.12 first (newest compatible)
py -3.12 --version >nul 2>&1
if %errorLevel% equ 0 (
    set PYTHON_CMD=py -3.12
    for /f "tokens=2" %%i in ('py -3.12 --version 2^>^&1') do set PYTHON_VER=%%i
    echo Found Python !PYTHON_VER! via py launcher
    goto :python_found
)

:: Try Python 3.11
py -3.11 --version >nul 2>&1
if %errorLevel% equ 0 (
    set PYTHON_CMD=py -3.11
    for /f "tokens=2" %%i in ('py -3.11 --version 2^>^&1') do set PYTHON_VER=%%i
    echo Found Python !PYTHON_VER! via py launcher
    goto :python_found
)

:: Try Python 3.10
py -3.10 --version >nul 2>&1
if %errorLevel% equ 0 (
    set PYTHON_CMD=py -3.10
    for /f "tokens=2" %%i in ('py -3.10 --version 2^>^&1') do set PYTHON_VER=%%i
    echo Found Python !PYTHON_VER! via py launcher
    goto :python_found
)

:: Check default python
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo.
    echo Please install Python 3.11 or 3.12 from:
    echo https://www.python.org/downloads/release/python-3119/
    echo.
    echo Make sure to check "Add Python to PATH" during installation!
    echo.
    pause
    exit /b 1
)

:: Check if default python version is compatible
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i

:: Extract major.minor version
for /f "tokens=1,2 delims=." %%a in ("!PYTHON_VER!") do (
    set PY_MAJOR=%%a
    set PY_MINOR=%%b
)

:: Check version compatibility (need 3.10, 3.11, or 3.12)
if "!PY_MAJOR!" neq "3" (
    echo ERROR: Python 3.x required, found !PYTHON_VER!
    goto :python_incompatible
)

if !PY_MINOR! GEQ 13 (
    echo.
    echo WARNING: Python !PYTHON_VER! detected.
    echo PyTorch does NOT support Python 3.13+ yet.
    echo.
    goto :python_incompatible
)

if !PY_MINOR! LSS 10 (
    echo.
    echo WARNING: Python !PYTHON_VER! is too old.
    echo PyTorch requires Python 3.10 or newer.
    echo.
    goto :python_incompatible
)

set PYTHON_CMD=python
echo Found compatible Python !PYTHON_VER!
goto :python_found

:python_incompatible
echo ============================================
echo   Installing Compatible Python Version
echo ============================================
echo.
echo PyTorch requires Python 3.10-3.12.
echo Automatically downloading and installing Python 3.11...
echo.

:: Download Python 3.11.9 installer
set PYTHON_INSTALLER=%TEMP%\python-3.11.9-amd64.exe
set PYTHON_URL=https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe

echo Downloading Python 3.11.9...
powershell -Command "& {$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_INSTALLER%'}"

if not exist "%PYTHON_INSTALLER%" (
    echo ERROR: Failed to download Python installer
    echo Please download manually from:
    echo   https://www.python.org/downloads/release/python-3119/
    pause
    exit /b 1
)

echo.
echo Installing Python 3.11.9...
echo This will install Python 3.11 alongside your existing Python.
echo.

:: Install Python 3.11 with these options:
:: - InstallAllUsers=0 (current user only, no admin needed)
:: - PrependPath=1 (add to PATH)
:: - Include_pip=1 (include pip)
:: - Include_launcher=1 (include py launcher)
:: - AssociateFiles=0 (don't change file associations)
"%PYTHON_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=0 Include_pip=1 Include_launcher=1 Include_test=0 AssociateFiles=0 Shortcuts=0

if %errorLevel% neq 0 (
    echo.
    echo Automatic installation failed. Trying interactive install...
    echo Please complete the installation wizard.
    echo IMPORTANT: Check "Add Python to PATH" option!
    echo.
    "%PYTHON_INSTALLER%"
)

:: Clean up installer
del "%PYTHON_INSTALLER%" 2>nul

:: Verify installation
echo.
echo Verifying Python 3.11 installation...
timeout /t 2 >nul

py -3.11 --version >nul 2>&1
if %errorLevel% equ 0 (
    set PYTHON_CMD=py -3.11
    for /f "tokens=2" %%i in ('py -3.11 --version 2^>^&1') do set PYTHON_VER=%%i
    echo Python !PYTHON_VER! installed successfully!
    goto :python_found
)

:: Check common install locations
set PYTHON311_PATH=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
if exist "%PYTHON311_PATH%" (
    set PYTHON_CMD="%PYTHON311_PATH%"
    echo Found Python 3.11 at %PYTHON311_PATH%
    goto :python_found
)

echo.
echo ERROR: Python 3.11 installation could not be verified.
echo Please restart your terminal and run this script again.
echo.
pause
exit /b 1

:python_found
echo Using: !PYTHON_CMD!

:: Check if ComfyUI already exists
if exist "%COMFYUI_DIR%\main.py" (
    echo.
    echo [!] ComfyUI already installed at %COMFYUI_DIR%
    echo.
    set /p REINSTALL="Do you want to reinstall? (y/N): "
    if /i "!REINSTALL!" neq "y" (
        echo Skipping download. Will verify dependencies...
        goto :install_deps
    )
    echo Removing old installation...
    rmdir /s /q "%COMFYUI_DIR%" 2>nul
)

:: Download ComfyUI
echo.
echo [2/7] Downloading ComfyUI...
echo This may take a few minutes...

:: Check if git is available
git --version >nul 2>&1
if %errorLevel% equ 0 (
    echo Using git to clone ComfyUI...
    git clone https://github.com/comfyanonymous/ComfyUI.git "%COMFYUI_DIR%"
    if %errorLevel% neq 0 (
        echo Git clone failed, trying alternative download...
        goto :download_zip
    )
) else (
    :download_zip
    echo Git not found, downloading ZIP archive...

    :: Use PowerShell to download
    powershell -Command "& {Invoke-WebRequest -Uri 'https://github.com/comfyanonymous/ComfyUI/archive/refs/heads/master.zip' -OutFile '%TEMP%\comfyui.zip'}"

    if not exist "%TEMP%\comfyui.zip" (
        echo ERROR: Failed to download ComfyUI
        pause
        exit /b 1
    )

    echo Extracting...
    powershell -Command "& {Expand-Archive -Path '%TEMP%\comfyui.zip' -DestinationPath '%TEMP%\comfyui_extract' -Force}"

    :: Move to correct location
    move "%TEMP%\comfyui_extract\ComfyUI-master" "%COMFYUI_DIR%"

    :: Cleanup
    del "%TEMP%\comfyui.zip" 2>nul
    rmdir /s /q "%TEMP%\comfyui_extract" 2>nul
)

if not exist "%COMFYUI_DIR%\main.py" (
    echo ERROR: ComfyUI download failed
    pause
    exit /b 1
)

echo ComfyUI downloaded successfully!

:: Create virtual environment
echo.
echo [3/7] Creating Python virtual environment...
cd /d "%COMFYUI_DIR%"
%PYTHON_CMD% -m venv venv

if not exist "%COMFYUI_DIR%\venv\Scripts\python.exe" (
    echo ERROR: Failed to create virtual environment
    pause
    exit /b 1
)

:install_deps
:: Activate venv and install dependencies
echo.
echo [4/7] Installing PyTorch with CUDA support...
echo This will take several minutes...

call "%COMFYUI_DIR%\venv\Scripts\activate.bat"

:: Upgrade pip first
python -m pip install --upgrade pip

:: Install PyTorch with CUDA
echo Installing PyTorch %TORCH_VERSION% with CUDA %CUDA_VERSION%...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/%CUDA_VERSION%

if %errorLevel% neq 0 (
    echo.
    echo WARNING: CUDA PyTorch installation failed.
    echo Trying CPU-only version (slower but works without NVIDIA GPU)...
    pip install torch torchvision torchaudio
)

:: Install ComfyUI requirements
echo.
echo [5/7] Installing ComfyUI dependencies...
pip install -r requirements.txt

if %errorLevel% neq 0 (
    echo WARNING: Some dependencies may have failed to install
)

:: Install additional useful packages
pip install opencv-python pillow scipy

:check_models
:: Download model
echo.
echo [6/7] Checking for Stable Diffusion models...

if not exist "%MODELS_DIR%" mkdir "%MODELS_DIR%"

:: Check if any model exists
set MODEL_EXISTS=0
for %%f in ("%MODELS_DIR%\*.safetensors" "%MODELS_DIR%\*.ckpt") do (
    if exist "%%f" set MODEL_EXISTS=1
)

if %MODEL_EXISTS% equ 1 (
    echo Found existing model(s) in %MODELS_DIR%
    echo Skipping model download.
) else (
    echo.
    echo No models found. Downloading SD 1.5 base model...
    echo (Smaller and faster than SDXL, good for testing)
    echo.
    echo This is a ~4GB download, please wait...

    :: Download SD 1.5 (smaller, faster to download and run)
    powershell -Command "& {$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors' -OutFile '%MODELS_DIR%\v1-5-pruned-emaonly.safetensors'}"

    if exist "%MODELS_DIR%\v1-5-pruned-emaonly.safetensors" (
        echo Model downloaded successfully!
    ) else (
        echo.
        echo WARNING: Automatic model download failed.
        echo.
        echo Please download a model manually from:
        echo   https://huggingface.co/runwayml/stable-diffusion-v1-5
        echo   or
        echo   https://civitai.com/models
        echo.
        echo And place the .safetensors file in:
        echo   %MODELS_DIR%
        echo.
    )
)

:: Update Eden config
echo.
echo [7/7] Configuring ABOV3 Eden...

:: Create/update config.json with ComfyUI settings
set CONFIG_FILE=%~dp0config.json

:: Check if config exists and has comfyui section
if exist "%CONFIG_FILE%" (
    echo Updating existing config.json...
    :: Use PowerShell to update JSON
    powershell -Command "& {$config = Get-Content '%CONFIG_FILE%' -Raw | ConvertFrom-Json; if (-not $config.comfyui) { $config | Add-Member -NotePropertyName 'comfyui' -NotePropertyValue @{} }; $config.comfyui.enabled = $true; $config.comfyui.autoStart = $true; $config.comfyui.path = '%COMFYUI_DIR%'.Replace('\', '/'); $config.comfyui.pythonPath = '%COMFYUI_DIR%/venv/Scripts/python.exe'.Replace('\', '/'); $config.comfyui.host = '127.0.0.1'; $config.comfyui.port = 8188; if (-not $config.comfyui.models) { $config.comfyui | Add-Member -NotePropertyName 'models' -NotePropertyValue @{} }; $config.comfyui.models.checkpointDefault = 'v1-5-pruned-emaonly.safetensors'; $config | ConvertTo-Json -Depth 10 | Set-Content '%CONFIG_FILE%'}"
) else (
    echo Creating new config.json...
    (
        echo {
        echo   "comfyui": {
        echo     "enabled": true,
        echo     "autoStart": true,
        echo     "path": "%COMFYUI_DIR:\=/%",
        echo     "pythonPath": "%COMFYUI_DIR:\=/%/venv/Scripts/python.exe",
        echo     "host": "127.0.0.1",
        echo     "port": 8188,
        echo     "models": {
        echo       "checkpointDefault": "v1-5-pruned-emaonly.safetensors"
        echo     }
        echo   }
        echo }
    ) > "%CONFIG_FILE%"
)

echo.
echo ============================================
echo   Installation Complete!
echo ============================================
echo.
echo ComfyUI has been installed to:
echo   %COMFYUI_DIR%
echo.
echo To test ComfyUI manually, run:
echo   cd %COMFYUI_DIR%
echo   venv\Scripts\python main.py
echo.
echo Then open: http://127.0.0.1:8188
echo.
echo ABOV3 Eden will now automatically start ComfyUI
echo when you request AI image generation.
echo.
echo To start Eden, run: npm run dev
echo.
pause
