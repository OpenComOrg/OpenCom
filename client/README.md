# OpenCom Desktop Client Wrapper

Vesktop-style thin Electron shell that runs the OpenCom web client directly.

Canonical full-platform docs:

- `../docs/PLATFORM_GUIDE.md`

## Features

- Builds frontend directly into embedded desktop assets (`client/src/web`) for deterministic startup.
- Appends `?desktop=1` so the frontend skips the landing page.
- Appends desktop query params (`desktop`, `route`, `coreApi`) so desktop starts directly in app auth/client flow.
- Falls back to `OPENCOM_APP_URL` (default `https://opencom.online`) only if local build assets are missing.
- Local RPC bridge for rich presence (no token handling needed by local apps).
- Shares web-session auth context with the local RPC bridge after login.

## Development

```bash
cd client
npm install
npm start
```

`npm start` runs `sync:web` first, but rebuild is incremental and skipped when embedded assets are already up to date.
Set `OPENCOM_FORCE_SYNC_WEB=1` to force rebuild.

## Dependency security workflow

- Build tooling (`electron-builder`) currently depends on older `minimatch` API expectations.
- This client pins `electron-builder` and uses an `overrides` entry to a local compatibility package at `client/vendor/minimatch` so all transitive `minimatch` resolutions are fixed at `10.2.2` without breaking legacy consumers.
- Run `npm run check:minimatch` after dependency updates to verify all resolved `minimatch` versions stay at `>= 10.2.1`.
- Use `npm run audit:runtime` for shipped/runtime dependency checks, and `npm run audit:all` for full dev + build chain scans.
- Avoid `npm audit fix --force` in this package; it can churn lockfile versions and reintroduce unstable builder trees.

Run remote-only mode (skip local synced build):

```bash
OPENCOM_APP_URL="https://opencom.online" npm run start:remote
```

Override Core API base used by desktop-injected frontend URL:

```bash
OPENCOM_CORE_API_URL="https://api.opencom.online" npm start
```

## Local RPC bridge

When the desktop app is running, it exposes a local HTTP bridge:

- Host: `127.0.0.1`
- Port: `6483` (override with `OPENCOM_RPC_PORT`)

Endpoints:

- `GET /rpc/health`
- `POST /rpc/activity`
- `DELETE /rpc/activity`

Example set activity:

```bash
curl -X POST http://127.0.0.1:6483/rpc/activity \
  -H "Content-Type: application/json" \
  -d '{
    "activity": {
      "name": "Playing OpenCom",
      "details": "In a call",
      "state": "With friends",
      "largeImageUrl": "https://example.com/cover.png",
      "buttons": [{"label":"Join","url":"https://opencom.online"}]
    }
  }'
```

Clear activity:

```bash
curl -X DELETE http://127.0.0.1:6483/rpc/activity
```

Note: bridge becomes `ready: true` after you log in to OpenCom desktop (the frontend shares auth context with the shell).

## Build (local, without GitHub Actions)

Build commands compile frontend directly into `client/src/web`, then package.

```bash
cd client
npm install
npm run build:stage:linux
npm run build:stage:win
```

These commands build and then copy installer artifacts into `frontend/`:

- `frontend/OpenCom.deb`
- `frontend/OpenCom.tar.gz`
- `frontend/OpenCom.exe` (Windows NSIS installer)

Direct script entrypoints are also available:

```bash
./scripts/build-linux.sh
./scripts/build-win.sh
./scripts/build-all.sh
```
