@echo off
REM ============================================================
REM SUSTAINABLE CLASSROOM - ONE-COMMAND DEPLOYMENT SCRIPT
REM ============================================================
REM Usage: deploy.bat [dev|prod]
REM   dev  - Builds images locally (default)
REM   prod - Uses pre-built images from GitHub Container Registry
REM ============================================================

setlocal enabledelayedexpansion

set MODE=%1
if "%MODE%"=="" set MODE=dev

echo ============================================================
echo    SUSTAINABLE CLASSROOM DEPLOYMENT
echo    Mode: %MODE%
echo ============================================================
echo.

REM Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker not found. Please install Docker first.
    echo Visit: https://docs.docker.com/get-docker/
    exit /b 1
)
echo [SUCCESS] Docker installed

REM Check Docker Compose
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    docker-compose --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Docker Compose not found. Please install Docker Compose.
        exit /b 1
    )
    set COMPOSE_CMD=docker-compose
) else (
    set COMPOSE_CMD=docker compose
)
echo [SUCCESS] Docker Compose installed

REM Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found. Creating default...
    (
        echo # Database
        echo DB_PASSWORD=SecureLocalDB2026
        echo.
        echo # Authentication
        echo JWT_SECRET=OnPremiseSecureKey2026AfricaChallenge
        echo ADMIN_EMAIL=admin@classroom.local
        echo ADMIN_PASSWORD=Admin@2026
        echo.
        echo # Email Configuration
        echo SMTP_HOST=mailhog
        echo SMTP_PORT=1025
        echo SMTP_SECURE=false
        echo SMTP_USER=
        echo SMTP_PASS=
        echo EMAIL_FROM_ADDRESS=noreply@classroom.local
        echo.
        echo # Jitsi Configuration
        echo JITSI_PUBLIC_URL=https://localhost:8443
        echo DOCKER_HOST_ADDRESS=127.0.0.1
        echo JICOFO_AUTH_PASSWORD=jicofopassword
        echo JVB_AUTH_PASSWORD=jvbpassword
        echo.
        echo # Production Settings
        echo GITHUB_REPOSITORY=susclass/sustainable-classroom
        echo IMAGE_TAG=latest
    ) > .env
    echo [INFO] Created default .env file.
) else (
    echo [SUCCESS] .env file exists
)

echo.
echo [INFO] Starting Docker deployment...
echo.

REM Stop any existing containers
echo [INFO] Stopping existing containers...
%COMPOSE_CMD% down 2>nul

if "%MODE%"=="prod" (
    echo [INFO] Production mode - using pre-built images from GHCR...
    set COMPOSE_FILE=docker-compose.prod.yml
    
    echo [INFO] Pulling Docker images...
    %COMPOSE_CMD% -f docker-compose.prod.yml pull
) else (
    echo [INFO] Development mode - building locally...
    set COMPOSE_FILE=docker-compose.yml
    
    echo [INFO] Pulling Docker images...
    %COMPOSE_CMD% -f docker-compose.yml pull 2>nul
    
    echo [INFO] Building application...
    %COMPOSE_CMD% -f docker-compose.yml build
)

echo [INFO] Starting services...
%COMPOSE_CMD% -f %COMPOSE_FILE% up -d

echo.
echo [INFO] Waiting for services to start...
timeout /t 10 /nobreak >nul

echo.
echo ============================================================
echo    DEPLOYMENT COMPLETE
echo ============================================================
echo.
echo Access Points:
echo    Application:     http://localhost:5000
echo    Email UI:        http://localhost:8025
echo    Jitsi Meet:      https://localhost:8443
echo    Database:        localhost:5432
echo.
echo Default Credentials:
echo    Admin:   admin@classroom.local / Admin@2026
echo.
echo Commands:
echo    View logs:   %COMPOSE_CMD% -f %COMPOSE_FILE% logs -f
echo    Stop:        %COMPOSE_CMD% -f %COMPOSE_FILE% down
echo    Restart:     %COMPOSE_CMD% -f %COMPOSE_FILE% restart
echo    Status:      %COMPOSE_CMD% -f %COMPOSE_FILE% ps
echo.
echo [WARNING] SECURITY: Change default passwords for production use.
echo.
echo See README.md and DEPLOYMENT.md for more information.
echo.

endlocal
