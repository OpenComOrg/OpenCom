# Voice Debugging + Logging Controls

## Logging controls

### Backend (`backend/packages/server-node`)
- Default: request-by-request HTTP logs are disabled.
- `DEBUG_HTTP=1`: enables verbose HTTP request/response debug logs.
- `DEBUG_VOICE=1`: enables `/debug/voice` diagnostics endpoint.
- `LOG_LEVEL=debug|info|warn|error`: adjusts logger verbosity.

Warnings/errors are emitted with `!!! WARN` / `!!! ERROR` prefixes and include voice correlation context (`connId`, `userId`, `guildId`, `channelId`, `transportId`, etc.).

### Frontend (`frontend`)
- `VITE_DEBUG_VOICE=1` or `localStorage.setItem("opencom_debug_voice", "1")` enables verbose SFU/client logs.
- Logs include gateway readiness checks, transport state transitions, consumer track state, and autoplay failures.

## Voice failure checklist

1. Open two browser clients in same voice channel.
2. In the frontend console, confirm:
   - `canUseRealtimeVoiceGateway` shows `usable: true`
   - send/recv `transport connectionstatechange` reaches `connected`
   - `audio.play() resolved` appears for remote producer audio
3. In backend logs, verify flow order per connection:
   - `VOICE_JOIN`
   - `transport created` (send + recv)
   - `transport connected`
   - `producer created`
   - `consumer created`
4. Open `chrome://webrtc-internals` and check both peers:
   - selected candidate pair is set
   - `bytesSent` and `bytesReceived` are increasing
5. If you receive `VOICE_ERROR`, inspect `details` field in payload and logs for root cause code (`TRANSPORT_NOT_FOUND`, `CANNOT_CONSUME`, `MEDIASOUP_WORKER_DIED`, etc.).

## REST fallback behavior

REST voice join mode updates voice state but does **not** provide SFU media playback. By default, fallback is disabled to avoid false "connected" UX.

For diagnostics only, you can enable it with:
- `VITE_ENABLE_REST_VOICE_FALLBACK=1`
