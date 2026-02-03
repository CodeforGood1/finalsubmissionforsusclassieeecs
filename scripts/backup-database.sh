#!/bin/bash
# ===========================================================================
# PostgreSQL Automated Backup Script
# ===========================================================================
# Backs up the database with rotation policy
# ===========================================================================

set -e

# Configuration
BACKUP_DIR="./backups/database"
CONTAINER_NAME="lms-database"
DB_NAME="sustainable_classroom"
DB_USER="lms_admin"
RETENTION_DAYS=30
MAX_BACKUPS=10

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql"
BACKUP_COMPRESSED="$BACKUP_FILE.gz"

echo "========================================"
echo "PostgreSQL Backup Starting..."
echo "========================================"
echo "Database: $DB_NAME"
echo "Container: $CONTAINER_NAME"
echo "Time: $(date)"
echo ""

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "ERROR: Container $CONTAINER_NAME is not running!"
    exit 1
fi

# Perform backup
echo "Creating backup..."
docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --clean \
    --if-exists \
    --create \
    --verbose > "$BACKUP_FILE" 2>&1

# Compress backup
echo "Compressing backup..."
gzip "$BACKUP_FILE"

# Calculate backup size
BACKUP_SIZE=$(du -h "$BACKUP_COMPRESSED" | cut -f1)
echo "✓ Backup created: $(basename $BACKUP_COMPRESSED) ($BACKUP_SIZE)"

# Remove old backups (keep last MAX_BACKUPS)
echo ""
echo "Cleaning old backups..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    TO_DELETE=$((BACKUP_COUNT - MAX_BACKUPS))
    ls -1t "$BACKUP_DIR"/backup_*.sql.gz | tail -n "$TO_DELETE" | xargs rm -f
    echo "✓ Removed $TO_DELETE old backup(s)"
else
    echo "✓ No old backups to remove (${BACKUP_COUNT}/${MAX_BACKUPS})"
fi

# Remove backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
echo "✓ Removed backups older than $RETENTION_DAYS days"

echo ""
echo "========================================"
echo "✓ Backup completed successfully!"
echo "========================================"
echo "Latest backup: $BACKUP_COMPRESSED"
echo "Total backups: $(ls -1 $BACKUP_DIR/backup_*.sql.gz 2>/dev/null | wc -l)"
echo ""
