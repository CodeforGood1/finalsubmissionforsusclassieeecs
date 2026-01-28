# ============================================================
# Sustainable Classroom - Automated Backup Script
# ============================================================
# Run manually or schedule with Windows Task Scheduler
# Recommended: Daily at 2:00 AM
# ============================================================

param(
    [string]$BackupDir = "E:\classroom-backups",
    [int]$RetentionDays = 7
)

$ErrorActionPreference = "Stop"
$Date = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Sustainable Classroom Backup - $Date" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Create backup directory if it doesn't exist
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Host "[CREATE] Backup directory: $BackupDir" -ForegroundColor Green
}

# Create subdirectories
$DbBackupDir = Join-Path $BackupDir "database"
$UploadsBackupDir = Join-Path $BackupDir "uploads"
New-Item -ItemType Directory -Path $DbBackupDir -Force | Out-Null
New-Item -ItemType Directory -Path $UploadsBackupDir -Force | Out-Null

# Backup PostgreSQL database
Write-Host "`n[DATABASE] Backing up PostgreSQL..." -ForegroundColor Yellow
$DbBackupFile = Join-Path $DbBackupDir "sustainable_classroom_$Date.sql"
try {
    docker exec lms-database pg_dump -U lms_admin sustainable_classroom > $DbBackupFile
    $DbSize = (Get-Item $DbBackupFile).Length / 1MB
    Write-Host "[SUCCESS] Database backup: $([math]::Round($DbSize, 2)) MB" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Database backup failed: $_" -ForegroundColor Red
}

# Compress database backup
Write-Host "[COMPRESS] Compressing database backup..." -ForegroundColor Yellow
$DbCompressedFile = "$DbBackupFile.gz"
try {
    # Use PowerShell compression
    $content = Get-Content $DbBackupFile -Raw
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    $ms = New-Object System.IO.MemoryStream
    $gzip = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Compress)
    $gzip.Write($bytes, 0, $bytes.Length)
    $gzip.Close()
    [System.IO.File]::WriteAllBytes($DbCompressedFile, $ms.ToArray())
    $ms.Close()
    
    # Remove uncompressed file
    Remove-Item $DbBackupFile -Force
    $CompressedSize = (Get-Item $DbCompressedFile).Length / 1MB
    Write-Host "[SUCCESS] Compressed to: $([math]::Round($CompressedSize, 2)) MB" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Compression failed, keeping uncompressed backup" -ForegroundColor Yellow
}

# Backup uploads folder
Write-Host "`n[UPLOADS] Backing up uploaded files..." -ForegroundColor Yellow
$ScriptDir = Split-Path -Parent $PSScriptRoot
$UploadsSource = Join-Path $ScriptDir "backend\uploads"
$UploadsBackupDest = Join-Path $UploadsBackupDir "uploads_$Date"

if (Test-Path $UploadsSource) {
    try {
        Copy-Item -Path $UploadsSource -Destination $UploadsBackupDest -Recurse -Force
        $UploadFiles = (Get-ChildItem $UploadsBackupDest -Recurse -File).Count
        Write-Host "[SUCCESS] Uploads backup: $UploadFiles files" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Uploads backup failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "[SKIP] No uploads folder found" -ForegroundColor Yellow
}

# Clean up old backups (retention policy)
Write-Host "`n[CLEANUP] Removing backups older than $RetentionDays days..." -ForegroundColor Yellow
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)

# Clean old database backups
Get-ChildItem $DbBackupDir -File | Where-Object { $_.CreationTime -lt $CutoffDate } | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "[DELETE] Old backup: $($_.Name)" -ForegroundColor DarkGray
}

# Clean old upload backups
Get-ChildItem $UploadsBackupDir -Directory | Where-Object { $_.CreationTime -lt $CutoffDate } | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
    Write-Host "[DELETE] Old uploads: $($_.Name)" -ForegroundColor DarkGray
}

# Summary
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "Backup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Location: $BackupDir"
Write-Host "Date: $Date"

# Calculate total backup size
$TotalSize = (Get-ChildItem $BackupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1GB
Write-Host "Total Backup Size: $([math]::Round($TotalSize, 2)) GB"
Write-Host ""

# To schedule this backup, run (as Administrator):
# $Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File E:\susclassroom\refine\scripts\backup.ps1"
# $Trigger = New-ScheduledTaskTrigger -Daily -At 2am
# Register-ScheduledTask -TaskName "SustainableClassroomBackup" -Action $Action -Trigger $Trigger -RunLevel Highest
