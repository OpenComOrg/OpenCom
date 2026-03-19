# OpenCom Support Portal

Standalone support portal for:

- `support.opencom.online` for public ticket creation and ticket tracking
- `supadmin.opencom.online` for staff ticket management

## Run locally

```bash
cd support
npm run dev
```

This starts a tiny zero-dependency Node server on `http://localhost:5174`.

## Notes

- The portal talks directly to the core API (`http://localhost:3001` by default in local dev, `https://api.opencom.online` on `*.opencom.online`)
- Both the public and admin pages include a Core API override field so you can point them at another environment without editing files
- The server automatically serves `admin.html` at `/` when the host begins with `supadmin.`
