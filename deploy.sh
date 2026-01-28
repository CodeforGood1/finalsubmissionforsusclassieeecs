#!/bin/bash

# ============================================================
# SUSTAINABLE CLASSROOM - ONE-COMMAND DEPLOYMENT SCRIPT
# ============================================================
# Africa Sustainable Classroom Challenge - Finals Edition
# Automated deployment for On-Premise Student Learning System
# ============================================================

set -e  # Exit on any error

echo "🎓 ======================================"
echo "   SUSTAINABLE CLASSROOM DEPLOYMENT"
echo "   Africa Challenge - On-Premise Setup"
echo "======================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker not found! Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
print_success "Docker installed"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose not found! Please install Docker Compose."
    exit 1
fi
print_success "Docker Compose installed"

# Check if .env exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        print_info "Created .env from template. Please edit with your values."
        print_info "Minimum required: DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD"
        echo ""
        read -p "Press Enter after editing .env file (or Ctrl+C to exit)..."
    else
        print_error ".env.example not found!"
        exit 1
    fi
else
    print_success ".env file exists"
fi

echo ""
echo "🐳 Starting Docker deployment..."
echo ""

# Stop any existing containers
print_info "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Pull latest images
print_info "Pulling Docker images..."
docker-compose pull

# Build the application
print_info "Building application..."
docker-compose build

# Start services
print_info "Starting services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
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
    echo "📋 Checking logs..."
    docker-compose logs postgres | tail -20
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
    echo "📋 Checking backend logs..."
    docker-compose logs backend | tail -30
    exit 1
fi

echo ""
print_success "Backend API is ready"

echo ""
echo "🎉 ======================================"
echo "   DEPLOYMENT SUCCESSFUL!"
echo "======================================"
echo ""
print_success "All services are running!"
echo ""
echo "📍 Access Points:"
echo "   • Application: http://localhost:5000"
echo "   • MailHog (Email): http://localhost:8025"
echo "   • Database: localhost:5432"
echo ""
echo "🔑 Default Credentials:"
echo "   • Admin: admin@classroom.local / Admin@2026"
echo "   • Teacher: susclass.global+sarah.teacher@gmail.com / password123"
echo "   • Student: susclass.global+amara@gmail.com / student123"
echo ""
echo "📚 Quick Commands:"
echo "   • View logs: docker-compose logs -f"
echo "   • Stop: docker-compose down"
echo "   • Restart: docker-compose restart"
echo "   • Status: docker-compose ps"
echo ""
print_warning "⚠️  SECURITY REMINDER:"
echo "   Change default passwords immediately!"
echo "   Edit JWT_SECRET in .env for production!"
echo ""
echo "📖 For more info, see README.md and DEPLOYMENT.md"
echo ""

# Optional: Run verification tests
read -p "Run automated verification tests? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🧪 Running verification tests..."
    
    # Test health endpoint
    if curl -s http://localhost:5000/api/health | grep -q "ok"; then
        print_success "Health check passed"
    else
        print_error "Health check failed"
    fi
    
    # Test admin login
    RESPONSE=$(curl -s -X POST http://localhost:5000/api/admin/login \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@classroom.local","password":"Admin@2026"}')
    
    if echo "$RESPONSE" | grep -q "token"; then
        print_success "Admin login works"
    else
        print_error "Admin login failed"
    fi
    
    echo ""
    print_success "Basic verification complete!"
fi

echo ""
echo "✅ Setup complete! Happy teaching and learning! 🎓"
echo ""
