# OpenCom

Open-source Discord-like platform.

## Monorepo layout
- `backend/`: Core + Server Node services.
- `frontend/`: React web client.
- `scripts/`: One-command setup/start scripts.
- `docs/`: Setup guide and static docs site for GitHub Pages.

## Planned deployment URLs
- Frontend app: `https://opencom.donskyblock.xyz`
- API/Core: `https://openapi.donskyblock.xyz`

## Quick setup (one command)
### Linux/macOS
```bash
./scripts/setup.sh all
./scripts/start.sh all
```

### Windows
```bat
scripts\setup.bat all
scripts\start.bat all
```

## Script targets
- Setup scripts: `backend`, `frontend`, `all`
- Start scripts: `core`, `node`, `frontend`, `backend`, `all`

## Documentation
- Full setup guide: `docs/SETUP_GUIDE.md`
- Frontend guide: `frontend/README.md`
- Backend guide: `backend/README.md`

## GitHub Pages docs site
A workflow is included at `.github/workflows/docs-pages.yml` to deploy `docs/site` to GitHub Pages on pushes to `main`.
