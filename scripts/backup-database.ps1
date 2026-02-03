# ===========================================================================
# PostgreSQL Automated Backup Script (PowerShell)
# ===========================================================================
# Backs up the database with rotation policy
# ===========================================================================

$ErrorActionPreference = "Stop"

# Configuration
$BackupDir = ".\backups\database"
$ContainerName = "lms-database"
$DbName = "sustainable_classroom"
$DbUser = "lms_admin"
$RetentionDays = 30
$MaxBackups = 10

# Create backup directory
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Generate backup filename with timestamp
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "backup_$Timestamp.sql"
$BackupCompressed = "$BackupFile.gz"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PostgreSQL Backup Starting..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Database: $DbName"
Write-Host "Container: $ContainerName"
Write-Host "Time: $(Get-Date)"
Write-Host ""

# Check if container is running
$ContainerRunning = docker ps --format "{{.Names}}" | Select-String -Pattern $ContainerName
if (-not $ContainerRunning) {
    Write-Host "ERROR: Container $ContainerName is not running!" -ForegroundColor Red
    exit 1
}

# Perform backup
Write-Host "Creating backup..."
docker exec -t $ContainerName pg_dump -U $DbUser -d $DbName `
    --clean `
    --if-exists `
    --create `
    --verbose | Out-File -FilePath $BackupFile -Encoding utf8

# Compress backup using .NET
Write-Host "Compressing backup..."
$FileStream = New-Object System.IO.FileStream($BackupCompressed, [System.IO.FileMode]::Create)
$GzipStream = New-Object System.IO.Compression.GZipStream($FileStream, [System.IO.Compression.CompressionMode]::Compress)
$SourceStream = [System.IO.File]::OpenRead($BackupFile)
$SourceStream.CopyTo($GzipStream)
$SourceStream.Close()
$GzipStream.Close()
$FileStream.Close()

# Remove uncompressed file
Remove-Item $BackupFile

# Calculate backup size
$BackupSize = (Get-Item $BackupCompressed).Length / 1MB
Write-Host "✓ Backup created: $(Split-Path $BackupCompressed -Leaf) ($([math]::Round($BackupSize, 2)) MB)" -ForegroundColor Green

# Remove old backups (keep last MAX_BACKUPS)
Write-Host ""
Write-Host "Cleaning old backups..."
$AllBackups = Get-ChildItem "$BackupDir\backup_*.sql.gz" | Sort-Object LastWriteTime -Descending
$BackupCount = $AllBackups.Count

if ($BackupCount -gt $MaxBackups) {
    $ToDelete = $BackupCount - $MaxBackups
    $AllBackups | Select-Object -Last $ToDelete | Remove-Item -Force
    Write-Host "✓ Removed $ToDelete old backup(s)" -ForegroundColor Green
} else {
    Write-Host "✓ No old backups to remove ($BackupCount/$MaxBackups)" -ForegroundColor Green
}

# Remove backups older than RETENTION_DAYS
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem "$BackupDir\backup_*.sql.gz" | Where-Object { $_.LastWriteTime -lt $CutoffDate } | Remove-Item -Force
Write-Host "✓ Removed backups older than $RetentionDays days" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ Backup completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Latest backup: $BackupCompressed"
Write-Host "Total backups: $((Get-ChildItem "$BackupDir\backup_*.sql.gz").Count)"
Write-Host ""
