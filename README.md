# OpenCom

Open-source Discord-like platform.

## Monorepo layout
- `backend/`: Core + Server Node services.
- `frontend/`: React web client.

## Planned deployment URLs
- Frontend app: `https://opencom.donskyblock.xyz`
- API/Core: `https://openapi.donskyblock.xyz`

## Backend database setup
Fastest fully-inclusive setup (env + local MariaDB provisioning via sudo + migrations):
```bash
./scripts/setup-database.sh --init-env --provision-local-db
```

Docker-based setup (env + docker infra + migrations):
```bash
./scripts/setup-database.sh --init-env --with-docker
```

If env already exists and DB is ready:
```bash
./scripts/setup-database.sh
```

## Create a server with explicit owner username
Use the helper script when you want to assign ownership to a specific existing user:
```bash
./scripts/create-server.sh --name "My Server" --base-url "https://node.provider.tld" --owner-username "alice"
```


## Update + backup/restore scripts
Run a full update flow (deps + migrations + builds):
```bash
./scripts/update-opencom.sh
```

Useful options:
```bash
./scripts/update-opencom.sh --pull --backup
./scripts/update-opencom.sh --skip-build
```

Create a portable backup bundle (DB + env config snapshots):
```bash
./scripts/migrate-portability.sh export backups/opencom-backup.tar.gz
```

Restore from a portable backup bundle:
```bash
./scripts/migrate-portability.sh import backups/opencom-backup.tar.gz
```

## Frontend quickstart
```bash
cd frontend
npm install
npm run dev
```

See `frontend/README.md` for full documentation, custom CSS theming, and API integration details.

## Run services
From repository root:
```bash
./start.sh
```

This also serves the admin dashboard at `http://localhost:5173/admin.html` when frontend is running.

Or explicitly:
```bash
./scripts/start.sh all
```
