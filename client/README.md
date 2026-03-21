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
- `package.json` sets `packageManager` to `traversal@1.0.0` so `electron-builder` uses its manual dependency collector (instead of `npm list`), which avoids Node 25+ stdout collection issues during packaging.
- `npm install` and all desktop run/build scripts automatically restore vendored `minimatch` runtime deps via `npm run prepare:vendored-minimatch` (offline-safe, no registry fetch required).
- Run `npm run check:minimatch` after dependency updates to verify all resolved `minimatch` versions stay at `>= 10.2.1`.
- `npm run check:mismatch` is provided as an alias to `check:minimatch`.
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
- `frontend/OpenCom.rpm`
- `frontend/OpenCom.tar.gz`
- `frontend/OpenCom.exe` (Windows NSIS installer)

`./scripts/build-all.sh` also stages the Arch/AUR package skeleton from the Linux artifacts via `build-aur --skip-build`, so the release flow now covers Linux, AUR, and Windows in one pass.

Direct script entrypoints are also available:

```bash
./scripts/build-linux.sh
./scripts/build-aur.sh
./scripts/stage-aur.sh
./scripts/build-win.sh
./scripts/build-all.sh
```

On Arch-based systems, `.deb` packaging may fail if bundled `fpm` cannot load `libcrypt.so.1`.
`npm run build:linux` now auto-falls back to `tar.gz` in that case. Install `libxcrypt-compat` and rerun to restore `.deb` output.

### Release metadata and AUR foundations

Linux builds now also emit packaging metadata:

- `client/dist/linux-release-manifest.json`
- `client/dist/linux-release.sha256`

Generate an Arch/AUR skeleton for the prebuilt tarball:

```bash
cd client
npm run build:aur
```

Generate or restage the AUR directory from the current Linux artifacts:

```bash
cd client
npm run stage:aur
```

By default, the staged `PKGBUILD` points at `https://opencom.online/downloads/OpenCom.tar.gz` and the script hashes that remote tarball directly to populate `sha256sums`.

You can override the tarball source and related package metadata without editing `client/packaging/linux.json`:

```bash
cd client
npm run stage:aur -- \
  --source-url https://downloads.example.com/OpenCom-nightly.tar.gz \
  --tarball-name OpenCom-nightly.tar.gz \
  --tarball-sha256 <sha256>
```

If you only want to swap the host/base path, use `--release-base-url` instead:

```bash
cd client
npm run stage:aur -- --release-base-url https://downloads.example.com/opencom
```

Environment variables are supported too:

```bash
OPENCOM_AUR_SOURCE_URL=https://downloads.example.com/OpenCom.tar.gz \
OPENCOM_AUR_TARBALL_SHA256=<sha256> \
npm run stage:aur
```

When you are intentionally publishing a URL without a local hash match, pass `--skip-tarball-sha256` to emit `SKIP` in `PKGBUILD` and `.SRCINFO`.

That produces:

- `client/dist/aur/opencom-bin/PKGBUILD`
- `client/dist/aur/opencom-bin/.SRCINFO`
- `client/dist/aur/opencom-bin/opencom.desktop`
- `client/dist/aur/opencom-bin/opencom.png`

The packaging inputs live in `client/packaging/linux.json`, so future Linux targets can reuse the same metadata instead of duplicating package names, install paths, or runtime dependency lists across scripts.

### Windows build from Linux (no VM)

`npm run build:win` now defaults to containerized packaging on non-Windows hosts, so host Wine is not required.
It will use Docker first (or Podman if Docker is unavailable), with image `electronuserland/builder:wine`.

```bash
cd client
npm run build:win
```

Optional overrides:

- `npm run build:win:container` force container mode.
- `npm run build:win:local` force local mode (requires host Wine).
- `OPENCOM_CONTAINER_ENGINE=podman npm run build:win` force container engine.
- `OPENCOM_WIN_CONTAINER_IMAGE=<image> npm run build:win` override builder image.
