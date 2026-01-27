# Multi-stage Dockerfile for Sustainable Classroom LMS

# ============================================================
# Stage 1: Build Frontend
# ============================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app/client

# Copy client dependencies
COPY client/package*.json ./

# Install dependencies
RUN npm ci

# Copy client source
COPY client/ .

# Set API URL to empty for same-origin API calls in production
ENV VITE_API_URL=""

# Build the frontend
RUN npm run build

# ============================================================
# Stage 2: Build Backend + Runtime
# ============================================================
FROM node:18-alpine

WORKDIR /app/backend

# Install build dependencies for bcrypt and other native modules
RUN apk add --no-cache \
    postgresql-client \
    curl \
    python3 \
    make \
    g++

# Copy backend dependencies
COPY backend/package*.json ./

# Install backend dependencies (with bcrypt build dependencies)
RUN npm ci --only=production --build-from-source

# Copy backend source files
COPY backend/server.js .
COPY backend/notificationService.js .

# Create public directory for serving frontend
RUN mkdir -p /app/backend/public

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/client/dist /app/backend/public

# Expose ports
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Default environment variables (override with docker run -e)
ENV NODE_ENV=production
ENV PORT=5000

# Start backend server
CMD ["node", "server.js"]
