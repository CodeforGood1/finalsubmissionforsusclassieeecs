# Multi-stage Dockerfile for Sustainable Classroom LMS

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./

RUN npm ci

COPY client/ .

ENV VITE_API_URL=""

RUN npm run build

# Stage 2: Build Backend + Runtime
FROM node:20-alpine

WORKDIR /app/backend

# Install PostgreSQL client, curl, and language runtimes for code execution
RUN apk add --no-cache \
    postgresql-client \
    curl \
    python3 \
    py3-pip \
    openjdk17 \
    g++ \
    make

COPY backend/package*.json ./

# bcryptjs is pure JavaScript, no native compilation needed
RUN npm ci --omit=dev

# Copy all backend source files
COPY backend/*.js ./

RUN mkdir -p /app/backend/public

COPY --from=frontend-builder /app/client/dist /app/backend/public

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "server.js"]
