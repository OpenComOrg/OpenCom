# Go Backend Extraction Plan

This tracks the small backend slices that are good candidates to move out of the Node/Fastify apps into dedicated Go services.

## Extraction Principles

- Prefer narrow HTTP responsibilities over broad domain splits.
- Move stateless or low-state workloads first.
- Keep auth/user session validation in `core` or `server-node` initially, then proxy internally to extracted Go apps.
- Use one internal shared secret per extracted service or a shared platform-internal secret while the rewrite is still in motion.

## Good Early Candidates

1. `link-preview`
   - Current source: `backend/packages/core/src/routes/linkPreview.ts`
   - Why it is a good fit:
     - mostly I/O bound
     - SSRF controls are easier to isolate and harden
     - tiny API surface
   - Status: moved to `go-linkpreview`, with core proxy support

2. `downloads`
   - Current source: `backend/packages/core/src/routes/downloads.ts`
   - Why it is a good fit:
     - public/file-serving workload
     - simple DB lookups and object/file reads
     - clean Cloud Run or CDN-adjacent deployment story
   - Status: moved to `go-downloads`, with core proxy support

3. `theme-catalog`
   - Current source: `backend/packages/core/src/routes/themes.ts`
   - Why it is a good fit:
     - small CRUD surface
     - simple DB interactions
     - low coupling to realtime concerns
   - Status: moved to `go-themes`, with core-auth proxy support

4. `klipy-proxy`
   - Current source: `backend/packages/core/src/routes/klipy.ts`
   - Why it is a good fit:
     - third-party integration wrapper
     - low local domain coupling
     - straightforward to cache and rate-limit independently
