FROM golang:1.25-bookworm AS build

WORKDIR /src/go-themes

COPY go-themes/go.mod go-themes/go.sum ./
RUN go mod download

COPY go-themes/ ./

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/go-themes ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=build /out/go-themes /app/go-themes

ENV PORT=3012

EXPOSE 3012

ENTRYPOINT ["/app/go-themes"]
