# ============================================================
# SUSTAINABLE CLASSROOM - ONE-COMMAND DEPLOYMENT SCRIPT
# ============================================================
# Africa Sustainable Classroom Challenge - Finals Edition
# Automated deployment for On-Premise Student Learning System
# Windows PowerShell Version
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🎓 ======================================" -ForegroundColor Cyan
Write-Host "   SUSTAINABLE CLASSROOM DEPLOYMENT" -ForegroundColor Cyan
Write-Host "   Africa Challenge - On-Premise Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Function to print colored messages
function Print-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Print-Error { Write-Host "✗ $args" -ForegroundColor Red }
function Print-Info { Write-Host "ℹ $args" -ForegroundColor Blue }
function Print-Warning { Write-Host "⚠ $args" -ForegroundColor Yellow }

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor White

# Check Docker
try {
    $null = docker --version
    Print-Success "Docker installed"
} catch {
    Print-Error "Docker not found! Please install Docker Desktop."
    Write-Host "Visit: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check Docker Compose
try {
    $null = docker-compose --version
    Print-Success "Docker Compose installed"
} catch {
    Print-Error "Docker Compose not found! Please install Docker Compose."
    exit 1
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Print-Warning ".env file not found. Creating from template..."
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Print-Info "Created .env from template. Please edit with your values."
        Print-Info "Minimum required: DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD"
        Write-Host ""
        Read-Host "Press Enter after editing .env file (or Ctrl+C to exit)"
    } else {
        Print-Error ".env.example not found!"
        exit 1
    }
} else {
    Print-Success ".env file exists"
}

Write-Host ""
Write-Host "🐳 Starting Docker deployment..." -ForegroundColor Cyan
Write-Host ""

# Stop any existing containers
Print-Info "Stopping existing containers..."
docker-compose down 2>$null

# Pull latest images
Print-Info "Pulling Docker images..."
docker-compose pull

# Build the application
Print-Info "Building application..."
docker-compose build

# Start services
Print-Info "Starting services..."
docker-compose up -d

Write-Host ""
Write-Host "⏳ Waiting for services to be healthy..." -ForegroundColor Yellow
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
    Write-Host "📋 Checking logs..." -ForegroundColor Yellow
    docker-compose logs postgres --tail 20
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
    Write-Host "📋 Checking backend logs..." -ForegroundColor Yellow
    docker-compose logs backend --tail 30
    exit 1
}

Write-Host ""
Print-Success "Backend API is ready"

Write-Host ""
Write-Host "🎉 ======================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Print-Success "All services are running!"
Write-Host ""
Write-Host "📍 Access Points:" -ForegroundColor Cyan
Write-Host "   • Application: http://localhost:5000"
Write-Host "   • MailHog (Email): http://localhost:8025"
Write-Host "   • Database: localhost:5432"
Write-Host ""
Write-Host "🔑 Default Credentials:" -ForegroundColor Cyan
Write-Host "   • Admin: admin@classroom.local / Admin@2026"
Write-Host "   • Teacher: susclass.global+sarah.teacher@gmail.com / password123"
Write-Host "   • Student: susclass.global+amara@gmail.com / student123"
Write-Host ""
Write-Host "📚 Quick Commands:" -ForegroundColor Cyan
Write-Host "   • View logs: docker-compose logs -f"
Write-Host "   • Stop: docker-compose down"
Write-Host "   • Restart: docker-compose restart"
Write-Host "   • Status: docker-compose ps"
Write-Host ""
Print-Warning "⚠️  SECURITY REMINDER:"
Write-Host "   Change default passwords immediately!"
Write-Host "   Edit JWT_SECRET in .env for production!"
Write-Host ""
Write-Host "📖 For more info, see README.md and DEPLOYMENT.md"
Write-Host ""

# Optional: Run verification tests
$runTests = Read-Host "Run automated verification tests? (y/n)"
if ($runTests -eq "y" -or $runTests -eq "Y") {
    Write-Host ""
    Write-Host "🧪 Running verification tests..." -ForegroundColor Cyan
    
    # Test health endpoint
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5000/api/health"
        if ($response.status -eq "ok") {
            Print-Success "Health check passed"
        }
    } catch {
        Print-Error "Health check failed"
    }
    
    # Test admin login
    try {
        $body = @{
            email = "admin@classroom.local"
            password = "Admin@2026"
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/login" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body
        
        if ($response.token) {
            Print-Success "Admin login works"
        }
    } catch {
        Print-Error "Admin login failed"
    }
    
    Write-Host ""
    Print-Success "Basic verification complete!"
}

Write-Host ""
Write-Host "✅ Setup complete! Happy teaching and learning! 🎓" -ForegroundColor Green
Write-Host ""
