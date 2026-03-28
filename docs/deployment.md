# Deployment

LoomPress is deployed as a Docker container alongside your existing applications on a VPS. Caddy handles TLS and reverse proxying.

---

## Prerequisites

- VPS with Docker and Docker Compose installed
- Caddy reverse proxy running (same setup as dudiba)
- PostgreSQL database (Supabase or self-hosted)
- DNS A records for each blog subdomain pointing to the VPS IP

---

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Server
NODE_ENV=production
PORT=4100

# Database — use your existing Supabase Postgres connection string
# or a separate Postgres container
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# Session — generate a strong random string
# Run: openssl rand -base64 32
SESSION_SECRET=your-strong-random-session-secret

# File uploads
ASSETS_DIR=/app/assets
UPLOAD_DIR=/app/uploads-data
UPLOAD_MAX_SIZE_MB=20

# Reverse proxy support (required behind Caddy/Nginx)
TRUST_PROXY=1

# Optional: base URL for the admin (used in emails / links)
ADMIN_BASE_URL=https://cms.tagna.in

# Optional: runtime plugins
PLUGINS_DIR=/app/plugins
# PLUGINS=/app/plugins/my-plugin,/app/plugins/another-plugin
```

If you prefer, you can deploy without `DATABASE_URL` and `SESSION_SECRET`, start the container, and complete the database step from `https://your-domain/install/database`. LoomPress will write those values into `.env` inside the container filesystem. In Docker deployments, explicit environment variables are still the better production default.

---

## Docker Setup

### `docker-compose.yml` — add the `cms` service

```yaml
services:
  # ... your existing app service ...

  cms:
    build:
      context: /path/to/loompress
      dockerfile: Dockerfile
    restart: unless-stopped
    mem_limit: 256m
    environment:
      NODE_ENV: production
      PORT: 4100
      DATABASE_URL: ${CMS_DATABASE_URL}
      SESSION_SECRET: ${CMS_SESSION_SECRET}
      ASSETS_DIR: /app/assets
      UPLOAD_DIR: /app/uploads-data
      UPLOAD_MAX_SIZE_MB: 20
      TRUST_PROXY: 1
      PLUGINS_DIR: /app/plugins
    volumes:
      - cms-assets:/app/assets
      - cms-uploads:/app/uploads-data
      - ./plugins:/app/plugins:ro
    expose:
      - "4100"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

volumes:
  cms-assets:
  cms-uploads:
```

### `.env` for docker-compose (on the VPS)

Add to your `.env` file on the VPS:

```env
CMS_DATABASE_URL=postgresql://...
CMS_SESSION_SECRET=...
```

---

## Dockerfile

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json .
RUN mkdir -p /app/plugins
RUN mkdir -p /app/assets
RUN mkdir -p /app/uploads-data
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
```

---

## Caddyfile

Update your Caddyfile to add a block for each blog domain and the admin domain:

```caddyfile
# Existing dudiba app
{$APP_DOMAIN} {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "SAMEORIGIN"
  }
  reverse_proxy app:3000
}

# LoomPress — dudiba blog
blog.dudiba.com {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "SAMEORIGIN"
  }
  # Serve uploaded media directly (bypass Express for static files)
  handle /uploads/* {
    root * /volumes/cms-uploads
    file_server
  }
  handle /assets/* {
    root * /volumes/cms-assets
    file_server
  }
  reverse_proxy cms:4100
}

# LoomPress — superadmin access
cms.tagna.in {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options "nosniff"
  }
  handle /uploads/* {
    root * /volumes/cms-uploads
    file_server
  }
  handle /assets/* {
    root * /volumes/cms-assets
    file_server
  }
  reverse_proxy cms:4100
}
```

To add a new blog (e.g. `blog.herOreh.com`), copy the `blog.dudiba.com` block, change the domain, and reload Caddy:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## First Deploy

```bash
# 1. Build and start
docker compose up -d cms

# 2. Check logs
docker compose logs -f cms

# 3. Run database migrations (on first deploy only)
docker compose exec cms node dist/db/migrate.js

# 4. Create the first superadmin user
docker compose exec cms node dist/scripts/seed-admin.js \
  --email admin@tagna.in \
  --name "Haris" \
  --password "change-me-now-123"

# 5. Create the first site
docker compose exec cms node dist/scripts/seed-site.js \
  --hostname blog.dudiba.com \
  --name "Dudiba Blog" \
  --slug dudiba \
  --base-url https://blog.dudiba.com
```

After step 5, visit `https://cms.tagna.in/admin/login` to access the admin panel.

If you deploy plugins, mount them into `/app/plugins` or point `PLUGINS` at their exact locations.

---

## Updates

```bash
# Pull latest code on the VPS
git -C /path/to/loompress pull

# Rebuild and restart the cms container
docker compose up -d --build cms

# Run any new migrations
docker compose exec cms node dist/db/migrate.js
```

Migrations are idempotent — running them again when there are no new files is safe.

---

## Backup

### Database
The `lp_*` tables live in the same Postgres instance as the rest of your application. They are included in any full-database backup. No extra steps required.

### Uploaded files
The `cms-uploads` Docker volume contains all uploaded media. Back it up with:

```bash
docker run --rm \
  -v loompress_cms-uploads:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/cms-uploads-$(date +%Y%m%d).tar.gz -C /data .
```

Add this to your existing backup cron job.

### User assets
The `cms-assets` Docker volume contains the user-managed `/assets/*` files. Back it up alongside uploads if you rely on custom logos, scripts, or static image files stored there.

---

## Resource Usage

LoomPress is designed to run comfortably within 256 MB RAM. Typical steady-state:
- ~80–120 MB RAM for the Node.js process
- ~10–20 MB for the Nunjucks template cache
- Negligible CPU when idle

The `mem_limit: 256m` in docker-compose prevents the container from consuming memory beyond this in case of a leak or traffic spike.

---

## Health Check

The `/health` endpoint returns:
```json
{ "status": "ok", "db": "ok", "uptime": 12345 }
```

It verifies the database connection on each call. Docker and Caddy use this for health monitoring.

