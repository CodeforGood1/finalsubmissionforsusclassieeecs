#!/bin/bash

# ============================================================
# NOTIFICATION SYSTEM - DATABASE SETUP SCRIPT
# ============================================================
# This script sets up the notification system database schema
# ============================================================

echo "======================================"
echo "🔔 Notification System Setup"
echo "======================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo ""
    echo "Please set it first:"
    echo "  export DATABASE_URL='your-postgres-connection-string'"
    echo ""
    exit 1
fi

echo "✓ DATABASE_URL found"
echo ""

# Check if SQL file exists
if [ ! -f "backend/notification-system.sql" ]; then
    echo "❌ ERROR: backend/notification-system.sql not found"
    echo "Make sure you're running this from the project root directory"
    exit 1
fi

echo "✓ SQL file found"
echo ""

# Run the SQL file
echo "Running database migration..."
echo ""

psql "$DATABASE_URL" -f backend/notification-system.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "✅ SUCCESS!"
    echo "======================================"
    echo ""
    echo "Notification system database setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Configure SMTP in backend/.env"
    echo "  2. Restart your server: cd backend && npm run dev"
    echo "  3. Test notifications"
    echo ""
    echo "See NOTIFICATION-SYSTEM-GUIDE.md for details"
    echo ""
else
    echo ""
    echo "======================================"
    echo "❌ FAILED"
    echo "======================================"
    echo ""
    echo "Database migration failed. Check errors above."
    echo ""
    exit 1
fi
