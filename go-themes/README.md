# Go Themes

Dedicated Go service for theme catalog and user theme CRUD.

Integration pattern:
- core authenticates the user
- core proxies public and authenticated theme routes here using `x-core-internal-secret`
- authenticated calls also pass `x-auth-user-id`
