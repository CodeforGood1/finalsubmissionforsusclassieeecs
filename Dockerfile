# Multi-stage Dockerfile for Sustainable Classroom LMS

# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./

RUN npm ci

COPY client/ .

ENV VITE_API_URL=""

RUN npm run build

# Stage 2: Build Backend + Runtime
FROM node:18-alpine

WORKDIR /app/backend

RUN apk add --no-cache \
    postgresql-client \
    curl \
    python3 \
    make \
    g++

COPY backend/package*.json ./

RUN npm ci --only=production --build-from-source

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
