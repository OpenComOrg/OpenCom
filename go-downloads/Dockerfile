FROM golang:1.25-bookworm AS build

WORKDIR /src/go-downloads

COPY go-downloads/go.mod go-downloads/go.sum ./
RUN go mod download

COPY go-downloads/ ./

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/go-downloads ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=build /out/go-downloads /app/go-downloads
COPY client/package.json /app/client/package.json
COPY frontend/public/downloads /app/frontend/public/downloads

ENV PORT=3011
ENV REPO_ROOT=/app
ENV DOWNLOADS_STORAGE_DIR=/app/frontend/public/downloads

EXPOSE 3011

ENTRYPOINT ["/app/go-downloads"]
