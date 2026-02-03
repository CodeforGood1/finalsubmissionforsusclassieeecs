#!/bin/bash
# ===========================================================================
# Offline Package Cache Setup Script
# ===========================================================================
# This script downloads all npm and pip dependencies for offline installation
# Run this ONCE when you have internet, then you can work offline
# ===========================================================================

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CACHE_DIR="$PROJECT_ROOT/offline-cache"

echo "========================================"
echo "Setting up offline package cache..."
echo "========================================"

# Create cache directories
mkdir -p "$CACHE_DIR/npm"
mkdir -p "$CACHE_DIR/pip"
mkdir -p "$CACHE_DIR/docker-images"

# ===========================================================================
# NPM PACKAGES
# ===========================================================================
echo ""
echo "[1/3] Caching NPM packages..."
echo "----------------------------------------"

cd "$PROJECT_ROOT/client"
if [ -f "package.json" ]; then
    echo "- Downloading client dependencies..."
    npm cache add --cache "$CACHE_DIR/npm" $(cat package.json | jq -r '.dependencies | keys[]')
    npm cache add --cache "$CACHE_DIR/npm" $(cat package.json | jq -r '.devDependencies | keys[]')
    echo "✓ Client packages cached"
fi

cd "$PROJECT_ROOT/backend"
if [ -f "package.json" ]; then
    echo "- Downloading backend dependencies..."
    npm cache add --cache "$CACHE_DIR/npm" $(cat package.json | jq -r '.dependencies | keys[]')
    echo "✓ Backend packages cached"
fi

# ===========================================================================
# PYTHON PACKAGES (if any)
# ===========================================================================
echo ""
echo "[2/3] Caching Python packages..."
echo "----------------------------------------"

if [ -f "$PROJECT_ROOT/requirements.txt" ]; then
    echo "- Downloading Python dependencies..."
    pip download -r "$PROJECT_ROOT/requirements.txt" -d "$CACHE_DIR/pip"
    echo "✓ Python packages cached"
else
    echo "- No requirements.txt found, skipping..."
fi

# ===========================================================================
# DOCKER IMAGES
# ===========================================================================
echo ""
echo "[3/3] Saving Docker images..."
echo "----------------------------------------"

echo "- Pulling Docker images..."
docker-compose pull

echo "- Saving images to tar files..."
docker save postgres:15-alpine -o "$CACHE_DIR/docker-images/postgres-15-alpine.tar"
docker save redis:7-alpine -o "$CACHE_DIR/docker-images/redis-7-alpine.tar"
docker save mailhog/mailhog:latest -o "$CACHE_DIR/docker-images/mailhog.tar"
docker save jitsi/web:stable -o "$CACHE_DIR/docker-images/jitsi-web.tar"
docker save jitsi/jicofo:stable -o "$CACHE_DIR/docker-images/jitsi-jicofo.tar"
docker save jitsi/jvb:stable -o "$CACHE_DIR/docker-images/jitsi-jvb.tar"
docker save jitsi/prosody:stable -o "$CACHE_DIR/docker-images/jitsi-prosody.tar"
docker save prom/prometheus:latest -o "$CACHE_DIR/docker-images/prometheus.tar"
docker save grafana/grafana:latest -o "$CACHE_DIR/docker-images/grafana.tar"
docker save nginx:alpine -o "$CACHE_DIR/docker-images/nginx-alpine.tar"

echo "✓ Docker images saved"

# ===========================================================================
# GENERATE OFFLINE INSTALL SCRIPT
# ===========================================================================
cat > "$PROJECT_ROOT/install-offline.sh" << 'EOF'
#!/bin/bash
# ===========================================================================
# Offline Installation Script
# ===========================================================================
# Use this script to install all dependencies without internet connection
# ===========================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="$SCRIPT_DIR/offline-cache"

echo "========================================"
echo "Installing from offline cache..."
echo "========================================"

# Load Docker images
echo ""
echo "[1/3] Loading Docker images..."
echo "----------------------------------------"
for img in "$CACHE_DIR/docker-images"/*.tar; do
    if [ -f "$img" ]; then
        echo "- Loading $(basename $img)..."
        docker load -i "$img"
    fi
done

# Install npm packages
echo ""
echo "[2/3] Installing NPM packages..."
echo "----------------------------------------"
cd "$SCRIPT_DIR/client"
npm ci --cache "$CACHE_DIR/npm" --prefer-offline --no-audit

cd "$SCRIPT_DIR/backend"
npm ci --cache "$CACHE_DIR/npm" --prefer-offline --no-audit

# Install pip packages
echo ""
echo "[3/3] Installing Python packages..."
echo "----------------------------------------"
if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    pip install --no-index --find-links="$CACHE_DIR/pip" -r "$SCRIPT_DIR/requirements.txt"
fi

echo ""
echo "========================================"
echo "✓ Offline installation complete!"
echo "========================================"
EOF

chmod +x "$PROJECT_ROOT/install-offline.sh"

# ===========================================================================
# SUMMARY
# ===========================================================================
echo ""
echo "========================================"
echo "✓ Offline cache setup complete!"
echo "========================================"
echo ""
echo "Cache location: $CACHE_DIR"
echo "Cache size: $(du -sh $CACHE_DIR | cut -f1)"
echo ""
echo "To install offline, run:"
echo "  ./install-offline.sh"
echo ""
echo "You can now copy the entire project folder"
echo "to an offline machine and run the install script."
echo "========================================"
