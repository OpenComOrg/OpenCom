# Go Link Preview

Dedicated Go service for OpenCom link preview resolution.

Responsibilities:
- fetch and parse external page metadata
- enforce SSRF-safe preview target rules
- resolve OpenCom invite and gift previews from the core database

Integration pattern:
- core still authenticates the user
- core proxies `/v1/link-preview` to this service using `x-core-internal-secret`
