#!/bin/bash

# ============================================================
# SUSTAINABLE CLASSROOM - ONE-COMMAND DEPLOYMENT SCRIPT
# ============================================================
# Usage: ./deploy.sh [dev|prod]
#   dev  - Builds images locally (default)
#   prod - Uses pre-built images from GitHub Container Registry
# ============================================================

set -e  # Exit on any error

MODE="${1:-dev}"

echo "============================================================"
echo "   SUSTAINABLE CLASSROOM DEPLOYMENT"
echo "   Mode: $MODE"
echo "============================================================"
echo ""

# Function to print messages
print_success() { echo "[SUCCESS] $1"; }
print_error() { echo "[ERROR] $1"; }
print_info() { echo "[INFO] $1"; }
print_warning() { echo "[WARNING] $1"; }

# Check prerequisites
echo "[INFO] Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker not found. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
print_success "Docker installed"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose not found. Please install Docker Compose."
    exit 1
fi
print_success "Docker Compose installed"

# Use docker compose (v2) if available, otherwise docker-compose (v1)
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Check if .env exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        print_info "Created .env from template. Please edit with your values."
    else
        # Create default .env
        cat > .env << EOF
# Database
DB_PASSWORD=SecureLocalDB2026

# Authentication
JWT_SECRET=OnPremiseSecureKey2026AfricaChallenge
ADMIN_EMAIL=admin@classroom.local
ADMIN_PASSWORD=Admin@2026

# Email Configuration
# For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=true
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

# Production Settings (for prod mode)
GITHUB_REPOSITORY=susclass/sustainable-classroom
IMAGE_TAG=latest
EOF
        print_info "Created default .env file."
    fi
else
    print_success ".env file exists"
fi

echo ""
echo "[INFO] Starting Docker deployment..."
echo ""

# Stop any existing containers
print_info "Stopping existing containers..."
$COMPOSE_CMD down 2>/dev/null || true

if [ "$MODE" = "prod" ]; then
    print_info "Production mode - using pre-built images from GHCR..."
    COMPOSE_FILE="docker-compose.prod.yml"
    
    # Pull pre-built images
    print_info "Pulling Docker images..."
    $COMPOSE_CMD -f $COMPOSE_FILE pull
else
    print_info "Development mode - building locally..."
    COMPOSE_FILE="docker-compose.yml"
    
    # Pull base images
    print_info "Pulling Docker images..."
    $COMPOSE_CMD -f $COMPOSE_FILE pull || true
    
    # Build the application
    print_info "Building application..."
    $COMPOSE_CMD -f $COMPOSE_FILE build
fi

# Start services
print_info "Starting services..."
$COMPOSE_CMD -f $COMPOSE_FILE up -d

echo ""
echo "[INFO] Waiting for services to be healthy..."
echo ""

# Wait for database
MAX_WAIT=60
COUNTER=0
until docker exec lms-database pg_isready -U lms_admin -d sustainable_classroom &> /dev/null || [ $COUNTER -eq $MAX_WAIT ]; do
    printf "."
    sleep 2
    ((COUNTER++))
done

if [ $COUNTER -eq $MAX_WAIT ]; then
    echo ""
    print_error "Database failed to start within ${MAX_WAIT} seconds"
    echo ""
    echo "[INFO] Checking logs..."
    $COMPOSE_CMD -f $COMPOSE_FILE logs postgres | tail -20
    exit 1
fi

echo ""
print_success "Database is ready"

# Wait for Redis
COUNTER=0
until docker exec lms-cache redis-cli ping &> /dev/null || [ $COUNTER -eq 30 ]; do
    printf "."
    sleep 1
    ((COUNTER++))
done
echo ""
print_success "Redis cache is ready"

# Wait for backend
COUNTER=0
until curl -s http://localhost:5000/api/health &> /dev/null || [ $COUNTER -eq 60 ]; do
    printf "."
    sleep 2
    ((COUNTER++))
done

if [ $COUNTER -eq 60 ]; then
    echo ""
    print_error "Backend failed to start"
    echo ""
    echo "[INFO] Checking backend logs..."
    $COMPOSE_CMD -f $COMPOSE_FILE logs backend | tail -30
    exit 1
fi

echo ""
print_success "Backend API is ready"

echo ""
echo "============================================================"
echo "   DEPLOYMENT SUCCESSFUL"
echo "============================================================"
echo ""
print_success "All services are running"
echo ""
echo "Access Points:"
echo "   Application:     http://localhost:5000"
echo "   Email UI:        http://localhost:8025"
echo "   Jitsi Meet:      https://localhost:8443"
echo "   Database:        localhost:5432"
echo ""
echo "Default Credentials:"
echo "   Admin:   admin@classroom.local / Admin@2026"
echo ""
echo "Commands:"
echo "   View logs:   $COMPOSE_CMD -f $COMPOSE_FILE logs -f"
echo "   Stop:        $COMPOSE_CMD -f $COMPOSE_FILE down"
echo "   Restart:     $COMPOSE_CMD -f $COMPOSE_FILE restart"
echo "   Status:      $COMPOSE_CMD -f $COMPOSE_FILE ps"
echo ""
print_warning "SECURITY: Change default passwords for production use."
echo ""
echo "See README.md and DEPLOYMENT.md for more information."
echo ""
echo "[COMPLETE] Deployment finished successfully."
echo ""
