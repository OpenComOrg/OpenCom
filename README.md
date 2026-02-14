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

## Configure direct WebSocket hosting (frontend via nginx, WS direct)
If your frontend is proxied by nginx but websocket is exposed directly (for example on `ws.opencom.online:9443`), run:

```bash
./scripts/configure-ws.sh --domain ws.opencom.online --ip 37.114.58.186
```

> Do **not** pass `--backend-env /tmp/...` and `--frontend-env /tmp/...` unless you intentionally want a dry-run-like temp output.
> To apply real config, run it against defaults (`backend/.env` and `frontend/.env`) by omitting those flags.

Generate a self-signed certificate/key pair for `wss://` testing (writes `fullchain.pem` + `privkey.pem`):

```bash
./scripts/configure-ws.sh --domain ws.opencom.online --ip 37.114.58.186 --generate-self-signed-cert
```

Use `--cert-dir <path>` to change output location and `--force-cert-overwrite` to replace existing files.

> Self-signed certificates are for diagnostics only; browsers will still show trust errors unless you install the CA/cert.

Generate a trusted Let's Encrypt certificate for `wss://` (no browser warnings) and auto-wire backend TLS env vars:

```bash
./scripts/configure-ws.sh --domain ws.opencom.online --generate-letsencrypt-cert --letsencrypt-email admin@opencom.online
```

> By default this uses `certbot --standalone`, so port **80** for that domain must be free/reachable during issuance.
> If nginx already uses `:80`, use webroot mode instead:
> `./scripts/configure-ws.sh --domain ws.opencom.online --generate-letsencrypt-cert --letsencrypt-email admin@opencom.online --letsencrypt-webroot /var/www/certbot`
> Cert files are expected at `/etc/letsencrypt/live/<domain>/fullchain.pem` and `privkey.pem`, and are written to `CORE_GATEWAY_TLS_CERT_FILE` / `CORE_GATEWAY_TLS_KEY_FILE` in `backend/.env`.

Force plain `ws://` if your WS endpoint does not use TLS:

```bash
./scripts/configure-ws.sh --ip 37.114.58.186 --direct-ip --insecure
```
