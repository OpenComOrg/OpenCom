# OpenCom Backend (Core + Server Node)

This workspace contains two services:

- Core API (`packages/core`) for auth, social, presence, invites, server registry, extension catalog, and billing hooks
- Server Node (`packages/server-node`) for guild/channels/messages/roles/attachments/voice/extension command runtime

For a complete endpoint inventory and feature matrix, see:

- `../docs/PLATFORM_GUIDE.md`

## Quick Start

1. `cp .env.example .env`
2. Fill required secrets/config (`CORE_JWT_*`, membership JWKs, DB URLs, `REDIS_URL`, admin password)
3. `docker compose up -d`
4. `npm install`
5. `npm run migrate:core && npm run migrate:node`
6. Start services:
   - Core: `npm run dev:core`
   - Node: `npm run dev:node`

## Key Backend Features

- Email/password auth with refresh token rotation and session management
- Email verification support (SMTP/Zoho-compatible configuration)
- Presence + rich presence (`/v1/presence/rpc`) without app-id requirement
- Core gateway for realtime dispatch and voice proxy compatibility
- Server registration and membership token issuance for node access
- Invites and social graph (friends/DMs/call signals)
- Extension catalog/config passthrough and command lifecycle
- Discord compatibility subset on node under `/api/v9/*`

## JWK Generation (One-Time)

Use node to generate an RS256 JWK pair:

- `node -e "const {generateKeyPair} = require('jose'); (async()=>{ const {publicKey, privateKey}=await generateKeyPair('RS256'); console.log(JSON.stringify(await require('jose').exportJWK(privateKey))); console.log(JSON.stringify(await require('jose').exportJWK(publicKey))); })()"`

Set:

- `CORE_MEMBERSHIP_PRIVATE_JWK`
- `CORE_MEMBERSHIP_PUBLIC_JWK`

Use the same `kid` in both.

## Useful Commands

- Build all backend packages: `npm run build`
- Run voice-debug node mode: `npm run dev:voice-debug`
- Core migrations only: `npm run migrate:core`
- Node migrations only: `npm run migrate:node`
- Send an interactive SMTP test email: `npm run email:test`
