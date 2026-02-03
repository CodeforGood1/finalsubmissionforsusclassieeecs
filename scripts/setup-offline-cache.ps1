# ===========================================================================
# Offline Package Cache Setup Script (PowerShell Version)
# ===========================================================================
# This script downloads all npm dependencies for offline installation
# Run this ONCE when you have internet, then you can work offline
# ===========================================================================

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CacheDir = Join-Path $ProjectRoot "offline-cache"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setting up offline package cache..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Create cache directories
New-Item -ItemType Directory -Force -Path "$CacheDir\npm" | Out-Null
New-Item -ItemType Directory -Force -Path "$CacheDir\docker-images" | Out-Null

# ===========================================================================
# NPM PACKAGES
# ===========================================================================
Write-Host ""
Write-Host "[1/2] Caching NPM packages..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

# Client packages
Set-Location "$ProjectRoot\client"
if (Test-Path "package.json") {
    Write-Host "- Caching client dependencies..."
    npm install --cache "$CacheDir\npm" --prefer-offline
    Write-Host "✓ Client packages cached" -ForegroundColor Green
}

# Backend packages
Set-Location "$ProjectRoot\backend"
if (Test-Path "package.json") {
    Write-Host "- Caching backend dependencies..."
    npm install --cache "$CacheDir\npm" --prefer-offline
    Write-Host "✓ Backend packages cached" -ForegroundColor Green
}

# ===========================================================================
# DOCKER IMAGES
# ===========================================================================
Write-Host ""
Write-Host "[2/2] Saving Docker images..." -ForegroundColor Yellow
Write-Host "----------------------------------------"

Set-Location $ProjectRoot

Write-Host "- Pulling Docker images..."
docker-compose pull

Write-Host "- Saving images to tar files..."
docker save postgres:15-alpine -o "$CacheDir\docker-images\postgres-15-alpine.tar"
docker save redis:7-alpine -o "$CacheDir\docker-images\redis-7-alpine.tar"
docker save mailhog/mailhog:latest -o "$CacheDir\docker-images\mailhog.tar"
docker save jitsi/web:stable -o "$CacheDir\docker-images\jitsi-web.tar"
docker save jitsi/jicofo:stable -o "$CacheDir\docker-images\jitsi-jicofo.tar"
docker save jitsi/jvb:stable -o "$CacheDir\docker-images\jitsi-jvb.tar"
docker save jitsi/prosody:stable -o "$CacheDir\docker-images\jitsi-prosody.tar"
docker save prom/prometheus:latest -o "$CacheDir\docker-images\prometheus.tar"
docker save grafana/grafana:latest -o "$CacheDir\docker-images\grafana.tar"
docker save nginx:alpine -o "$CacheDir\docker-images\nginx-alpine.tar"

Write-Host "✓ Docker images saved" -ForegroundColor Green

# ===========================================================================
# GENERATE OFFLINE INSTALL SCRIPT
# ===========================================================================
$InstallScript = @'
# ===========================================================================
# Offline Installation Script (PowerShell)
# ===========================================================================
# Use this script to install all dependencies without internet connection
# ===========================================================================

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$CacheDir = Join-Path $ProjectRoot "offline-cache"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installing from offline cache..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Load Docker images
Write-Host ""
Write-Host "[1/2] Loading Docker images..." -ForegroundColor Yellow
Write-Host "----------------------------------------"
Get-ChildItem "$CacheDir\docker-images\*.tar" | ForEach-Object {
    Write-Host "- Loading $($_.Name)..."
    docker load -i $_.FullName
}

# Install npm packages
Write-Host ""
Write-Host "[2/2] Installing NPM packages..." -ForegroundColor Yellow
Write-Host "----------------------------------------"
Set-Location "$ProjectRoot\client"
npm ci --cache "$CacheDir\npm" --prefer-offline --no-audit

Set-Location "$ProjectRoot\backend"
npm ci --cache "$CacheDir\npm" --prefer-offline --no-audit

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ Offline installation complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
'@

Set-Content -Path "$ProjectRoot\install-offline.ps1" -Value $InstallScript

# ===========================================================================
# SUMMARY
# ===========================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ Offline cache setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Cache location: $CacheDir"
$CacheSize = (Get-ChildItem $CacheDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB
Write-Host "Cache size: $([math]::Round($CacheSize, 2)) GB"
Write-Host ""
Write-Host "To install offline, run:"
Write-Host "  .\install-offline.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now copy the entire project folder"
Write-Host "to an offline machine and run the install script."
Write-Host "========================================"
