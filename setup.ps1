param(
    [ValidateSet("local", "full", "prod")]
    [string]$Stack = "local",
    [switch]$Reset,
    [switch]$StartApp,
    [switch]$SkipPortCheck
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function New-Secret([int]$Length = 32) {
    $bytes = New-Object byte[] $Length
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "A").Replace("/", "B")
}

function Set-EnvValue([string]$Path, [string]$Name, [string]$Value) {
    $escaped = [regex]::Escape($Name)
    $lines = @(Get-Content -LiteralPath $Path)

    if ($lines -match "^$escaped=") {
        $lines = $lines | ForEach-Object {
            if ($_ -match "^$escaped=") {
                "$Name=$Value"
            } else {
                $_
            }
        }
    } else {
        $lines += "$Name=$Value"
    }

    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Get-EnvValue([string]$Path, [string]$Name) {
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
    if (-not $line) { return "" }
    return ($line -split "=", 2)[1]
}

function Get-EnvValueOrDefault([string]$Path, [string]$Name, [string]$Default) {
    $value = Get-EnvValue $Path $Name
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value
}

function Get-PortOwner([int]$Port) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) { return $null }
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    return [pscustomobject]@{
        Port = $Port
        ProcessId = $connection.OwningProcess
        ProcessName = if ($process) { $process.ProcessName } else { "unknown" }
    }
}

function Assert-PortsAvailable([int[]]$Ports) {
    if ($SkipPortCheck) { return }
    $busy = @()
    foreach ($port in ($Ports | Sort-Object -Unique)) {
        $owner = Get-PortOwner $port
        if ($owner) { $busy += $owner }
    }

    if ($busy.Count -eq 0) { return }

    Write-Host ""
    Write-Host "[setup] One or more required ports are already in use:" -ForegroundColor Yellow
    foreach ($item in $busy) {
        Write-Host "  Port $($item.Port): $($item.ProcessName) (PID $($item.ProcessId))" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Non-technical fix:"
    Write-Host "  1. Close the app using the port, or restart Docker Desktop."
    Write-Host "  2. If you cannot close it, edit .env and change the matching HOST_*_PORT value."
    Write-Host "     Example: HOST_POSTGRES_PORT=15432"
    Write-Host "  3. If HOST_POSTGRES_PORT changes, also update DATABASE_URL to use that port."
    Write-Host "  4. Run setup again."
    throw "Port check failed. Free the listed ports or change the HOST_*_PORT values in .env."
}

function Invoke-Compose([string[]]$ComposeCommand) {
    & docker compose @ComposeCommand
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeCommand -join ' ') failed with exit code $LASTEXITCODE"
    }
}

$composeFile = switch ($Stack) {
    "local" { "docker-compose.local.yml" }
    "full" { "docker-compose.yml" }
    "prod" { "docker-compose.prod.yml" }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed or is not available on PATH."
}

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose is not available. Install Docker Desktop or Docker Compose v2."
}

$envPath = Join-Path $Root ".env"
$examplePath = Join-Path $Root ".env.example"

if (-not (Test-Path -LiteralPath $envPath)) {
    if (-not (Test-Path -LiteralPath $examplePath)) {
        throw ".env.example was not found."
    }

    Copy-Item -LiteralPath $examplePath -Destination $envPath

    $dbUser = if ($Stack -eq "local") { "lms_user" } else { "lms_admin" }
    $dbName = if ($Stack -eq "local") { "lms_db" } else { "sustainable_classroom" }
    $dbPassword = New-Secret 24

    Set-EnvValue $envPath "DB_USER" $dbUser
    Set-EnvValue $envPath "DB_PASSWORD" $dbPassword
    Set-EnvValue $envPath "DB_NAME" $dbName
    Set-EnvValue $envPath "ADMIN_PASSWORD" (New-Secret 18)
    Set-EnvValue $envPath "JWT_SECRET" (New-Secret 48)
    Set-EnvValue $envPath "JICOFO_AUTH_PASSWORD" (New-Secret 24)
    Set-EnvValue $envPath "JICOFO_COMPONENT_SECRET" (New-Secret 24)
    Set-EnvValue $envPath "JVB_AUTH_PASSWORD" (New-Secret 24)
    Set-EnvValue $envPath "HOST_POSTGRES_PORT" "5432"
    Set-EnvValue $envPath "DATABASE_URL" "postgresql://${dbUser}:${dbPassword}@localhost:5432/${dbName}"

    Write-Host "[setup] Created .env with generated local secrets."
} else {
    Write-Host "[setup] Using existing .env."
}

if ($Reset) {
    Write-Host "[setup] Resetting database volume for $composeFile..."
    Invoke-Compose @("-f", $composeFile, "down", "-v", "--remove-orphans")
}

$requiredPorts = @()
if ($Stack -eq "local") {
    $requiredPorts += [int](Get-EnvValueOrDefault $envPath "HOST_POSTGRES_PORT" "5432")
}
if ($StartApp) {
    if ($Stack -in @("full", "prod")) {
        $requiredPorts += @(
            [int](Get-EnvValueOrDefault $envPath "HOST_HTTP_PORT" "80"),
            [int](Get-EnvValueOrDefault $envPath "HOST_BACKEND_PORT" "5000")
        )
    } else {
        $requiredPorts += [int](Get-EnvValueOrDefault $envPath "HOST_SMTP_PORT" "1025")
    }
    $requiredPorts += @(
        [int](Get-EnvValueOrDefault $envPath "HOST_MAILHOG_WEB_PORT" "8025"),
        [int](Get-EnvValueOrDefault $envPath "HOST_JITSI_HTTPS_PORT" "8443"),
        [int](Get-EnvValueOrDefault $envPath "HOST_JITSI_COLIBRI_PORT" "4443")
    )
}
Assert-PortsAvailable $requiredPorts

$services = if ($StartApp) { @() } else { @("postgres") }
$upArgs = @("-f", $composeFile, "up", "-d") + $services
Write-Host "[setup] Starting $Stack stack database..."
Invoke-Compose $upArgs

$dbUser = if ($Stack -eq "local") { Get-EnvValue $envPath "DB_USER" } else { "lms_admin" }
$dbName = if ($Stack -eq "local") { Get-EnvValue $envPath "DB_NAME" } else { "sustainable_classroom" }
$container = if ($Stack -eq "local") { "lms-db" } else { "lms-database" }

Write-Host "[setup] Waiting for PostgreSQL to become ready..."
$ready = $false
for ($i = 1; $i -le 60; $i++) {
    & docker exec $container pg_isready -U $dbUser -d $dbName *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    throw "PostgreSQL did not become ready. Run: docker compose -f $composeFile logs postgres"
}

Write-Host "[setup] Database is ready. Docker automatically applied:"
Write-Host "        backend/FRESH-COMPLETE-DATABASE.sql"
Write-Host "        backend/notification-system.sql"
Write-Host ""
Write-Host "Connection:"
Write-Host "  docker exec -it $container psql -U $dbUser -d $dbName"
Write-Host ""
Write-Host "Admin login:"
Write-Host "  Email:    $(Get-EnvValue $envPath 'ADMIN_EMAIL')"
Write-Host "  Password: $(Get-EnvValue $envPath 'ADMIN_PASSWORD')"

if (-not $StartApp) {
    Write-Host ""
    Write-Host "Start the app later with:"
    Write-Host "  docker compose -f $composeFile up -d"
}
