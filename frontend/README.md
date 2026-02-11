# OpenCom Frontend (React)

Discord-like web client for OpenCom.

## Planned production URLs
- Frontend: `https://opencom.donskyblock.xyz`
- Core API: `https://openapi.donskyblock.xyz`

## Features implemented
- Discord-like multi-surface layout (servers + DMs + friends + profile + controls).
- Owner actions card for creating text/voice channels in the active guild.
- Email/password register + login flow (Core API).
- Server list and switching (Core `/v1/servers`).
- Add server by provider node URL/IP (Core `/v1/servers` with `baseUrl`).
- Invite generation and invite join (Core `/v1/invites`) with metadata preview before joining.
- Guild state + channels + messages from server node APIs.
- Message send in text channels.
- Local DM inbox experience (designed for app-handled DM transport) with per-user persistence in localStorage.
- Friends list UI and quick add workflow for social graph bootstrapping in-app.
- Profile viewing + editing wired to Core profile APIs (`/v1/users/:id/profile`, `/v1/me/profile`).
- Custom CSS theme upload (`.css` file) and live application.
- Theme persistence in `localStorage` and reset button.

## Environment variables
Create `.env` in `frontend/` (optional):

```bash
VITE_CORE_API_URL=https://openapi.donskyblock.xyz
VITE_FRONTEND_URL=https://opencom.donskyblock.xyz
```

## Run locally
```bash
cd frontend
npm install
npm run dev
```

Admin dashboard is available at `http://localhost:5173/admin.html` during dev.

## Build
```bash
cd frontend
npm run build
npm run preview
```

## How custom themes work
1. In the **Custom CSS Theme** card, upload a `.css` file, or paste CSS in the textarea.
2. The CSS is inserted into a `<style id="opencom-theme-style">` tag in `document.head`.
3. The CSS string is saved in `localStorage` key `opencom_custom_theme_css`.
4. Click **Reset Theme** to remove custom CSS.

## Typical Discord-like flow in this client
1. Login/register.
2. Add a server by entering a name + node base URL.
3. Select server from left rail.
4. Pick a text channel and chat.
5. Create invite code and share with others.
6. Recipients join with invite code.
7. Apply optional custom CSS theme for personalized UI.
