# ===========================================================================
# Database Restore Script (PowerShell)
# ===========================================================================
# Restores database from backup file
# ===========================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

$BackupDir = ".\backups\database"
$ContainerName = "lms-database"
$DbName = "sustainable_classroom"
$DbUser = "lms_admin"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PostgreSQL Database Restore" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# If no backup file specified, list available backups
if (-not $BackupFile) {
    Write-Host "Available backups:" -ForegroundColor Yellow
    Write-Host ""
    
    $Backups = Get-ChildItem "$BackupDir\backup_*.sql.gz" | Sort-Object LastWriteTime -Descending
    
    if ($Backups.Count -eq 0) {
        Write-Host "No backups found in $BackupDir" -ForegroundColor Red
        exit 1
    }
    
    for ($i = 0; $i -lt $Backups.Count; $i++) {
        $Backup = $Backups[$i]
        $Size = [math]::Round($Backup.Length / 1MB, 2)
        Write-Host "[$($i+1)] $($Backup.Name) - $Size MB - $($Backup.LastWriteTime)"
    }
    
    Write-Host ""
    $Selection = Read-Host "Enter number to restore (or 'q' to quit)"
    
    if ($Selection -eq 'q') {
        exit 0
    }
    
    $Index = [int]$Selection - 1
    if ($Index -lt 0 -or $Index -ge $Backups.Count) {
        Write-Host "Invalid selection!" -ForegroundColor Red
        exit 1
    }
    
    $BackupFile = $Backups[$Index].FullName
}

if (-not (Test-Path $BackupFile)) {
    Write-Host "ERROR: Backup file not found: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Restoring from: $(Split-Path $BackupFile -Leaf)" -ForegroundColor Yellow
Write-Host ""
Write-Host "WARNING: This will replace ALL data in the database!" -ForegroundColor Red
$Confirm = Read-Host "Type 'YES' to continue"

if ($Confirm -ne 'YES') {
    Write-Host "Restore cancelled." -ForegroundColor Yellow
    exit 0
}

# Check if container is running
$ContainerRunning = docker ps --format "{{.Names}}" | Select-String -Pattern $ContainerName
if (-not $ContainerRunning) {
    Write-Host "ERROR: Container $ContainerName is not running!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Decompressing backup..."

# Decompress
$TempFile = [System.IO.Path]::GetTempFileName()
$FileStream = New-Object System.IO.FileStream($BackupFile, [System.IO.FileMode]::Open)
$GzipStream = New-Object System.IO.Compression.GZipStream($FileStream, [System.IO.Compression.CompressionMode]::Decompress)
$OutStream = [System.IO.File]::OpenWrite($TempFile)
$GzipStream.CopyTo($OutStream)
$OutStream.Close()
$GzipStream.Close()
$FileStream.Close()

Write-Host "Restoring database..."
Get-Content $TempFile | docker exec -i $ContainerName psql -U $DbUser -d postgres

# Clean up temp file
Remove-Item $TempFile

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ Database restored successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
