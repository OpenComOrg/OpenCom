# GCP Go Service Containers

These Dockerfiles are meant to be built from the repository root so they can copy any shared files they need.

## Build

```bash
docker build -f go-internal/Dockerfile -t europe-west2-docker.pkg.dev/PROJECT/REPO/go-internal:latest .
docker build -f go-linkpreview/Dockerfile -t europe-west2-docker.pkg.dev/PROJECT/REPO/go-linkpreview:latest .
docker build -f go-downloads/Dockerfile -t europe-west2-docker.pkg.dev/PROJECT/REPO/go-downloads:latest .
docker build -f go-themes/Dockerfile -t europe-west2-docker.pkg.dev/PROJECT/REPO/go-themes:latest .
docker build -f go-media/Dockerfile -t europe-west2-docker.pkg.dev/PROJECT/REPO/go-media:latest .
docker build -f go-cdn/Dockerfile -t europe-west2-docker.pkg.dev/PROJECT/REPO/go-cdn:latest .
```

## Runtime Notes

- `go-internal` is the preferred Cloud Run target for the early extracted internal HTTP workloads.
- `go-linkpreview`, `go-themes`, and `go-downloads` are transitional split services and can be phased out once `go-internal` is live.
- `go-cdn` is a good Cloud Run candidate when it fronts GCS and uses service-account auth.
- `go-media` can run in GCP as a container, but Cloud Run is best treated as signaling/control-plane only. Real public UDP media is better on GCE, GKE, or a hybrid setup.
- `go-downloads` bakes `client/package.json` and `frontend/public/downloads` into the image so desktop metadata and static downloads work without extra mounts.
- `go-downloads` does not bundle DB-stored client artifact binaries from `CLIENT_ARTIFACTS_STORAGE_DIR`; mount that path or point it at durable storage in production.
- All services still expect their normal environment variables at deploy time, including DB credentials and shared internal tokens.

## Cloud Run Example

```bash
gcloud run deploy go-linkpreview \
  --image=europe-west2-docker.pkg.dev/PROJECT/REPO/go-linkpreview:latest \
  --region=europe-west2 \
  --platform=managed \
  --allow-unauthenticated=false
```
