# ============================================================
# NOTIFICATION SYSTEM - DATABASE SETUP SCRIPT (Windows)
# ============================================================
# This script sets up the notification system database schema
# ============================================================

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🔔 Notification System Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "❌ ERROR: DATABASE_URL environment variable not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set it first:" -ForegroundColor Yellow
    Write-Host '  $env:DATABASE_URL = "your-postgres-connection-string"' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or load from .env file:" -ForegroundColor Yellow
    Write-Host '  Get-Content backend\.env | ForEach-Object { if ($_ -match "DATABASE_URL=(.+)") { $env:DATABASE_URL = $matches[1].Trim("''") } }' -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "✓ DATABASE_URL found" -ForegroundColor Green
Write-Host ""

# Check if SQL file exists
if (-not (Test-Path "backend/notification-system.sql")) {
    Write-Host "❌ ERROR: backend/notification-system.sql not found" -ForegroundColor Red
    Write-Host "Make sure you're running this from the project root directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ SQL file found" -ForegroundColor Green
Write-Host ""

# Check if psql is available
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ERROR: psql command not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install PostgreSQL client tools:" -ForegroundColor Yellow
    Write-Host "  https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or run the SQL file manually in your database client (pgAdmin, DBeaver, etc.)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Run the SQL file
Write-Host "Running database migration..." -ForegroundColor Cyan
Write-Host ""

try {
    psql $env:DATABASE_URL -f backend/notification-system.sql
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "======================================" -ForegroundColor Green
        Write-Host "✅ SUCCESS!" -ForegroundColor Green
        Write-Host "======================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Notification system database setup complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Configure SMTP in backend\.env" -ForegroundColor White
        Write-Host "  2. Restart your server: cd backend; npm run dev" -ForegroundColor White
        Write-Host "  3. Test notifications" -ForegroundColor White
        Write-Host ""
        Write-Host "See NOTIFICATION-SYSTEM-GUIDE.md for details" -ForegroundColor Yellow
        Write-Host ""
    } else {
        throw "psql command failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Red
    Write-Host "❌ FAILED" -ForegroundColor Red
    Write-Host "======================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Database migration failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "You can also run the SQL manually:" -ForegroundColor Yellow
    Write-Host "  1. Open backend/notification-system.sql in pgAdmin or DBeaver" -ForegroundColor White
    Write-Host "  2. Connect to your database" -ForegroundColor White
    Write-Host "  3. Execute the SQL script" -ForegroundColor White
    Write-Host ""
    exit 1
}
