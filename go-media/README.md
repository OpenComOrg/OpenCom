# Go Media Service

This is the first Go rewrite slice for OpenCom voice/media.

What it does today:
- validates the existing OpenCom media JWTs
- exposes the same core media service routes used by the current backend
- provides a compatible WebSocket gateway at `/gateway`
- manages in-memory room/session membership, voice state, speaking updates, and forced disconnect flows
- runs a real Go WebRTC relay path using Pion with one `RTCPeerConnection` per participant

What it does not do yet:
- persist room state beyond process memory
- provide multi-node room distribution
- implement advanced SFU policies like simulcast/SVC selection or bandwidth adaptation

Why this shape:
- it is integratable with the existing codebase now because the node/backend can point `MEDIA_SERVER_URL` / `MEDIA_WS_URL` at this service without changing the media-token format
- it is safer for GCP because signaling/control-plane concerns are separated from the future UDP-heavy media engine concerns
- it removes the mediasoup dependency from the active media path while keeping the surrounding app integration stable

## Routes

- `GET /health`
- `GET /gateway`
- `POST /v1/internal/voice/member-state`
- `POST /v1/internal/voice/disconnect-member`
- `POST /v1/internal/voice/close-room`

## Compatibility Notes

The gateway currently supports:
- `HELLO`
- `IDENTIFY`
- `READY`
- `HEARTBEAT`
- `HEARTBEAT_ACK`
- `DISPATCH/SUBSCRIBE_GUILD`
- `DISPATCH/SUBSCRIBE_CHANNEL`
- `DISPATCH/VOICE_JOIN`
- `DISPATCH/VOICE_LEAVE`
- `DISPATCH/VOICE_SPEAKING`
- `DISPATCH/VOICE_TRACK_METADATA`
- `DISPATCH/VOICE_TRACK_STOPPED`
- `DISPATCH/VOICE_WEBRTC_OFFER`
- `DISPATCH/VOICE_WEBRTC_ICE_CANDIDATE`
- `DISPATCH/VOICE_WEBRTC_ANSWER`
- `DISPATCH/VOICE_RENEGOTIATE_REQUIRED`
- `DISPATCH/VOICE_TRACK_AVAILABLE`
- `DISPATCH/VOICE_TRACK_REMOVED`

The browser client in `frontend/src/voice/sfuClient.js` now uses standard WebRTC signaling instead of mediasoup-client transport semantics.

## GCP Design

- `cloud-run` mode is suitable for signaling/control-plane only
- `gce` or `gke` modes are intended for the future UDP/media plane
- `hybrid` mode is the recommended long-term shape for GCP:
  Cloud Run or GKE for app/signaling control, and a dedicated UDP-capable media plane for RTP/ICE

## Local Run

```bash
cd go-media
cp .env.example .env
CGO_ENABLED=0 go run ./cmd/api
```
