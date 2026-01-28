# ============================================================
# SUSTAINABLE CLASSROOM - ONE-COMMAND DEPLOYMENT SCRIPT
# ============================================================
# Usage: .\deploy.ps1 [dev|prod]
#   dev  - Builds images locally (default)
#   prod - Uses pre-built images from GitHub Container Registry
# ============================================================

param(
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   SUSTAINABLE CLASSROOM DEPLOYMENT" -ForegroundColor Cyan
Write-Host "   Mode: $Mode" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Function to print colored messages
function Print-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Print-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }
function Print-Info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function Print-Warning { Write-Host "[WARNING] $args" -ForegroundColor Yellow }

# Check prerequisites
Write-Host "[INFO] Checking prerequisites..." -ForegroundColor White

# Check Docker
try {
    $null = docker --version
    Print-Success "Docker installed"
} catch {
    Print-Error "Docker not found. Please install Docker Desktop."
    Write-Host "Visit: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check Docker Compose
$composeCmd = "docker-compose"
try {
    $null = docker compose version 2>$null
    $composeCmd = "docker compose"
    Print-Success "Docker Compose installed"
} catch {
    try {
        $null = docker-compose --version
        Print-Success "Docker Compose installed"
    } catch {
        Print-Error "Docker Compose not found. Please install Docker Compose."
        exit 1
    }
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Print-Warning ".env file not found. Creating default..."
    @"
# Database
DB_PASSWORD=SecureLocalDB2026

# Authentication
JWT_SECRET=OnPremiseSecureKey2026AfricaChallenge
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026

# Email Configuration
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM_ADDRESS=noreply@classroom.local

# Jitsi Configuration
JITSI_PUBLIC_URL=https://localhost:8443
DOCKER_HOST_ADDRESS=127.0.0.1
JICOFO_AUTH_PASSWORD=jicofopassword
JVB_AUTH_PASSWORD=jvbpassword

# Production Settings
GITHUB_REPOSITORY=susclass/sustainable-classroom
IMAGE_TAG=latest
"@ | Out-File -FilePath ".env" -Encoding utf8
    Print-Info "Created default .env file."
} else {
    Print-Success ".env file exists"
}

Write-Host ""
Write-Host "[INFO] Starting Docker deployment..." -ForegroundColor Cyan
Write-Host ""

# Stop any existing containers
Print-Info "Stopping existing containers..."
if ($composeCmd -eq "docker compose") {
    docker compose down 2>$null
} else {
    docker-compose down 2>$null
}

# Set compose file based on mode
if ($Mode -eq "prod") {
    $composeFile = "docker-compose.prod.yml"
    Print-Info "Production mode - using pre-built images from GHCR..."
    
    # Pull pre-built images
    Print-Info "Pulling Docker images..."
    if ($composeCmd -eq "docker compose") {
        docker compose -f $composeFile pull
    } else {
        docker-compose -f $composeFile pull
    }
} else {
    $composeFile = "docker-compose.yml"
    Print-Info "Development mode - building locally..."
    
    # Pull base images
    Print-Info "Pulling Docker images..."
    if ($composeCmd -eq "docker compose") {
        docker compose -f $composeFile pull 2>$null
        Print-Info "Building application..."
        docker compose -f $composeFile build
    } else {
        docker-compose -f $composeFile pull 2>$null
        Print-Info "Building application..."
        docker-compose -f $composeFile build
    }
}

# Start services
Print-Info "Starting services..."
if ($composeCmd -eq "docker compose") {
    docker compose -f $composeFile up -d
} else {
    docker-compose -f $composeFile up -d
}

Write-Host ""
Write-Host "[INFO] Waiting for services to be healthy..." -ForegroundColor Yellow
Write-Host ""

# Wait for database
$maxWait = 60
$counter = 0
while ($counter -lt $maxWait) {
    try {
        $result = docker exec lms-database pg_isready -U lms_admin -d sustainable_classroom 2>$null
        if ($LASTEXITCODE -eq 0) { break }
    } catch {}
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
    $counter++
}

if ($counter -eq $maxWait) {
    Write-Host ""
    Print-Error "Database failed to start within $maxWait seconds"
    Write-Host ""
    Write-Host "[INFO] Checking logs..." -ForegroundColor Yellow
    if ($composeCmd -eq "docker compose") {
        docker compose -f $composeFile logs postgres --tail 20
    } else {
        docker-compose -f $composeFile logs postgres --tail 20
    }
    exit 1
}

Write-Host ""
Print-Success "Database is ready"

# Wait for Redis
$counter = 0
while ($counter -lt 30) {
    try {
        $result = docker exec lms-cache redis-cli ping 2>$null
        if ($LASTEXITCODE -eq 0) { break }
    } catch {}
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 1
    $counter++
}
Write-Host ""
Print-Success "Redis cache is ready"

# Wait for backend
$counter = 0
while ($counter -lt 60) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) { break }
    } catch {}
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
    $counter++
}

if ($counter -eq 60) {
    Write-Host ""
    Print-Error "Backend failed to start"
    Write-Host ""
    Write-Host "[INFO] Checking backend logs..." -ForegroundColor Yellow
    if ($composeCmd -eq "docker compose") {
        docker compose -f $composeFile logs backend --tail 30
    } else {
        docker-compose -f $composeFile logs backend --tail 30
    }
    exit 1
}

Write-Host ""
Print-Success "Backend API is ready"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT SUCCESSFUL" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Print-Success "All services are running"
Write-Host ""
Write-Host "Access Points:" -ForegroundColor Cyan
Write-Host "   Application:     http://localhost:5000"
Write-Host "   Email UI:        http://localhost:8025"
Write-Host "   Jitsi Meet:      https://localhost:8443"
Write-Host "   Database:        localhost:5432"
Write-Host ""
Write-Host "Default Credentials:" -ForegroundColor Cyan
Write-Host "   Admin:   admin@classroom.local / Admin@2026"
Write-Host ""
Write-Host "Commands:" -ForegroundColor Cyan
if ($composeCmd -eq "docker compose") {
    Write-Host "   View logs:   docker compose -f $composeFile logs -f"
    Write-Host "   Stop:        docker compose -f $composeFile down"
    Write-Host "   Restart:     docker compose -f $composeFile restart"
    Write-Host "   Status:      docker compose -f $composeFile ps"
} else {
    Write-Host "   View logs:   docker-compose -f $composeFile logs -f"
    Write-Host "   Stop:        docker-compose -f $composeFile down"
    Write-Host "   Restart:     docker-compose -f $composeFile restart"
    Write-Host "   Status:      docker-compose -f $composeFile ps"
}
Write-Host ""
Print-Warning "SECURITY: Change default passwords for production use."
Write-Host ""
Write-Host "See README.md and DEPLOYMENT.md for more information."
Write-Host ""
Write-Host "[COMPLETE] Deployment finished successfully." -ForegroundColor Green
Write-Host ""
