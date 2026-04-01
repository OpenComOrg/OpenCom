# OpenCom Extension SDK Guide

**[NOTICE] AI WRITTEN DOCUMENTATION THIS IS GOING TO BE REWRITTEN AND IS ONLY TEMPORARY TO HAVE SOMETHING HERE MY APPOLOGIES**

Use this with the static docs page at `docs/site/extensions-sdk.html`.

## Layout

```text
Extensions/
  Server/
    my-extension/
      extension.json
      index.js
```

## Manifest

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "author": "you",
  "version": "1.0.0",
  "scope": "server",
  "entry": "index.js",
  "permissions": ["all"],
  "configDefaults": { "featureEnabled": true }
}
```

## Commands + Config

```js
import { command, defineConfig, optionString } from "opencom-extension-sdk";

export const configDefaults = defineConfig({
  pingPrefix: "pong"
});

export const commands = [
  command({
    name: "ping",
    options: [optionString("target", "optional", false)],
    async execute(ctx) {
      const cfg = await ctx.config.get();
      return {
        content: `${cfg.pingPrefix} ${String(ctx.args.target || ctx.userId)}`
      };
    }
  })
];
```

Runtime command name: `my-extension.ping`.

## New API Helpers

- `apis.servers.refreshMembershipToken(serverId)`
- `apis.servers.reorder(serverIds)`
- `apis.servers.updateProfile(serverId, payload)`
- `apis.invites.joinFromInput(codeOrUrl, payload?)`
- `apis.nodeGuilds.kickMember(...)`, `banMember(...)`, `unbanMember(...)`
- `apis.nodeGuilds.reorderChannels(guildId, items)`
- `apis.attachments.upload(...)`
- `apis.extensions.serverConfig(...)`, `setServerConfig(...)`

## Realtime Extension Lifecycle

Enabling/disabling extensions updates active commands immediately on the server node. No node restart required.

## Publish SDK

SDK package lives in `Extensions/lib` and is published via `.github/workflows/publish-extension-sdk.yml` (`NPM_TOKEN` required).
