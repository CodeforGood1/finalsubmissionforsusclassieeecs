param(
    [ValidateSet("local", "full", "prod")]
    [string]$Stack = "local",
    [switch]$Reset,
    [switch]$StartApp
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
    Set-EnvValue $envPath "ADMIN_PASSWORD" "admin123"
    Set-EnvValue $envPath "JWT_SECRET" (New-Secret 48)
    Set-EnvValue $envPath "JICOFO_AUTH_PASSWORD" (New-Secret 24)
    Set-EnvValue $envPath "JICOFO_COMPONENT_SECRET" (New-Secret 24)
    Set-EnvValue $envPath "JVB_AUTH_PASSWORD" (New-Secret 24)
    Set-EnvValue $envPath "DATABASE_URL" "postgresql://${dbUser}:${dbPassword}@localhost:5432/${dbName}"

    Write-Host "[setup] Created .env with generated local secrets."
} else {
    Write-Host "[setup] Using existing .env."
}

if ($Reset) {
    Write-Host "[setup] Resetting database volume for $composeFile..."
    Invoke-Compose @("-f", $composeFile, "down", "-v", "--remove-orphans")
}

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
Write-Host "  Email:    $(Get-EnvValue $envPath "ADMIN_EMAIL")"
Write-Host "  Password: $(Get-EnvValue $envPath "ADMIN_PASSWORD")"

if (-not $StartApp) {
    Write-Host ""
    Write-Host "Start the app later with:"
    Write-Host "  docker compose -f $composeFile up -d"
}
