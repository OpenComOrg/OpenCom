# Scripts Guide

Scripts are organized by purpose with compatibility wrappers left in `scripts/`.

## Directory layout

- `scripts/dev`: local development setup/start/migrations/env init
- `scripts/env`: env/config generators
- `scripts/ops`: operational/admin/maintenance tooling
- `scripts/docs`: documentation workflow scripts

## Common commands

Development:

```bash
./scripts/dev/setup.sh all
./scripts/dev/init-env.sh
./scripts/dev/setup-database.sh --init-env --with-docker
./scripts/dev/start.sh all
./scripts/client.sh
./scripts/client.sh --build
```

Docs:

```bash
./scripts/docs/serve.sh
./scripts/docs/check-links.sh
./scripts/docs/new-page.sh my-topic "My Topic"
```

Operations:

```bash
./scripts/ops/update-opencom.sh --pull --backup
./scripts/ops/tmux-fast-update.sh
./scripts/ops/tmux-fast-update.sh --no-restart
./scripts/ops/configure-ws.sh --domain ws.opencom.online --ip 127.0.0.1
./scripts/ops/server-admin.sh search-users --query alice
./scripts/verify-user-email.sh alice
./scripts/ops/status-monitor.sh --watch 60
./scripts/ops/status-incident.sh add "API outage" "Investigating elevated 5xx." major investigating
```

## Compatibility wrappers

Legacy commands still work, for example:

- `./scripts/setup.sh`
- `./scripts/start.sh`
- `./scripts/setup-database.sh`
- `./scripts/create-server.sh`

Client wrappers:

- Linux/macOS shell: `./scripts/client.sh` (or `./scripts/client.sh --build`)
- Windows CMD: `scripts\client.bat` (or `scripts\client.bat --build`)

These wrappers forward to the new directory layout.
