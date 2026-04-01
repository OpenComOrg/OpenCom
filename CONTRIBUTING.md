**[NOTICE] AI WRITTEN DOCUMENTATION THIS IS GOING TO BE REWRITTEN AND IS ONLY TEMPORARY TO HAVE SOMETHING HERE MY APPOLOGIES**

# Contributing to OpenCom

This document focuses on making local development predictable and keeping the repository approachable for future contributors.

## Before you start

- Read the top-level `README.md` for the current project map.
- Use the helper scripts in `scripts/dev/` instead of assembling local commands by hand when possible.
- Check `git status` before making broad formatting changes so you do not overwrite unrelated work.

## Development workflow

### Recommended local setup

```bash
./scripts/dev/setup.sh all
./scripts/dev/setup-database.sh --with-docker
./scripts/dev/start.sh all
```

This gives you:

- Core API on `http://localhost:3001`
- Server Node on `http://localhost:3002`
- Frontend on `http://localhost:5173`
- Admin panel on `http://localhost:5175`

### Resetting a broken local environment

If local config or Docker state gets out of sync, run:

```bash
./scripts/dev/reconfigure.sh --yes
```

Add `--with-minio` if you also want the optional object-storage stack recreated.

## Editing guidelines

- Keep changes scoped. The repo often has in-progress work in multiple packages.
- Prefer small formatting cleanups near the code you are touching rather than repo-wide rewrites.
- Update docs when behavior, scripts, env vars, or package responsibilities change.
- Use inclusive, direct language in docs. Aim for clarity over personality-driven filler.
- Prefer ASCII unless a file already uses non-ASCII content intentionally.

## Documentation expectations

When updating docs:

- State what a package or script does in one sentence.
- Show the exact command a contributor should run.
- Include default local URLs when they matter.
- Call out assumptions, prerequisites, and optional services clearly.
- Avoid jokes or apology text in contributor-facing documentation.

## Where to document changes

- `README.md`: project overview and common local workflows
- `docs/SETUP_GUIDE.md`: detailed setup and environment notes
- `docs/PLATFORM_GUIDE.md`: platform capabilities and API surface
- package-level `README.md` files: responsibilities and package-specific commands

## Formatting baseline

The repository now includes a root `.editorconfig` with shared defaults:

- UTF-8
- LF line endings
- final newline
- two-space indentation by default

If you use an editor that supports EditorConfig, these settings should apply automatically.
