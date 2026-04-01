# OpenCom Setup Guide

**[NOTICE] AI WRITTEN DOCUMENTATION THIS IS GOING TO BE REWRITTEN AND IS ONLY TEMPORARY TO HAVE SOMETHING HERE MY APPOLOGIES**

This guide covers the current local development path for OpenCom and is intended to stay aligned with the helper scripts in `scripts/dev/`.

## Components

- **Core API** (`backend/packages/core`): accounts, auth, profiles, invites, social features, and platform services
- **Server Node** (`backend/packages/server-node`): guilds, channels, messages, attachments, moderation, and voice
- **Frontend** (`frontend`): main React web client
- **Panel** (`panel`): standalone platform admin panel
- **Desktop Client** (`client`): Electron wrapper around the web client with a local rich presence bridge
- **Android Client** (`mobile/opencom-android`): Expo-based mobile app

## URLs

Common local URLs:

- Frontend: `http://localhost:5173`
- Core API: `http://localhost:3001`
- Server Node: `http://localhost:3002`
- Admin panel: `http://localhost:5175`

## Prerequisites

- Node.js 22+ for backend development
- npm
- Docker with Compose support for the easiest local MariaDB and Redis setup
- optional: local MariaDB if you prefer `--local-db` workflows

## 1) Clone and configure

```bash
git clone <your-repo-url>
cd OpenCom
```

You can generate local env files with the provided scripts instead of creating them manually.

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
- starts backend infrastructure with Docker Compose if Docker is available

## 3) Generate env files and database state

### Docker-backed local databases

```bash
./scripts/dev/setup-database.sh --with-docker
```

### Local MariaDB on the host

```bash
./scripts/dev/setup-database.sh --provision-local-db
```

If you want env files generated in the same pass, add `--init-env`:

```bash
./scripts/dev/setup-database.sh --init-env --with-docker
```

Equivalent manual sequence:

```bash
./scripts/dev/init-env.sh
cd backend
npm run migrate:core
npm run migrate:node
```

## 4) Run services

### Linux/macOS

```bash
./scripts/dev/start.sh all
```

### Windows

```bat
scripts\dev\start.bat all
```

Supported start targets:

- `core`
- `node`
- `frontend`
- `panel`
- `admin` (alias of `panel`)
- `backend` (core + node)
- `all`

## 5) Full Docker stack

If you want the app services themselves to run in Docker as well:

```bash
docker compose up -d --build
```

This starts:

- MariaDB for core
- MariaDB for server node
- Redis
- Core API
- Server Node
- Frontend
- Support portal
- Panel

If a host port is already taken, override mapping defaults such as `REDIS_PORT`, `CORE_DB_PORT`, `NODE_DB_PORT`, `FRONTEND_PORT`, `SUPPORT_PORT`, or `PANEL_PORT`.

MinIO is not part of the active app path right now. If you want it for manual object-storage experiments, start it explicitly:

```bash
docker compose --profile optional-storage up -d minio
```

Default MinIO loopback bindings:

- API: `127.0.0.1:9100`
- Console: `127.0.0.1:9101`

## Resetting local state

If local config gets out of sync, rebuild it with:

```bash
./scripts/dev/reconfigure.sh --yes
```

Useful variants:

- `./scripts/dev/reconfigure.sh --yes --with-minio`
- `./scripts/dev/reconfigure.sh --yes --local-db`
- `./scripts/dev/reconfigure.sh --yes --skip-install`

## Troubleshooting

- If `npm install` fails with `403`, your environment or registry policy is blocking package access.
- If backend setup refuses to continue, check that your Node.js version is at least 22.
- If the server node cannot verify memberships, ensure `NODE_SERVER_ID` matches the server IDs issued by Core.
- If voice does not connect externally, configure the mediasoup announced IP in `backend/.env`.
- If local services are healthy but the app behaves oddly, `./scripts/dev/reconfigure.sh --yes` is the fastest clean reset.

## Deploying

At a high level:

- deploy the frontend separately from the APIs
- deploy the Core API as the central platform service
- deploy one or more server nodes and register each node URL in Core as a server `baseUrl`
- deploy the panel and support portal as separate web apps when needed
