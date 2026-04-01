# OpenCom Platform Guide

**[NOTICE] AI WRITTEN DOCUMENTATION THIS IS GOING TO BE REWRITTEN AND IS ONLY TEMPORARY TO HAVE SOMETHING HERE MY APPOLOGIES**

This guide is the canonical overview of functionality across:

- Web client (`frontend`)
- Desktop client (`client`)
- Android client (`mobile/opencom-android`)
- Admin panel (`panel`)
- Support portal (`support`)
- Core API (`backend/packages/core`)
- Server Node API (`backend/packages/server-node`)

It is intended to be inclusive of current platform behavior in this repository.

## Architecture

- Core API:
  - Accounts/authentication
  - Profile and social graph
  - Presence and rich presence
  - Server registry + invites
  - Membership token issuance for server nodes
  - Extension catalog/config proxy
  - Optional billing/subscriptions
- Server Node API:
  - Guild/channel/message state
  - Role/member moderation
  - Voice state and SFU signaling
  - Attachments and emotes
  - Extension command execution
- Web client:
  - Main end-user experience (servers, channels, DMs, friends, profile/settings)
- Desktop client:
  - Thin Electron shell that hosts the web client
  - Local RPC bridge for rich presence integration from local apps
- Android client:
  - Mobile-facing OpenCom client built with Expo/React Native
- Admin panel:
  - Separate operational UI for platform administration
- Support portal:
  - Public ticket creation/tracking plus staff-side support handling

## Web Client Feature Set

- Auth:
  - Register/login/refresh
  - Email verification flow (verify link + resend)
  - Session management and password change
- Server experience:
  - Server rail with switching and ordering
  - Guild/channel list and channel messaging
  - Channel/category create/edit/delete controls
  - Context menus for server/channel/category/message/member actions
  - Category/channel drag reorder
  - Channel permission controls by role
- Social:
  - Friends list and add/remove flow
  - Friend requests (incoming/outgoing)
  - DM list, message send/delete, typing-level UX
- Profile/settings:
  - Display name, bio, avatar/banner URL or upload
  - Presence status selection (online/idle/dnd/offline)
  - Rich Presence (RPC-style fields, no app ID)
  - Security settings UI (sessions/password/2FA scaffolding)
- Voice:
  - Voice channel join/leave
  - Gateway/SFU coordination with fallback behavior
  - Device selection and mic/deafen controls
- Extensions:
  - Client extension catalog loading
  - Server extension command discovery and command execution
- UI/UX:
  - Message grouping by author
  - Date separators between day boundaries
  - Pinned messages in server/DM contexts
  - Custom CSS theme support and persistence

## Desktop Client Feature Set

- Vesktop-style thin shell:
  - Loads local built web assets (`frontend/dist` synced into `client/src/web`)
  - Falls back to hosted URL if local assets are unavailable
- Security model:
  - Context isolation enabled
  - Node integration disabled in renderer
  - External link handling via OS browser
- Local rich presence bridge:
  - HTTP listener on `127.0.0.1:6483` by default
  - Bridge endpoints:
    - `GET /rpc/health`
    - `POST /rpc/activity`
    - `DELETE /rpc/activity`
  - Uses logged-in desktop session auth context (local apps do not need OpenCom tokens)

## Android Client Feature Set

- Mobile authentication and session handling
- Server and DM navigation
- Channel and chat screens
- Mobile-focused API/session wrappers
- Android build and crash-capture helper scripts in the package

## Admin And Support Surfaces

- Admin panel:
  - Separate Vite app in `panel`
  - Intended for platform administration workflows
- Support portal:
  - Separate Node-served app in `support`
  - Supports public ticket flows and staff/admin ticket handling

## Core API Surface (`/v1`)

Auth and user:

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/verify-email`
- `POST /v1/auth/resend-verification`
- `POST /v1/auth/refresh`
- `GET /v1/me`
- `GET /v1/auth/sessions`
- `DELETE /v1/auth/sessions/:sessionId`
- `PATCH /v1/auth/password`

Profile and devices:

- `GET /v1/users/:id/profile`
- `PATCH /v1/me/profile`
- `POST /v1/me/profile/pfp`
- `POST /v1/me/profile/banner`
- `GET /v1/profile-images/users/:userId/:filename`
- `POST /v1/devices/register`
- `GET /v1/users/:userId/prekeys`

Presence and gateway:

- `GET /v1/presence`
- `POST /v1/presence/rpc`
- `DELETE /v1/presence/rpc`
- `GET /v1/jwks`
- WebSocket gateway on `/gateway` (presence/social dispatch + voice proxy mode)

Servers and invites:

- `POST /v1/servers/official`
- `POST /v1/servers`
- `GET /v1/servers`
- `POST /v1/servers/:serverId/leave`
- `PATCH /v1/servers/:serverId/profile`
- `POST /v1/servers/reorder`
- `POST /v1/servers/:serverId/membership-token`
- `DELETE /v1/servers/:serverId`
- `POST /v1/invites`
- `GET /v1/invites/:code`
- `POST /v1/invites/join`
- `POST /v1/invites/:code/join`

Social and DMs:

- `GET /v1/social/friends`
- `POST /v1/social/friends`
- `DELETE /v1/social/friends/:friendId`
- `GET /v1/social/requests`
- `POST /v1/social/requests/:requestId/accept`
- `POST /v1/social/requests/:requestId/decline`
- `GET /v1/social/settings`
- `PATCH /v1/social/settings`
- `POST /v1/social/dms/open`
- `GET /v1/social/dms`
- `GET /v1/social/dms/:threadId/messages`
- `POST /v1/social/dms/:threadId/messages`
- `DELETE /v1/social/dms/:threadId/messages/:messageId`
- `POST /v1/social/dms/:threadId/call-signals`
- `GET /v1/social/dms/:threadId/call-signals`

Extensions and operations:

- `GET /v1/extensions/catalog`
- `GET /v1/extensions/client/:extensionId/source`
- `GET /v1/servers/:serverId/extensions`
- `GET /v1/servers/:serverId/extensions/:extensionId/config`
- `PUT /v1/servers/:serverId/extensions/:extensionId/config`
- `POST /v1/servers/:serverId/extensions/:extensionId`
- `POST /v1/internal/node-sync`

Admin and billing:

- `GET /v1/admin/overview`
- `GET /v1/admin/users`
- `POST /v1/admin/users/:userId/platform-admin`
- `POST /v1/admin/founder`
- `POST /v1/admin/users/:userId/badges`
- `GET /v1/me/admin-status`
- `GET /v1/billing/boost`
- `POST /v1/billing/boost/checkout`
- `POST /v1/billing/boost/portal`
- `POST /v1/billing/boost/sync`
- `POST /v1/billing/boost/cancel`

Legacy DM routes retained:

- `POST /v1/dms/create`
- `POST /v1/dms/send`

## Server Node API Surface (`/v1`)

Guild and state:

- `GET /v1/guilds`
- `POST /v1/guilds`
- `POST /v1/guilds/:guildId/join`
- `POST /v1/guilds/:guildId/leave`
- `GET /v1/guilds/:guildId/state`
- `GET /v1/guilds/:guildId/channels`
- `POST /v1/guilds/:guildId/channels`
- `POST /v1/guilds/:guildId/channels/reorder`

Channels, messages, permissions:

- `PATCH /v1/channels/:channelId`
- `DELETE /v1/channels/:channelId`
- `GET /v1/channels/:channelId/messages`
- `POST /v1/channels/:channelId/messages`
- `DELETE /v1/channels/:channelId/messages/:messageId`
- `PUT /v1/channels/:channelId/overwrites`
- `DELETE /v1/channels/:channelId/overwrites`
- `POST /v1/channels/:channelId/sync-permissions`

Roles and members:

- `POST /v1/guilds/:guildId/roles`
- `PATCH /v1/roles/:roleId`
- `DELETE /v1/roles/:roleId`
- `PUT /v1/guilds/:guildId/members/:memberId/roles/:roleId`
- `DELETE /v1/guilds/:guildId/members/:memberId/roles/:roleId`
- `POST /v1/guilds/:guildId/members/:memberId/kick`
- `POST /v1/guilds/:guildId/members/:memberId/ban`
- `DELETE /v1/guilds/:guildId/bans/:memberId`

Voice:

- `GET /v1/me/voice-state`
- `POST /v1/me/voice-disconnect`
- `POST /v1/channels/:channelId/voice/join`
- `POST /v1/channels/:channelId/voice/leave`
- `PATCH /v1/channels/:channelId/voice/state`

Media and extensions:

- `POST /v1/attachments/upload`
- `GET /v1/attachments/:id`
- `GET /v1/guilds/:guildId/emotes`
- `POST /v1/guilds/:guildId/emotes`
- `DELETE /v1/guilds/:guildId/emotes/:emoteId`
- `GET /v1/extensions/catalog`
- `GET /v1/extensions`
- `GET /v1/extensions/commands`
- `GET /v1/extensions/:extensionId/config`
- `PUT /v1/extensions/:extensionId/config`
- `POST /v1/extensions/commands/:commandName/execute`
- `POST /v1/extensions/sync`
- `POST /v1/extensions/activate`
- `POST /v1/extensions/:extensionId/deactivate`

Compatibility routes:

- Discord-like compatibility under `/api/v9/*` for selected guild/channel/message routes.

## Rich Presence (No App ID)

OpenCom rich presence intentionally does not require a Discord-style app registration.

Payload model:

- `name`
- `details`
- `state`
- `largeImageUrl`, `largeImageText`
- `smallImageUrl`, `smallImageText`
- `buttons` (up to 2, each `label` + `url`)
- optional timestamps in backend model for future expansion

Set/clear via Core API:

- `POST /v1/presence/rpc`
- `DELETE /v1/presence/rpc`

Set/clear via desktop local bridge:

- `POST /rpc/activity`
- `DELETE /rpc/activity`

## Build and Run Matrix

- Web client:
  - `cd frontend && npm install && npm run dev`
- Backend:
  - `cd backend && npm install && npm run migrate:core && npm run migrate:node`
  - `npm run dev:core` and `npm run dev:node`
- Desktop:
  - `cd client && npm install && npm start`
  - Packaging: `npm run build:linux` / `npm run build:win`

## Documentation Map

- Setup: `docs/SETUP_GUIDE.md`
- Voice diagnostics: `docs/VOICE_DEBUGGING.md`
- Extensions SDK: `docs/extensions-sdk.md`
- Scripts catalog: `scripts/README.md`

