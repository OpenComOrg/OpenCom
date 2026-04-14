# Go Backend Extraction Plan

This tracks the small backend slices that are good candidates to move out of the Node/Fastify apps into Go services.

## Extraction Principles

- Prefer narrow HTTP responsibilities over broad domain splits.
- Move stateless or low-state workloads first.
- Keep auth/user session validation in `core` or `server-node` initially, then proxy internally to extracted Go apps.
- Merge closely related low-complexity slices into a shared internal Go app when that reduces deployment overhead without creating a new monolith.
- Use one internal shared secret per extracted service or a shared platform-internal secret while the rewrite is still in motion.

## Current Shape

- `go-internal` is the preferred combined service for early extracted core workloads:
  - link preview
  - downloads
  - themes
- `go-cdn` stays separate because it has a distinct storage-facing deployment profile.
- `go-media` stays separate because realtime/WebRTC concerns are operationally different from CRUD and proxy workloads.

## Good Early Candidates

1. `link-preview`
   - Current source: `backend/packages/core/src/routes/linkPreview.ts`
   - Why it is a good fit:
     - mostly I/O bound
     - SSRF controls are easier to isolate and harden
     - tiny API surface
   - Status: implemented and now expected to live under `go-internal`; legacy `go-linkpreview` can be retired after migration

2. `downloads`
   - Current source: `backend/packages/core/src/routes/downloads.ts`
   - Why it is a good fit:
     - public/file-serving workload
     - simple DB lookups and object/file reads
     - clean Cloud Run or CDN-adjacent deployment story
   - Status: implemented and now expected to live under `go-internal`; legacy `go-downloads` can be retired after migration

3. `theme-catalog`
   - Current source: `backend/packages/core/src/routes/themes.ts`
   - Why it is a good fit:
     - small CRUD surface
     - simple DB interactions
     - low coupling to realtime concerns
   - Status: implemented and now expected to live under `go-internal`; legacy `go-themes` can be retired after migration

4. `klipy-proxy`
   - Current source: `backend/packages/core/src/routes/klipy.ts`
   - Why it is a good fit:
     - third-party integration wrapper
     - low local domain coupling
     - straightforward to cache and rate-limit independently
