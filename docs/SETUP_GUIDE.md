# OpenCom Setup Guide

This guide gives a one-command path to install and run OpenCom locally on Linux/macOS and Windows.

## Components
- **Core API** (`backend/packages/core`) — accounts, auth, server registry, invites.
- **Server Node** (`backend/packages/server-node`) — guild/channels/messages/attachments/voice.
- **Frontend** (`frontend`) — React client UI.
- **Desktop Client** (`client`) — thin Electron shell around web client + local rich presence RPC bridge.

## URLs
- Planned frontend URL: `https://opencom.donskyblock.xyz`
- Planned API URL: `https://openapi.donskyblock.xyz`

## Prerequisites
- Node.js 20+
- npm 10+
- Docker + Docker Compose (recommended for local databases/redis)

## 1) Clone and configure
```bash
git clone <your-repo-url>
cd OpenCom
cp backend/.env.example backend/.env
```

Fill `backend/.env` values (DB/JWT/JWK vars especially).

## 2) One-command setup
### Linux/macOS
```bash
./scripts/dev/setup.sh all
```

### Windows
```bat
scripts\dev\setup.bat all
```

What this does:
- installs backend npm dependencies
- installs frontend npm dependencies
- starts backend infra via `docker compose up -d mariadb-core mariadb-node redis minio` if docker is installed

### Fully inclusive backend DB setup (env + database + tables)
For local MariaDB installed on the host (uses `sudo mysql` for provisioning):
```bash
./scripts/dev/setup-database.sh --init-env --provision-local-db
```

For dockerized MariaDB from `docker-compose.yml`:
```bash
./scripts/dev/setup-database.sh --init-env --with-docker
```

Run the full local stack (core + node + frontend + infra) in Docker:
```bash
# compose uses backend/.env + backend/.env.docker
# and frontend/.env + frontend/.env.docker
docker compose up -d --build
```

If a host port is already taken, override mapping defaults (for example `REDIS_PORT=6380`, `CORE_DB_PORT=3309`, `NODE_DB_PORT=3310`, `FRONTEND_PORT=5174`) when running compose.

## 3) Run services
### Linux/macOS
```bash
./scripts/dev/start.sh all
```

### Windows
```bat
scripts\dev\start.bat all
```

You can also run targets individually:
- `core`
- `node`
- `frontend`
- `backend` (core + node)

## 4) Migration commands
Run migrations only (expects backend/.env and DB access already set up):
```bash
./scripts/dev/setup-database.sh
```

Run full env + DB provisioning + migrations (host MariaDB + sudo):
```bash
./scripts/dev/setup-database.sh --init-env --provision-local-db
```

Run full env + docker infra + migrations:
```bash
./scripts/dev/setup-database.sh --init-env --with-docker
```

Equivalent manual commands:
```bash
./scripts/dev/init-env.sh
cd backend
npm run migrate:core
npm run migrate:node
```

## Troubleshooting
- If `npm install` fails with `403`, your environment or registry policy is blocking package access.
- If the node cannot verify memberships, ensure `NODE_SERVER_ID` matches server IDs issued by Core.
- If voice does not connect externally, set mediasoup announced IP in `backend/.env`.

## Deploying
- Deploy frontend to `opencom.donskyblock.xyz`.
- Deploy Core API to `openapi.donskyblock.xyz`.
- Deploy one or more provider-hosted server nodes and register each node URL in Core as a server `baseUrl`.
