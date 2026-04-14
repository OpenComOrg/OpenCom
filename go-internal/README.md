# Go Internal API

Combined internal Go service for the first extracted backend slices.

Responsibilities:
- link previews
- downloads metadata and file serving
- themes catalog and theme CRUD

Integration pattern:
- core proxies internal routes here with `x-core-internal-secret`
- authenticated theme calls also pass `x-auth-user-id`
