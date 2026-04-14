# Go Downloads

Dedicated Go service for OpenCom desktop/mobile artifact metadata and downloads.

Responsibilities:
- latest desktop release metadata
- active client build lookup/listing
- artifact file download streaming

Integration pattern:
- core proxies public download routes here with `x-core-internal-secret`
