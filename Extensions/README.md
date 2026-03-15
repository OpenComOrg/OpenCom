# OpenCom Extensions

OpenCom scans this folder for extension projects.

## Notice:
**THIS README was written by AI but I cant particularly do a better job so it stays for now**

## Folder layout
- `Extensions/Client/<extension-id>/extension.json`
- `Extensions/Server/<extension-id>/extension.json`
- `Extensions/lib/` contains the publishable `opencom-extension-sdk` package.
- `Extensions/create-extension.sh` scaffolds a new extension with manifest + starter entry.

## Command system
Server extensions can export a `commands` array. Commands are auto-registered on enable and can be executed by authenticated users via node endpoints.

## Config system
Server extension manifests can define `configDefaults`. Runtime config is persisted per server and available in commands/activation via `ctx.config.get/set/patch`.

## Server admin integration
Server extensions are enabled per server in the **Server Admin Panel → Extensions** tab.

## Publishing SDK
The SDK under `Extensions/lib` is published by GitHub Actions workflow `.github/workflows/publish-extension-sdk.yml`.
