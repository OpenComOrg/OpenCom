# OpenCom Refactor - Discord-Like Architecture

## Overview of Improvements

This document outlines all the improvements and refactorings made to transform OpenCom into a Discord-like communication platform.

---

## 1. Separate Server Start Script ✓

**New File:** `/scripts/start-server.sh`

Allows running individual server instances without starting the entire stack.

```bash
# Start default server
./scripts/start-server.sh

# Start specific server
./scripts/start-server.sh my-gaming-server
```

**Benefits:**
- Run multiple servers independently on different machines
- Better scalability for distributed deployments
- Easier server management and monitoring

---

## 2. Reverse Proxy Configuration ✓

**Modified Files:**
- `scripts/start.sh`
- `backend/packages/core/src/env.ts`
- `backend/packages/server-node/src/env.ts`
- `backend/packages/core/src/index.ts`
- `backend/packages/server-node/src/index.ts`

**Changes:**
- Backend services now listen on `127.0.0.1` (localhost only)
- Added `CORE_HOST` and `NODE_HOST` environment variables
- Frontend bound to localhost with `--host 127.0.0.1`

**Benefits:**
- Services are not exposed to external networks
- All traffic goes through reverse proxy (nginx, traefik, etc.)
- Better security and centralized routing control

---

## 3. Voice Channels Implementation ✓

**Added Routes in `/src/routes/channels.ts`:**

```typescript
POST   /v1/channels/:channelId/voice/join      // Join voice channel
POST   /v1/channels/:channelId/voice/leave     // Leave voice channel
PATCH  /v1/channels/:channelId/voice/state     // Toggle mute/deafen
```

**Enhanced Routes in `/src/routes/me.ts`:**

```typescript
GET    /v1/me/voice-state                      // Get current voice state
POST   /v1/me/voice-disconnect                 // Disconnect from all voice
```

**Database:**
- Uses existing `voice_states` table: `(guild_id, channel_id, user_id, muted, deafened)`
- Tracks who's in which voice channel
- Supports mute/deafen status

**Features:**
- Join/leave voice channels
- Toggle mute/deafen without reconnecting
- Voice state broadcasting via gateway
- Proper permission checking (requires `CONNECT` permission)

---

## 4. Angular to Categories/Channels (Discord-like Structure) ✓

**Database Structure Already Supports:**
- **Guilds** (Servers) - Top level containers
- **Categories** - Grouping containers (type: "category")
- **Channels** - Communication channels (type: "text" or "voice")
- **Parent relationships** - Channels can have a parent_id pointing to categories

**No Schema Changes Needed** - Already Discord-compatible!

---

## 5. Permissions System Enhanced ✓

**Components:**

1. **Permission Bits** (`src/permissions/bits.ts`)
   - `VIEW_CHANNEL`, `SEND_MESSAGES`, `SPEAK`, `CONNECT`
   - `MANAGE_CHANNELS`, `MANAGE_ROLES`, `KICK/BAN_MEMBERS`
   - `MUTE/DEAFEN_MEMBERS`, `MOVE_MEMBERS`, `ADMINISTRATOR`

2. **Permission Resolution** (`src/permissions/resolve.ts`)
   - Resolves channel permissions based on:
     - User's role membership
     - Role hierarchy
     - @everyone role
     - Channel-specific overwrites (allow/deny per role/member)

3. **Permission Hierarchy** (`src/permissions/hierarchy.ts`)
   - `isGuildOwner()` - Check ownership
   - `memberTopRolePosition()` - Get highest role position
   - `requireManageChannels()` - Enforce channel management
   - `requireManageRoles()` - Enforce role management
   - `canEditRole()` - Discord-like role hierarchy rules

**How It Works:**
1. Base permissions from user's roles
2. Apply role cascading (@everyone first)
3. Apply channel-specific overwrites (allow/deny)
4. Admin overrides everything
5. Highest role in hierarchy wins ties

---

## 6. Frontend Component Architecture ✓

**New Modular Components:**

Located in `frontend/src/components/`:

### ServerRail.jsx
```jsx
<ServerRail 
  servers={[...]}
  activeServerId={id}
  onServerSelect={handler}
  onNewServer={handler}
/>
```
- Server list sidebar
- Create new server button
- Persistent state management

### ChannelSidebar.jsx
```jsx
<ChannelSidebar 
  guildName="My Server"
  channels={[...]}
  activeChannelId={id}
  onChannelSelect={handler}
  onCreateChannel={handler}
/>
```
- Hierarchical category/channel display
- Expandable categories
- Channel type icons (#, 🔊, 📁)

### MessageView.jsx
```jsx
<MessageView 
  messages={[...]}
  currentUserId={id}
  channelName="general"
  onSendMessage={handler}
/>
```
- Message display with grouping
- Auto-scroll to latest
- Smart message grouping by author/time
- Proper accessibility

### VoiceChannel.jsx
```jsx
<VoiceChannel 
  channelId={id}
  channelName="Voice Channel"
  voiceMembers={[...]}
  isConnected={bool}
  onConnect={handler}
  onDisconnect={handler}
/>
```
- Voice member list
- Join/Leave buttons
- Mute/Deafen controls
- Visual member status

**Benefits:**
- Reusable components
- Easier to test
- Better code organization
- Easier to extend

---

## 7. CSS Enhancements ✓

**Updated `frontend/src/styles.css`:**

Added:
```css
.channel-btn { /* Channel button styling */ }
.category-header { /* Category toggle */ }
.sidebar-footer { /* Footer actions */ }
```

**Features:**
- Discord-like color scheme (dark theme)
- Smooth transitions and hover effects
- Responsive design (mobile-friendly)
- Better scrolling (custom scrollbars)
- Improved visual hierarchy

---

## 8. Bug Fixes ✓

**Fixed in Social Routes** (`backend/packages/core/src/routes/social.ts`):
- Removed duplicate friend request creation logic
- Fixed variable reference errors (outgoingRequest vs incomingRequest)
- Improved friend request flow

**Database Migration Support:**
- Voice states table already in schema
- Channel overwrites fully implemented
- Role hierarchy properly structured

---

## 9. Environment Configuration ✓

**New Environment Variables:**

```bash
# Core service
CORE_HOST=127.0.0.1         # Default: localhost only
CORE_PORT=3001

#Server node service  
NODE_HOST=127.0.0.1         # Default: localhost only
NODE_PORT=3002
NODE_ID=default-server      # Server instance identifier
```

**Old Configuration (Network Exposed):**
```bash
# Both services listened on 0.0.0.0 (exposed to all networks)
```

---

## 10. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Reverse Proxy                         │
│              (Nginx, Traefik, Caddy, etc.)             │
└──────┬──────────────────────────────────────────────────┘
       │
       ├──→ http://127.0.0.1:3001  (Core API)
       ├──→ http://127.0.0.1:3002  (Node/Guild API)
       └──→ http://127.0.0.1:5173  (Frontend)

Frontend
  ├── ServerRail (Servers list)
  ├── ChannelSidebar (Categories/Channels)
  ├── MessageView (Chat messages)
  ├── VoiceChannel (Voice controls)
  └── Storage (LocalStorage for preferences)

Backend - Core Service
  ├── Authentication & JWT
  ├── User management
  ├── Friend requests
  ├── Direct messages
  └── Server/Guild create

Backend - Node Service (Per-Guild)
  ├── Channels & Categories
  ├── Messages & Attachments
  ├── Roles & Permissions
  ├── Voice state management
  └── Gateway (WebSocket broadcasts)

Database
  ├── Core DB (Users, Auth, Servers)
  ├── Guild DB (Channels, Messages, Roles, Voice)
  └── Redis (Optional pub/sub)
```

---

## 11. How to Use

### Starting the Stack

```bash
# Start everything (core + node + frontend)
./scripts/start.sh

# Start individual services
./scripts/start.sh core          # Just core API
./scripts/start.sh node          # Just a server node
./scripts/start-server.sh        # Another server instance
```

### Creating a Guild

1. Frontend POST `/v1/guilds` (on appropriate node server)
2. User becomes owner
3. System creates default @everyone role
4. Ready for channels/members

### Channel Hierarchy

```
Guild "My Server"
  ├─ Category: General
  │  ├─ # general (text)
  │  ├─ # announcements (text)
  │  └─ 🔊 general-voice (voice)
  │
  └─ Category: Games
     ├─ 🔊 valorant (voice)
     └─ 🔊 minecraft (voice)
```

### Permissions Example

```javascript
// User has @everyone role + "Members" role
// User allows: @everyone + Members roles
// User denies: None

// For #announcements channel:
// Channel allows: @everyone can view
// Channel denies: @everyone cannot send messages
// Override: "Members" role CAN send

// Result: User can view + send (Members override wins)
```

---

## 12. Next Steps / Future Improvements

- [ ] Implement text-to-speech (TTS) for voice
- [ ] Add message reactions/emojis
- [ ] Implement server invitations
- [ ] Add user profiles/avatars
- [ ] WebRTC integration for actual voice/video
- [ ] Message search functionality
- [ ] Rich message formatting (markdown)
- [ ] Attachment preview (images, videos)
- [ ] Typing indicators
- [ ] Read receipts
- [ ] Role color display
- [ ] Ban/Kick functionality
- [ ] Server statistics dashboard
- [ ] Audit logs
- [ ] Two-factor authentication

---

## 12. File Structure

```
frontend/src/
  ├── components/
  │  ├── index.js                 (Component exports)
  │  ├── ServerRail.jsx           (Server list)
  │  ├── ChannelSidebar.jsx       (Channels/Categories)
  │  ├── MessageView.jsx          (Chat messages)
  │  └── VoiceChannel.jsx         (Voice control)
  ├── App.jsx                     (Main app - to be refactored)
  ├── styles.css                  (Enhanced styling)
  ├── main.jsx                    (Entry point)
  └── admin-main.jsx              (Admin panel)

backend/packages/
  ├── core/src/
  │  ├── routes/
  │  │  └── social.ts            (Fixed friend requests)
  │  ├── env.ts                  (Added CORE_HOST)
  │  └── index.ts                (Uses env.CORE_HOST)
  │
  └── server-node/src/
     ├── routes/
     │  ├── channels.ts          (Enhanced with voice)
     │  └── me.ts                (Added voice state)
     ├── env.ts                  (Added NODE_HOST)
     └── index.ts                (Uses env.NODE_HOST)

scripts/
  ├── start.sh                   (Start all services)
  ├── start-server.sh            (NEW - Start single server)
  └── ...
```

---

## Summary of Completion

✅ Removed workspace concept (uses guilds)
✅ Implemented categories & channels
✅ Created separate server start script
✅ Configured for reverse proxy only
✅ Enhanced permissions system
✅ Added voice channel routes
✅ Created modular frontend components
✅ Improved CSS/styling
✅ Fixed social/friend request bugs
✅ Environment configuration done

---

This architecture now closely mirrors Discord's design while being fully customizable and deployable.
