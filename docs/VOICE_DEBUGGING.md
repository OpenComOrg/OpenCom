# Voice Debugging + Logging Controls


**[NOTICE] AI WRITTEN DOCUMENTATION THIS IS GOING TO BE REWRITTEN AND IS ONLY TEMPORARY TO HAVE SOMETHING HERE MY APPOLOGIES**
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
- The SFU client now attempts ICE restart automatically when a transport becomes `disconnected` or `failed`.
- By default, ICE servers now come from the server-node during `VOICE_JOIN`.
- `VITE_VOICE_ICE_SERVERS` accepts a JSON array of `RTCIceServer` entries for STUN/TURN.
- `VITE_VOICE_ICE_TRANSPORT_POLICY=relay` forces TURN-only relay candidates when needed.
- `localStorage.setItem("opencom_voice_ice_servers", JSON.stringify([...]))` overrides ICE servers locally for debugging.
- `localStorage.setItem("opencom_voice_ice_transport_policy", "relay")` forces relay mode locally for debugging.

### Server-node (`backend/packages/server-node`)
- `VOICE_STUN_URLS` configures default STUN URLs returned to clients.
- `VOICE_TURN_URLS` configures TURN relay URLs returned to clients.
- `VOICE_TURN_SECRET` enables coturn-style time-limited credentials generated on the server.
- `VOICE_TURN_TTL_SECONDS` controls TURN credential lifetime.

Example:

```json
[
  { "urls": ["stun:stun.l.google.com:19302"] },
  {
    "urls": ["turns:turn.example.com:443?transport=tcp"],
    "username": "opencom",
    "credential": "replace-me"
  }
]
```

## Voice failure checklist

1. Open two browser clients in same voice channel.
2. In the frontend console, confirm:
   - `canUseRealtimeVoiceGateway` shows `usable: true`
   - send/recv `transport connectionstatechange` reaches `connected`
   - no repeated `transport icecandidateerror` for your configured STUN/TURN URLs
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
5. In Firefox, also inspect `about:webrtc` for failed ICE candidate pairs and STUN/TURN errors.
6. If you receive `VOICE_ERROR`, inspect `details` field in payload and logs for root cause code (`TRANSPORT_NOT_FOUND`, `CANNOT_CONSUME`, `MEDIASOUP_WORKER_DIED`, etc.).

## Networking reality

OpenCom voice is SFU-based (`mediasoup`), so the browser connects to the server node. That means:

- The node must advertise a reachable public address via `MEDIASOUP_ANNOUNCED_ADDRESS` (or the legacy `MEDIASOUP_ANNOUNCED_IP` alias).
- Prefer `MEDIASOUP_ANNOUNCED_ADDRESS` for the node's public IP or hostname. `MEDIASOUP_ANNOUNCED_IP` remains a legacy alias.
- If both announced-address variables are blank, OpenCom will try to infer the address from `PUBLIC_BASE_URL` when that host is not loopback.
- The node must have `MEDIASOUP_RTC_MIN_PORT` to `MEDIASOUP_RTC_MAX_PORT` open over UDP and TCP.
- STUN/TURN improves browser-side ICE candidate gathering, but it does not replace the need for the node's RTC port range to be reachable.
- If you deploy TURN for stricter NAT/firewall environments, the most common listener ports are `3478` and `5349`, with `443/TCP` or `443/TLS` often needed on restrictive networks.

For no-TURN deployments, verify the direct path explicitly:

```bash
curl http://127.0.0.1:3002/health
```

The `voice` object now reports:
- `announcedAddress`
- `announcedAddressSource`
- `announcedAddressKind`
- `transportProtocols`
- `warnings`

Typical host firewall examples:

```bash
sudo ufw allow 40000:40100/udp
sudo ufw allow 40000:40100/tcp
```

If your provider has a cloud firewall or security group, open the same range there too. Docker port publishing alone is not enough when the provider firewall still blocks the traffic.

## REST fallback behavior

REST voice join mode updates voice state but does **not** provide SFU media playback. By default, fallback is disabled to avoid false "connected" UX.

For diagnostics only, you can enable it with:
- `VITE_ENABLE_REST_VOICE_FALLBACK=1`
