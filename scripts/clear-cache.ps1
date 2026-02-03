# Clear C: Drive Cache - Windows
# Run as Administrator if needed

Write-Host "=== Cache Cleanup Script ===" -ForegroundColor Cyan
Write-Host ""

# Function to get folder size
function Get-FolderSize {
    param($Path)
    if (Test-Path $Path) {
        $size = (Get-ChildItem $Path -Recurse -Force -ErrorAction SilentlyContinue | 
                 Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        return [math]::Round($size / 1MB, 2)
    }
    return 0
}

$totalFreed = 0

# 1. Docker Cache
Write-Host "1. Docker Cache" -ForegroundColor Yellow
try {
    $dockerRunning = docker info 2>&1 | Select-String "Server Version"
    if ($dockerRunning) {
        Write-Host "   Pruning Docker build cache..."
        docker builder prune -f
        Write-Host "   Removing unused images..."
        docker image prune -a -f
        Write-Host "   Removing unused volumes..."
        docker volume prune -f
        Write-Host "   ✓ Docker cache cleared" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Docker not running (start Docker Desktop to clean)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠ Docker not available" -ForegroundColor Yellow
}
Write-Host ""

# 2. npm Cache
Write-Host "2. npm Cache" -ForegroundColor Yellow
$npmCachePath = "$env:LOCALAPPDATA\npm-cache"
$beforeNpm = Get-FolderSize $npmCachePath
try {
    npm cache clean --force 2>&1 | Out-Null
    $afterNpm = Get-FolderSize $npmCachePath
    $freedNpm = $beforeNpm - $afterNpm
    $totalFreed += $freedNpm
    Write-Host "   ✓ Freed ${freedNpm}MB from npm cache" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ npm not available" -ForegroundColor Yellow
}
Write-Host ""

# 3. pip Cache
Write-Host "3. pip Cache" -ForegroundColor Yellow
$pipCachePath = "$env:LOCALAPPDATA\pip\Cache"
$beforePip = Get-FolderSize $pipCachePath
try {
    pip cache purge 2>&1 | Out-Null
    $afterPip = Get-FolderSize $pipCachePath
    $freedPip = $beforePip - $afterPip
    $totalFreed += $freedPip
    Write-Host "   ✓ Freed ${freedPip}MB from pip cache" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ pip not available" -ForegroundColor Yellow
}
Write-Host ""

# 4. Windows Temp Files
Write-Host "4. Windows Temp Files" -ForegroundColor Yellow
$tempPaths = @(
    "$env:TEMP",
    "C:\Windows\Temp",
    "$env:LOCALAPPDATA\Temp"
)

foreach ($tempPath in $tempPaths) {
    if (Test-Path $tempPath) {
        $beforeTemp = Get-FolderSize $tempPath
        Get-ChildItem $tempPath -Recurse -Force -ErrorAction SilentlyContinue | 
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
            Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        $afterTemp = Get-FolderSize $tempPath
        $freedTemp = $beforeTemp - $afterTemp
        if ($freedTemp -gt 0) {
            Write-Host "   ✓ Freed ${freedTemp}MB from $tempPath" -ForegroundColor Green
            $totalFreed += $freedTemp
        }
    }
}
Write-Host ""

# 5. Browser Cache (Optional - commented out by default)
# Uncomment to clear specific browser caches
<#
Write-Host "5. Browser Cache" -ForegroundColor Yellow
$chromeCachePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
if (Test-Path $chromeCachePath) {
    $beforeChrome = Get-FolderSize $chromeCachePath
    Remove-Item "$chromeCachePath\*" -Recurse -Force -ErrorAction SilentlyContinue
    $afterChrome = Get-FolderSize $chromeCachePath
    $freedChrome = $beforeChrome - $afterChrome
    Write-Host "   ✓ Freed ${freedChrome}MB from Chrome cache" -ForegroundColor Green
    $totalFreed += $freedChrome
}
Write-Host ""
#>

# 6. Vite Build Cache (Project-specific)
Write-Host "5. Vite Build Cache (Project)" -ForegroundColor Yellow
$viteCachePaths = @(
    ".\frontend\node_modules\.vite",
    ".\frontend\.vite",
    ".\frontend\dist"
)

foreach ($vitePath in $viteCachePaths) {
    if (Test-Path $vitePath) {
        $beforeVite = Get-FolderSize $vitePath
        Remove-Item $vitePath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   ✓ Removed $vitePath (${beforeVite}MB)" -ForegroundColor Green
        $totalFreed += $beforeVite
    }
}
Write-Host ""

# Summary
Write-Host "=== Cleanup Summary ===" -ForegroundColor Cyan
Write-Host "Total space freed: ${totalFreed}MB (~$([math]::Round($totalFreed / 1024, 2))GB)" -ForegroundColor Green
Write-Host ""
Write-Host "Tips:" -ForegroundColor Yellow
Write-Host "   - Restart Docker Desktop to apply changes"
Write-Host "   - Run 'docker system df' to check Docker disk usage"
Write-Host "   - Run 'docker system prune --all --volumes -f' for deep clean (removes everything)"
Write-Host ""
