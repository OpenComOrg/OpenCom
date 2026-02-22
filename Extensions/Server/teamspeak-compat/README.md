# TeamSpeak Compatibility Layer

Official OpenCom server extension that provides a compatibility layer for TeamSpeak-style extension packs.

## What it does
- Loads built-in and remote compatibility packs.
- Lets owners/admins install, enable, disable, and remove packs.
- Executes pack commands via `/ts-compat-run`.
- Supports two pack command actions:
  - `reply`: return a templated message.
  - `opencom_command`: map to an existing OpenCom extension command.
  - `native_bridge`: forward request to an isolated external bridge service.

## Core commands
- `/ts-compat-status`
- `/ts-compat-list`
- `/ts-compat-enable pack=<id> enabled=<true|false>`
- `/ts-compat-access allowMembers=<true|false>`
- `/ts-compat-bridge-status`
- `/ts-compat-bridge-config enabled=<true|false> url=<...> token=<...> timeoutMs=<...>`
- `/ts-compat-install-url url=<https-url>`
- `/ts-compat-import url=<https-url>`
- `/ts-compat-install-json json="<pack-json>"`
- `/ts-compat-remove pack=<id>`
- `/ts-compat-run pack=<id> command=<name> args="key=value ..."`
- `/ts-compat-template`

`ts-compat-install-url` and `ts-compat-import` both support:
- Direct JSON pack URLs.
- Archive URLs (`.ts3_plugin`, `.ts3_addon`, `.ts5addon`, `.zip`) that include an embedded compatibility manifest:
  - `opencom-compat.json`
  - `teamspeak-compat.json`
  - `opencom-pack.json`
  - `opencom-extension.json`

## Access model
- Management commands require owner/admin roles.
- `ts-compat-run` defaults to owner/admin only.
- Set `allowMemberExecution=true` in extension config if you want all members to run pack commands.

## Isolated native bridge flow
Use this when you want a separate process to handle TeamSpeak-native/legacy logic while OpenCom keeps control and permissions.

1. Run the isolated bridge service.
2. Configure extension bridge settings:
   - `/ts-compat-bridge-config url=http://127.0.0.1:3790 enabled=true`
3. Use packs with `action: "native_bridge"` commands.
4. `ts-compat-run` forwards payload to bridge, gets response, and posts result.

Example local bridge:
- `Extensions/Server/teamspeak-compat/examples/native-bridge-service.mjs`
- Run: `node Extensions/Server/teamspeak-compat/examples/native-bridge-service.mjs`
- Optional token: set `TS_NATIVE_BRIDGE_TOKEN`, then configure `token=...` in bridge config.

## Pack format
Use `/ts-compat-template` to get a ready-to-edit JSON template. Minimal format:

```json
{
  "id": "ts-example-pack",
  "name": "TeamSpeak Example Pack",
  "version": "1.0.0",
  "commands": [
    {
      "name": "whoami",
      "action": "reply",
      "template": "client_nickname={username} client_database_id={userId}"
    },
    {
      "name": "ping",
      "action": "opencom_command",
      "target": "ping-tools.ping",
      "argMap": {
        "text": "{message}"
      },
      "passThroughArgs": true
    }
  ]
}
```

`native_bridge` command example:

```json
{
  "name": "native-ping",
  "action": "native_bridge",
  "route": "/v1/execute",
  "requestTemplate": {
    "kind": "native-ping",
    "message": "{message}"
  }
}
```

## TeamSpeak archive imports
For one-step import from TeamSpeak package files, add one of the compatibility manifest filenames above into the archive root (or any folder inside it). The manifest content should match the pack format.

If an imported TeamSpeak package contains native binaries (`.dll`, `.so`, `.dylib`) and no compatibility manifest, import will fail with a clear error. Native TeamSpeak binaries cannot run inside the OpenCom JS extension runtime.

If an archive includes `package.ini` but no compatibility manifest and no native binaries, the importer creates a metadata-only pack with an `about` command so the package can still be tracked.

## Template variables
Available in `template` and `argMap` values:
- `{userId}`
- `{serverId}`
- `{username}`
- `{packId}`
- `{packName}`
- `{command}`
- `{nowIso}`
- `{args.<key>}` or `{<key>}` for parsed runtime args
