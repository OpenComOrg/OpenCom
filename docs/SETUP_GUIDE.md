# OpenCom Setup Guide

This guide gives a one-command path to install and run OpenCom locally on Linux/macOS and Windows.

## Components
- **Core API** (`backend/packages/core`) — accounts, auth, server registry, invites.
- **Server Node** (`backend/packages/server-node`) — guild/channels/messages/attachments/voice.
- **Frontend** (`frontend`) — React client UI.

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
./scripts/setup.sh all
```

### Windows
```bat
scripts\setup.bat all
```

What this does:
- installs backend npm dependencies
- installs frontend npm dependencies
- starts backend infra via `docker compose up -d` if docker is installed

## 3) Run services
### Linux/macOS
```bash
./scripts/start.sh all
```

### Windows
```bat
scripts\start.bat all
```

You can also run targets individually:
- `core`
- `node`
- `frontend`
- `backend` (core + node)

## 4) Migration commands
Run in another terminal if needed:
```bash
./scripts/setup-database.sh
```

You can optionally start dockerized backend infrastructure first:
```bash
./scripts/setup-database.sh --with-docker
```

Equivalent manual commands:
```bash
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
