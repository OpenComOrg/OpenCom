# OpenCom

Open-source Discord-like platform.

## Monorepo layout
- `backend/`: Core + Server Node services.
- `frontend/`: React web client.

## Planned deployment URLs
- Frontend app: `https://opencom.donskyblock.xyz`
- API/Core: `https://openapi.donskyblock.xyz`

## Backend database setup
From the repository root, run:
```bash
./scripts/setup-database.sh
```

To also boot backend docker services before running migrations:
```bash
./scripts/setup-database.sh --with-docker
```

## Frontend quickstart
```bash
cd frontend
npm install
npm run dev
```

See `frontend/README.md` for full documentation, custom CSS theming, and API integration details.
