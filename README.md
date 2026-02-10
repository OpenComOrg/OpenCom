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

## Frontend quickstart
```bash
cd frontend
npm install
npm run dev
```

See `frontend/README.md` for full documentation, custom CSS theming, and API integration details.
