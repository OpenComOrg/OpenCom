FROM golang:1.25-bookworm AS build

WORKDIR /src/go-linkpreview

COPY go-linkpreview/go.mod go-linkpreview/go.sum ./
RUN go mod download

COPY go-linkpreview/ ./

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/go-linkpreview ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=build /out/go-linkpreview /app/go-linkpreview

ENV PORT=3010

EXPOSE 3010

ENTRYPOINT ["/app/go-linkpreview"]
