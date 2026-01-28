# Production Deployment Guide - 1000+ Users on LAN

## Architecture for Large-Scale Deployment

### Infrastructure Layout

```
E:\classroom-production\
├── config\
│   ├── kong\                 # API Gateway config
│   ├── traefik\              # Alternative API Gateway
│   └── k8s\                  # Kubernetes manifests
├── data\
│   ├── pgdata\               # PostgreSQL data (100GB+)
│   ├── redis\                # Redis persistence
│   └── uploads\              # User uploaded files (500GB+)
├── registry\
│   └── harbor\               # Private container registry
├── monitoring\
│   ├── prometheus\           # Metrics
│   ├── grafana\              # Dashboards
│   └── loki\                 # Logs
├── cache\
│   └── varnish\              # HTTP cache
└── backups\                  # Daily automated backups
```

## Step 1: System Requirements

### Hardware (for 1000 concurrent users)
- **CPU**: 16+ cores (Intel Xeon or AMD EPYC)
- **RAM**: 64GB minimum
- **Storage**: 
  - E:\ drive: 1TB+ SSD for application data
  - C:\ drive: System only (do not install on C:\)
- **Network**: Gigabit LAN

### Software
- Windows Server 2019/2022 or Linux (Ubuntu 22.04 LTS)
- Docker Desktop (Windows) or Docker Engine (Linux)
- Kubernetes (Docker Desktop K8s or Rancher Desktop)
- kubectl CLI

## Step 2: Storage Configuration

```powershell
# Create directory structure on E:\ drive
New-Item -ItemType Directory -Path "E:\classroom-production" -Force
New-Item -ItemType Directory -Path "E:\classroom-production\data\pgdata" -Force
New-Item -ItemType Directory -Path "E:\classroom-production\data\uploads" -Force
New-Item -ItemType Directory -Path "E:\classroom-production\data\redis" -Force
New-Item -ItemType Directory -Path "E:\classroom-production\registry" -Force
New-Item -ItemType Directory -Path "E:\classroom-production\monitoring" -Force
New-Item -ItemType Directory -Path "E:\classroom-production\backups" -Force

# Set proper permissions
icacls "E:\classroom-production" /grant "Users:(OI)(CI)M"
```

## Step 3: Container Registry (JFrog Artifactory or Harbor)

### Option A: Harbor (Open Source)

```yaml
# E:\classroom-production\registry\docker-compose.yml
version: '3'
services:
  harbor:
    image: goharbor/harbor-core:v2.9.0
    ports:
      - "5001:5000"  # Registry
      - "5002:8080"  # Web UI
    volumes:
      - E:\classroom-production\registry\data:/data
    environment:
      - HARBOR_ADMIN_PASSWORD=YourSecurePassword
```

### Build and Push Images to Local Registry

```powershell
# Build application
docker build -t localhost:5001/classroom-lms:latest .

# Tag for local registry
docker tag localhost:5001/classroom-lms:latest harbor.local/classroom/lms:latest

# Push to registry (on LAN)
docker push harbor.local/classroom/lms:latest
```

## Step 4: API Gateway (Kong)

### Kong Configuration

```yaml
# E:\classroom-production\config\kong\kong.yml
_format_version: "3.0"

services:
  - name: classroom-backend
    url: http://backend:5000
    routes:
      - name: api-route
        paths:
          - /api
        strip_path: false
    plugins:
      - name: rate-limiting
        config:
          minute: 100
          hour: 1000
          policy: local
      - name: cors
        config:
          origins:
            - "*"
          credentials: true
      - name: request-size-limiting
        config:
          allowed_payload_size: 500

  - name: classroom-frontend
    url: http://backend:5000
    routes:
      - name: frontend-route
        paths:
          - /
        strip_path: false
```

### Deploy Kong

```yaml
# docker-compose.yml addition
  kong:
    image: kong:3.4
    ports:
      - "8000:8000"  # Proxy
      - "8001:8001"  # Admin API
    environment:
      KONG_DATABASE: postgres
      KONG_PG_HOST: postgres
      KONG_PG_DATABASE: kong
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
    volumes:
      - E:\classroom-production\config\kong:/usr/local/kong/declarative
```

## Step 5: Caching Layer (Varnish)

### Varnish Configuration

```vcl
# E:\classroom-production\config\varnish\default.vcl
vcl 4.1;

backend default {
    .host = "backend";
    .port = "5000";
}

sub vcl_recv {
    # Cache static assets
    if (req.url ~ "\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf)$") {
        unset req.http.Cookie;
        return (hash);
    }
    
    # Cache API responses for 5 minutes
    if (req.url ~ "^/api/(modules|tests|students)/") {
        return (hash);
    }
}

sub vcl_backend_response {
    # Set cache TTL
    if (bereq.url ~ "\.(jpg|jpeg|png|gif|ico|css|js)$") {
        set beresp.ttl = 24h;
    }
    
    if (bereq.url ~ "^/api/") {
        set beresp.ttl = 5m;
    }
}
```

## Step 6: Kubernetes Deployment

### Create Kubernetes Secrets

```powershell
# Generate secrets
$JWT_SECRET = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$DB_PASSWORD = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$ADMIN_PASSWORD = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object {[char]$_})

# Create secret
kubectl create secret generic classroom-secrets `
  --from-literal=jwt-secret=$JWT_SECRET `
  --from-literal=db-password=$DB_PASSWORD `
  --from-literal=admin-password=$ADMIN_PASSWORD `
  --from-literal=smtp-host=mailhog `
  --from-literal=smtp-port=1025
```

### Deployment Manifest

```yaml
# E:\classroom-production\config\k8s\deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: classroom-backend
spec:
  replicas: 5  # Scale for 1000+ users
  selector:
    matchLabels:
      app: classroom-backend
  template:
    metadata:
      labels:
        app: classroom-backend
    spec:
      containers:
      - name: backend
        image: harbor.local/classroom/lms:latest
        ports:
        - containerPort: 5000
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        env:
        - name: DATABASE_URL
          value: "postgresql://lms_admin:$(DB_PASSWORD)@postgres:5432/sustainable_classroom"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: classroom-secrets
              key: jwt-secret
        - name: ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              name: classroom-secrets
              key: admin-password
        - name: SMTP_HOST
          value: "mailhog"
        - name: SMTP_PORT
          value: "1025"
        - name: NODE_ENV
          value: "production"
        volumeMounts:
        - name: uploads
          mountPath: /app/backend/uploads
      volumes:
      - name: uploads
        hostPath:
          path: E:\classroom-production\data\uploads
          type: Directory
---
apiVersion: v1
kind: Service
metadata:
  name: classroom-backend
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 5000
  selector:
    app: classroom-backend
```

### PostgreSQL StatefulSet

```yaml
# E:\classroom-production\config\k8s\postgres.yml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: sustainable_classroom
        - name: POSTGRES_USER
          value: lms_admin
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: classroom-secrets
              key: db-password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
      volumes:
      - name: postgres-storage
        hostPath:
          path: E:\classroom-production\data\pgdata
          type: Directory
```

## Step 7: Monitoring with Prometheus & Grafana

```yaml
# E:\classroom-production\monitoring\docker-compose.yml
version: '3'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - E:\classroom-production\monitoring\prometheus:/etc/prometheus
      - E:\classroom-production\monitoring\prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
  
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - E:\classroom-production\monitoring\grafana:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## Step 8: Automated Backups

```powershell
# E:\classroom-production\scripts\backup.ps1
$BackupDir = "E:\classroom-production\backups"
$Date = Get-Date -Format "yyyyMMdd-HHmmss"

# Backup PostgreSQL
docker exec lms-database pg_dump -U lms_admin sustainable_classroom | 
  Out-File "$BackupDir\db-$Date.sql"

# Backup uploads
Copy-Item -Path "E:\classroom-production\data\uploads" `
  -Destination "$BackupDir\uploads-$Date" -Recurse

# Keep only last 7 days
Get-ChildItem $BackupDir | 
  Where-Object {$_.CreationTime -lt (Get-Date).AddDays(-7)} | 
  Remove-Item -Recurse -Force

Write-Host "Backup completed: $Date"
```

### Schedule Daily Backup (Windows Task Scheduler)

```powershell
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
  -Argument "-File E:\classroom-production\scripts\backup.ps1"

$Trigger = New-ScheduledTaskTrigger -Daily -At 2am

Register-ScheduledTask -TaskName "ClassroomBackup" `
  -Action $Action -Trigger $Trigger -RunLevel Highest
```

## Step 9: Deploy Application

```powershell
# Navigate to production directory
cd E:\classroom-production

# Clone or copy application
git clone https://github.com/your-org/classroom.git

# Copy environment configuration
Copy-Item .env.example .env

# Edit .env with production values
notepad .env

# Deploy with Kubernetes
kubectl apply -f config\k8s\

# Or deploy with Docker Compose
docker-compose up -d

# Check status
kubectl get pods
# or
docker-compose ps
```

## Step 10: Performance Tuning

### PostgreSQL Optimization (postgresql.conf)

```ini
# E:\classroom-production\data\pgdata\postgresql.conf
shared_buffers = 16GB
effective_cache_size = 48GB
maintenance_work_mem = 2GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 20MB
min_wal_size = 2GB
max_wal_size = 8GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
max_connections = 500
```

### Connection Pooling with PgBouncer

```ini
# E:\classroom-production\config\pgbouncer\pgbouncer.ini
[databases]
sustainable_classroom = host=localhost port=5432 dbname=sustainable_classroom

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = md5
auth_file = users.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
reserve_pool_size = 10
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
```

## Access Points

After deployment:

- **Main Application**: http://server-ip or http://classroom.local
- **API Gateway**: http://server-ip:8000
- **Grafana Monitoring**: http://server-ip:3000 (admin/admin)
- **Prometheus**: http://server-ip:9090
- **MailHog**: http://server-ip:8025
- **Harbor Registry**: http://server-ip:5002

## Troubleshooting

### Check Logs
```powershell
# Kubernetes
kubectl logs -l app=classroom-backend --tail=100

# Docker Compose
docker-compose logs -f backend

# Pod-level debugging
kubectl describe pod <pod-name>
kubectl exec -it <pod-name> -- /bin/sh
```

### Performance Monitoring
```powershell
# Check resource usage
kubectl top pods
kubectl top nodes

# Database connections
docker exec -it postgres psql -U lms_admin -c "SELECT count(*) FROM pg_stat_activity;"
```

## Security Checklist

- [ ] All secrets stored in Kubernetes Secrets (not .env)
- [ ] PostgreSQL password changed from default
- [ ] Admin password changed from default
- [ ] JWT secret is 32+ random characters
- [ ] Rate limiting enabled on API gateway
- [ ] CORS properly configured
- [ ] File upload size limits enforced
- [ ] Database backups automated
- [ ] SSL/TLS certificates configured (nginx)
- [ ] Firewall rules restrict external access
- [ ] Regular security updates scheduled

## Maintenance

### Weekly Tasks
- Review Grafana dashboards for anomalies
- Check backup logs
- Review error logs
- Update security patches

### Monthly Tasks
- Database vacuum and analyze
- Review storage usage
- Test backup restoration
- Update dependencies

### Quarterly Tasks
- Performance audit
- Security audit
- Disaster recovery drill
- Capacity planning review
