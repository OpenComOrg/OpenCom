# OpenCom Backend

The backend workspace contains the shared services that power the OpenCom platform.

## Packages

- `packages/shared`: shared utilities and types
- `packages/core`: platform API for auth, profiles, social features, invites, presence, and platform services
- `packages/server-node`: guild, channel, message, attachment, moderation, and voice APIs
- `packages/media`: media-related backend services

## Go Sidecars

The repo also contains dedicated Go services for narrower backend responsibilities:

- `../go-cdn`
- `../go-media`
- `../go-linkpreview`

Migration tracking:

- `../docs/GO_BACKEND_EXTRACTION_PLAN.md`

## Requirements

- Node.js 22+
- npm
- MariaDB and Redis for local development

The easiest local path is to use the repo-level setup scripts from the project root.

## Common commands

From `backend/`:

```bash
npm install
npm run build
cp core.env.example core.env
cp node.env.example node.env
cp media.env.example media.env
npm run dev:core
npm run dev:node
npm run dev:media
npm run migrate:core
npm run migrate:node
```

Voice debugging helper:

```bash
npm run dev:voice-debug
```

## Local development

From the repository root, the usual workflow is:

```bash
./scripts/dev/setup.sh backend
./scripts/dev/setup-database.sh --with-docker
./scripts/dev/start.sh backend
```

Preferred env files:

- `backend/core.env` for the Core API
- `backend/node.env` for `server-node`
- `backend/media.env` for the dedicated media service

Bootstrap missing backend env files from the ones you already have:

```bash
node scripts/env/bootstrap-backend-envs.mjs
```

Useful flags:

- `--dry-run` to preview what would be created
- `--force` to overwrite existing `core.env`, `node.env`, and `media.env`

Run a backend service locally in the same containerized shape used for deploys:

```bash
./scripts/deploy/run-backend-service.sh core --rebuild
./scripts/deploy/run-backend-service.sh node --rebuild
./scripts/deploy/run-backend-service.sh core --replicas 2 --port 3100
```

Deploy directly to Cloud Run from your machine using your local env files:

```bash
./scripts/deploy/gcp-deploy.sh core --project-id YOUR_PROJECT --region europe-southwest1 --artifact-repo opencom
./scripts/deploy/gcp-deploy.sh node --project-id YOUR_PROJECT --region europe-southwest1 --artifact-repo opencom
```

Env loading order:

- explicit override env var first: `CORE_ENV_FILE`, `NODE_ENV_FILE`, `MEDIA_ENV_FILE`
- then the matching service file: `core.env`, `node.env`, `media.env`
- then legacy fallbacks such as `.env.core`, `.env.node`, `.env.media`, and finally `backend/.env`

## Runtime notes

- `core` is the central platform API and gateway entry point
- `server-node` is the node-local API for guild state, messaging, attachments, and voice
- local Docker Compose definitions exist at both `docker-compose.yml` and `backend/docker-compose.yml`
- PM2 start commands are exposed through the backend workspace scripts for production-style local runs

## Cloud Run

The backend image can now start a single API service directly, which matches Cloud Run's one-container-per-service model.

Build a service image from `backend/`:

```bash
docker build --build-arg SERVICE=core -t gcr.io/PROJECT_ID/opencom-core .
docker build --build-arg SERVICE=node -t gcr.io/PROJECT_ID/opencom-node .
docker build --build-arg SERVICE=media -t gcr.io/PROJECT_ID/opencom-media .
```

Recommended env file pairing on GCP:

- Core Cloud Run service: `core.env`
- Node Cloud Run or VM service: `node.env`
- Media VM or GKE service: `media.env`

Cloud Run-specific runtime behavior:

- `PORT` is respected automatically by `core`, `server-node`, `media`, OAuth API, and Internal Stats API
- services bind to `0.0.0.0` automatically on Cloud Run when host is not set explicitly
- file logging defaults off on Cloud Run so logs stay in stdout/stderr
- `core` and `node` support `STORAGE_PROVIDER=gcs` for native Google Cloud Storage using the runtime service account

Important limitation:

- `core` is a good Cloud Run fit
- the OAuth API and Internal Stats API are also straightforward Cloud Run HTTP services
- `server-node` can run there for plain HTTP/WebSocket API traffic, but its voice stack still depends on mediasoup/WebRTC behavior outside typical Cloud Run networking assumptions
- `media` is not a real Cloud Run fit for production voice because mediasoup needs its own reachable RTC port range; keep that on a VM, GKE, or another environment that can expose those ports

## Direct GCP Deploys

The repo now favors direct deploys from your own machine with `gcloud`, using your local service env files as the source of truth.

Helper script:

- [scripts/deploy/gcp-deploy.sh](/home/don/development/OpenCom/scripts/deploy/gcp-deploy.sh)

What it does:

- builds the backend image for `core`, `node`, or `media`
- pushes it to Artifact Registry
- deploys it to Cloud Run
- passes your local `core.env`, `node.env`, or `media.env` via `--env-vars-file`

Cloudflare note:

- deploy to GCP first
- then point Cloudflare at the resulting public services or load balancer
- Cloudflare is the front door, not the deployment engine

## Related docs

- `../README.md`
- `../docs/SETUP_GUIDE.md`
- `../docs/PLATFORM_GUIDE.md`
