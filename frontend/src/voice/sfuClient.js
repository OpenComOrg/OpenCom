const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MIC_GAIN_PERCENT = 100;
const DEFAULT_VOICE_ICE_SERVERS = Object.freeze([
  Object.freeze({
    urls: Object.freeze([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ]),
  }),
]);

export const VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET = "balanced";
export const VOICE_NOISE_SUPPRESSION_PRESETS = Object.freeze({
  strict: Object.freeze({ noiseSuppression: true, echoCancellation: true, autoGainControl: true }),
  balanced: Object.freeze({ noiseSuppression: true, echoCancellation: true, autoGainControl: true }),
  light: Object.freeze({ noiseSuppression: false, echoCancellation: true, autoGainControl: false }),
});

function createVoiceRequestId(prefix = "voice") {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomPart}`;
}

function cloneIceServers(iceServers = []) {
  return iceServers.map((server) => {
    const cloned = {
      urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
    };
    if (typeof server.username === "string" && server.username.trim()) {
      cloned.username = server.username.trim();
    }
    if (server.credential !== undefined && server.credential !== null) {
      cloned.credential = server.credential;
    }
    return cloned;
  });
}

function normalizeProducerSource(kind, source) {
  if (kind === "audio") return "microphone";
  return source === "screen" ? "screen" : "camera";
}

function stopStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try {
      track.stop();
    } catch {}
  }
}

function stopTrack(track) {
  if (!track) return;
  try {
    track.stop();
  } catch {}
}

function normalizeUserAudioPreference(pref = {}) {
  return {
    muted: !!pref.muted,
    volume: Number.isFinite(Number(pref.volume))
      ? Math.max(0, Math.min(200, Number(pref.volume)))
      : 100,
  };
}

export function createSfuVoiceClient({
  selfUserId,
  getSelfUserId,
  sendDispatch,
  waitForEvent,
  debugLog = null,
  onLocalAudioProcessingInfo,
  onRemoteAudioAdded,
  onRemoteAudioRemoved,
  onRemoteVideoAdded,
  onRemoteVideoRemoved,
  onCameraStateChange,
  onScreenShareStateChange,
  onLocalCameraStreamChange,
}) {
  const log = (message, context = {}) => {
    if (typeof debugLog === "function") debugLog(message, context);
  };

  const state = {
    sessionToken: 0,
    guildId: "",
    channelId: "",
    pc: null,
    joinedIceServers: [],
    localStream: null,
    localCameraStream: null,
    localScreenStream: null,
    audioSender: null,
    cameraSender: null,
    screenSender: null,
    isMuted: false,
    isDeafened: false,
    micGainPercent: DEFAULT_MIC_GAIN_PERCENT,
    noiseSuppression: true,
    noiseSuppressionPreset: VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    noiseSuppressionConfig: {
      ...VOICE_NOISE_SUPPRESSION_PRESETS[
        VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET
      ],
    },
    audioInputDeviceId: "",
    audioOutputDeviceId: "",
    selfMonitorAudio: null,
    selfMonitorActive: false,
    userAudioPrefsByUserId: new Map(),
    remoteTrackMetaByProducerId: new Map(),
    remoteMediaByProducerId: new Map(),
    negotiationInFlight: false,
    renegotiateQueued: false,
  };

  function resolveSelfUserId() {
    if (typeof getSelfUserId === "function") {
      return String(getSelfUserId() || "").trim();
    }
    return String(selfUserId || "").trim();
  }

  function getContext() {
    return { guildId: state.guildId, channelId: state.channelId };
  }

  function resolveIceServers(joined = []) {
    const normalized = Array.isArray(joined) && joined.length
      ? cloneIceServers(joined)
      : cloneIceServers(DEFAULT_VOICE_ICE_SERVERS);
    return normalized;
  }

  function emitLocalAudioProcessingInfo() {
    onLocalAudioProcessingInfo?.({
      active: !!state.localStream?.getAudioTracks?.()?.length,
      micGainPercent: state.micGainPercent,
      noiseSuppression: !!state.noiseSuppression,
      preset: state.noiseSuppressionPreset,
    });
  }

  function applyAudioPreferenceToAudio(audio, userId) {
    if (!audio) return;
    const pref = normalizeUserAudioPreference(
      state.userAudioPrefsByUserId.get(userId) || {},
    );
    audio.volume = Math.max(0, Math.min(2, pref.volume / 100));
    audio.muted = !!state.isDeafened || !!pref.muted;
    if (typeof audio.setSinkId === "function") {
      const sinkId = state.audioOutputDeviceId || "default";
      audio.setSinkId(sinkId).catch(() => {});
    }
  }

  function clearSelfMonitorState() {
    const audio = state.selfMonitorAudio;
    state.selfMonitorAudio = null;
    state.selfMonitorActive = false;
    if (!audio) return;
    try {
      audio.pause();
    } catch {}
    try {
      audio.srcObject = null;
    } catch {}
    try {
      audio.remove();
    } catch {}
  }

  function removeRemoteMedia(producerId) {
    const existing = state.remoteMediaByProducerId.get(producerId);
    if (!existing) return;
    state.remoteMediaByProducerId.delete(producerId);
    const { audio, stream, kind } = existing;
    if (audio) {
      try {
        audio.pause();
      } catch {}
      try {
        audio.srcObject = null;
      } catch {}
      try {
        audio.remove();
      } catch {}
    }
    stopStream(stream);
    if (kind === "audio") {
      onRemoteAudioRemoved?.({ producerId, userId: existing.userId });
    } else {
      onRemoteVideoRemoved?.({
        producerId,
        userId: existing.userId,
        source: existing.source,
      });
    }
  }

  function closeConsumersForUser(userId) {
    const normalized = String(userId || "").trim();
    if (!normalized) return;
    for (const [producerId, media] of state.remoteMediaByProducerId.entries()) {
      if (media.userId !== normalized) continue;
      removeRemoteMedia(producerId);
    }
  }

  async function signalTrackMetadata(track, kind, source) {
    if (!track || !state.guildId || !state.channelId) return;
    await sendDispatch("VOICE_TRACK_METADATA", {
      guildId: state.guildId,
      channelId: state.channelId,
      trackId: track.id,
      kind,
      source,
    });
  }

  async function signalTrackStopped(track) {
    if (!track || !state.guildId || !state.channelId) return;
    await sendDispatch("VOICE_TRACK_STOPPED", {
      guildId: state.guildId,
      channelId: state.channelId,
      trackId: track.id,
    }).catch(() => {});
  }

  async function ensurePeerConnection() {
    if (state.pc) return state.pc;
    const pc = new RTCPeerConnection({
      iceServers: resolveIceServers(state.joinedIceServers),
    });

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !state.guildId || !state.channelId) return;
      void sendDispatch("VOICE_WEBRTC_ICE_CANDIDATE", {
        guildId: state.guildId,
        channelId: state.channelId,
        candidate: candidate.toJSON(),
      }).catch(() => {});
    };

    pc.ontrack = ({ track, streams }) => {
      const producerId = String(track.id || "").trim();
      const meta = state.remoteTrackMetaByProducerId.get(producerId) || {};
      const kind = track.kind === "video" ? "video" : "audio";
      const userId = String(meta.userId || "").trim();
      const source = normalizeProducerSource(kind, meta.source);
      const stream = streams?.[0] || new MediaStream([track]);

      removeRemoteMedia(producerId);

      if (kind === "audio") {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        audio.preload = "auto";
        audio.srcObject = stream;
        audio.style.display = "none";
        document.body.appendChild(audio);
        applyAudioPreferenceToAudio(audio, userId);
        audio.play().catch(() => {});
        state.remoteMediaByProducerId.set(producerId, {
          kind,
          userId,
          source,
          stream,
          audio,
        });
        onRemoteAudioAdded?.({
          producerId,
          guildId: state.guildId,
          channelId: state.channelId,
          userId,
          stream,
          source,
        });
        return;
      }

      state.remoteMediaByProducerId.set(producerId, {
        kind,
        userId,
        source,
        stream,
        audio: null,
      });
      onRemoteVideoAdded?.({
        producerId,
        guildId: state.guildId,
        channelId: state.channelId,
        userId,
        stream,
        source,
      });
    };

    pc.onconnectionstatechange = () => {
      log("peer connection state changed", {
        state: pc.connectionState,
      });
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        cleanup().catch(() => {});
      }
    };

    state.pc = pc;
    return pc;
  }

  async function applyAudioInputTrack() {
    const pc = await ensurePeerConnection();
    const constraints = {
      audio: {
        ...(state.audioInputDeviceId
          ? { deviceId: { ideal: state.audioInputDeviceId } }
          : {}),
        noiseSuppression: !!state.noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      },
      video: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const nextTrack = stream.getAudioTracks()[0] || null;
    if (!nextTrack) {
      stopStream(stream);
      throw new Error("MICROPHONE_TRACK_MISSING");
    }

    const previousStream = state.localStream;
    const previousTrack = previousStream?.getAudioTracks?.()?.[0] || null;
    state.localStream = stream;

    if (state.audioSender) {
      await state.audioSender.replaceTrack(nextTrack);
    } else {
      state.audioSender = pc.addTrack(nextTrack, stream);
    }

    if (previousTrack && previousTrack.id !== nextTrack.id) {
      await signalTrackStopped(previousTrack);
    }
    stopStream(previousStream);
    nextTrack.enabled = !state.isMuted;
    await signalTrackMetadata(nextTrack, "audio", "microphone");
    emitLocalAudioProcessingInfo();
  }

  async function syncOffer(reason = "sync") {
    const pc = state.pc;
    if (!pc || !state.guildId || !state.channelId) return;
    if (state.negotiationInFlight) {
      state.renegotiateQueued = true;
      return;
    }
    if (pc.signalingState !== "stable") {
      state.renegotiateQueued = true;
      return;
    }

    state.negotiationInFlight = true;
    try {
      const requestId = createVoiceRequestId(`webrtc-${reason}`);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendDispatch("VOICE_WEBRTC_OFFER", {
        guildId: state.guildId,
        channelId: state.channelId,
        sdp: offer.sdp,
        type: offer.type,
        requestId,
      });

      const answer = await waitForEvent({
        type: "VOICE_WEBRTC_ANSWER",
        guildId: state.guildId,
        channelId: state.channelId,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        match: (data) => data?.requestId === requestId,
      });

      if (!state.pc || state.pc !== pc) return;
      await pc.setRemoteDescription({
        type: "answer",
        sdp: String(answer?.sdp || ""),
      });
    } finally {
      state.negotiationInFlight = false;
      if (state.renegotiateQueued) {
        state.renegotiateQueued = false;
        queueMicrotask(() => {
          syncOffer("queued").catch(() => {});
        });
      }
    }
  }

  async function join({
    guildId,
    channelId,
    audioInputDeviceId = "",
    micGain = DEFAULT_MIC_GAIN_PERCENT,
    noiseSuppression = true,
    noiseSuppressionPreset = VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    noiseSuppressionConfig = null,
    isMuted = false,
    isDeafened = false,
    audioOutputDeviceId = "",
  } = {}) {
    if (!guildId || !channelId) throw new Error("VOICE_CONTEXT_REQUIRED");

    await cleanup();

    state.sessionToken += 1;
    state.guildId = guildId;
    state.channelId = channelId;
    state.audioInputDeviceId = audioInputDeviceId || "";
    state.audioOutputDeviceId = audioOutputDeviceId || "";
    state.micGainPercent = micGain || DEFAULT_MIC_GAIN_PERCENT;
    state.noiseSuppression = !!noiseSuppression;
    state.noiseSuppressionPreset =
      noiseSuppressionPreset || VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET;
    state.noiseSuppressionConfig = noiseSuppressionConfig || {
      ...VOICE_NOISE_SUPPRESSION_PRESETS[state.noiseSuppressionPreset],
    };
    state.isMuted = !!isMuted;
    state.isDeafened = !!isDeafened;

    const requestId = createVoiceRequestId("voice-join");
    await sendDispatch("VOICE_JOIN", { guildId, channelId, requestId });
    const joined = await waitForEvent({
      type: "VOICE_JOINED",
      guildId,
      channelId,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      match: (data) => data?.requestId === requestId,
    });

    state.joinedIceServers = cloneIceServers(joined?.iceServers || []);
    await ensurePeerConnection();
    await applyAudioInputTrack();
    setAudioOutputDevice(audioOutputDeviceId);
    await syncOffer("join");
  }

  async function cleanup() {
    clearSelfMonitorState();

    for (const producerId of [...state.remoteMediaByProducerId.keys()]) {
      removeRemoteMedia(producerId);
    }
    state.remoteTrackMetaByProducerId.clear();

    const pc = state.pc;
    state.pc = null;
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {}
    }

    const localAudioTrack = state.localStream?.getAudioTracks?.()?.[0] || null;
    const localCameraTrack =
      state.localCameraStream?.getVideoTracks?.()?.[0] || null;
    const localScreenTrack =
      state.localScreenStream?.getVideoTracks?.()?.[0] || null;

    await signalTrackStopped(localAudioTrack);
    await signalTrackStopped(localCameraTrack);
    await signalTrackStopped(localScreenTrack);

    stopStream(state.localStream);
    stopStream(state.localCameraStream);
    stopStream(state.localScreenStream);

    state.localStream = null;
    state.localCameraStream = null;
    state.localScreenStream = null;
    state.audioSender = null;
    state.cameraSender = null;
    state.screenSender = null;
    state.negotiationInFlight = false;
    state.renegotiateQueued = false;
    state.joinedIceServers = [];

    onCameraStateChange?.(false);
    onScreenShareStateChange?.(false);
    onLocalCameraStreamChange?.(null);
    emitLocalAudioProcessingInfo();
  }

  async function startCamera() {
    const pc = await ensurePeerConnection();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    const track = stream.getVideoTracks()[0] || null;
    if (!track) {
      stopStream(stream);
      throw new Error("CAMERA_TRACK_MISSING");
    }

    const previousTrack =
      state.localCameraStream?.getVideoTracks?.()?.[0] || null;
    if (state.cameraSender) {
      await state.cameraSender.replaceTrack(track);
    } else {
      state.cameraSender = pc.addTrack(track, stream);
    }
    state.localCameraStream = stream;
    if (previousTrack && previousTrack.id !== track.id) {
      await signalTrackStopped(previousTrack);
    }

    track.addEventListener(
      "ended",
      () => {
        stopCamera().catch(() => {});
      },
      { once: true },
    );

    await signalTrackMetadata(track, "video", "camera");
    onLocalCameraStreamChange?.(stream);
    onCameraStateChange?.(true);
    await syncOffer("camera-start");
  }

  async function stopCamera({ notifyServer = true } = {}) {
    const stream = state.localCameraStream;
    const track = stream?.getVideoTracks?.()?.[0] || null;
    if (notifyServer) {
      await signalTrackStopped(track);
    }
    stopStream(stream);
    state.localCameraStream = null;
    if (state.pc && state.cameraSender) {
      try {
        state.pc.removeTrack(state.cameraSender);
      } catch {}
    }
    state.cameraSender = null;
    onLocalCameraStreamChange?.(null);
    onCameraStateChange?.(false);
    if (state.pc) {
      await syncOffer("camera-stop");
    }
  }

  async function startScreenShare() {
    const pc = await ensurePeerConnection();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const track = stream.getVideoTracks()[0] || null;
    if (!track) {
      stopStream(stream);
      throw new Error("SCREEN_TRACK_MISSING");
    }

    const previousTrack =
      state.localScreenStream?.getVideoTracks?.()?.[0] || null;
    if (state.screenSender) {
      await state.screenSender.replaceTrack(track);
    } else {
      state.screenSender = pc.addTrack(track, stream);
    }
    state.localScreenStream = stream;
    if (previousTrack && previousTrack.id !== track.id) {
      await signalTrackStopped(previousTrack);
    }

    track.addEventListener(
      "ended",
      () => {
        stopScreenShare().catch(() => {});
      },
      { once: true },
    );

    await signalTrackMetadata(track, "video", "screen");
    onScreenShareStateChange?.(true);
    await syncOffer("screen-start");
  }

  async function stopScreenShare({ notifyServer = true } = {}) {
    const stream = state.localScreenStream;
    const track = stream?.getVideoTracks?.()?.[0] || null;
    if (notifyServer) {
      await signalTrackStopped(track);
    }
    stopStream(stream);
    state.localScreenStream = null;
    if (state.pc && state.screenSender) {
      try {
        state.pc.removeTrack(state.screenSender);
      } catch {}
    }
    state.screenSender = null;
    onScreenShareStateChange?.(false);
    if (state.pc) {
      await syncOffer("screen-stop");
    }
  }

  function setMuted(nextMuted) {
    state.isMuted = !!nextMuted;
    const track = state.localStream?.getAudioTracks?.()?.[0] || null;
    if (track) {
      track.enabled = !state.isMuted;
    }
  }

  function setDeafened(nextDeafened) {
    state.isDeafened = !!nextDeafened;
    for (const media of state.remoteMediaByProducerId.values()) {
      if (media.audio) {
        applyAudioPreferenceToAudio(media.audio, media.userId || "");
      }
    }
  }

  async function setMicGain(nextMicGain) {
    state.micGainPercent = Number.isFinite(Number(nextMicGain))
      ? Math.max(0, Math.min(200, Number(nextMicGain)))
      : DEFAULT_MIC_GAIN_PERCENT;
    emitLocalAudioProcessingInfo();
  }

  async function setNoiseSuppression(nextNoiseSuppression) {
    state.noiseSuppression = !!nextNoiseSuppression;
    if (state.guildId && state.channelId) {
      await applyAudioInputTrack();
      await syncOffer("audio-refresh");
    }
  }

  function setNoiseSuppressionConfig(nextProfile = {}) {
    state.noiseSuppressionConfig = { ...state.noiseSuppressionConfig, ...nextProfile };
    emitLocalAudioProcessingInfo();
  }

  async function setAudioInputDevice(deviceId) {
    state.audioInputDeviceId = deviceId || "";
    if (state.guildId && state.channelId) {
      await applyAudioInputTrack();
      await syncOffer("audio-device");
    }
  }

  function setUserAudioPreference(userId, pref = {}) {
    const key = String(userId || "").trim();
    if (!key) return;
    state.userAudioPrefsByUserId.set(key, normalizeUserAudioPreference(pref));
    for (const media of state.remoteMediaByProducerId.values()) {
      if (media.userId !== key || !media.audio) continue;
      applyAudioPreferenceToAudio(media.audio, key);
    }
  }

  function setAudioOutputDevice(deviceId) {
    state.audioOutputDeviceId = deviceId || "";
    for (const media of state.remoteMediaByProducerId.values()) {
      if (!media.audio) continue;
      applyAudioPreferenceToAudio(media.audio, media.userId || "");
    }
    if (
      state.selfMonitorAudio &&
      typeof state.selfMonitorAudio.setSinkId === "function"
    ) {
      const sinkId = state.audioOutputDeviceId || "default";
      state.selfMonitorAudio.setSinkId(sinkId).catch(() => {});
    }
  }

  async function startSelfMonitor() {
    if (state.selfMonitorActive && state.selfMonitorAudio) return;
    const localTrack = state.localStream?.getAudioTracks?.()?.[0] || null;
    if (!localTrack) throw new Error("MIC_TEST_NOT_READY");

    clearSelfMonitorState();
    state.selfMonitorActive = true;

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    audio.preload = "auto";
    audio.muted = false;
    audio.style.display = "none";
    audio.srcObject = new MediaStream([localTrack]);
    document.body.appendChild(audio);

    if (typeof audio.setSinkId === "function" && state.audioOutputDeviceId) {
      await audio.setSinkId(state.audioOutputDeviceId).catch(() => {});
    }

    await audio.play();
    state.selfMonitorAudio = audio;
  }

  async function stopSelfMonitor() {
    clearSelfMonitorState();
  }

  function getLocalStream() {
    return state.localStream;
  }

  function getLocalCameraStream() {
    return state.localCameraStream;
  }

  async function handleGatewayDispatch(type, data) {
    if (!type || !state.guildId || !state.channelId) return;

    if (type === "VOICE_RENEGOTIATE_REQUIRED") {
      await syncOffer("server");
      return;
    }

    if (type === "VOICE_WEBRTC_ANSWER") {
      return;
    }

    if (type === "VOICE_WEBRTC_ICE_CANDIDATE") {
      if (!state.pc || !data?.candidate?.candidate) return;
      await state.pc.addIceCandidate(data.candidate).catch(() => {});
      return;
    }

    if (type === "VOICE_TRACK_AVAILABLE" && data?.producerId) {
      state.remoteTrackMetaByProducerId.set(String(data.producerId), {
        producerId: String(data.producerId),
        userId: String(data.userId || ""),
        kind: String(data.kind || ""),
        source: normalizeProducerSource(data.kind, data.source),
      });
      return;
    }

    if (type === "VOICE_TRACK_REMOVED" && data?.producerId) {
      removeRemoteMedia(String(data.producerId));
      state.remoteTrackMetaByProducerId.delete(String(data.producerId));
      return;
    }

    if (type === "VOICE_USER_LEFT" && data?.userId) {
      closeConsumersForUser(data.userId);
      return;
    }
  }

  return {
    join,
    cleanup,
    handleGatewayDispatch,
    closeConsumersForUser,
    setMuted,
    setDeafened,
    setMicGain,
    setNoiseSuppression,
    setNoiseSuppressionConfig,
    setAudioInputDevice,
    setUserAudioPreference,
    setAudioOutputDevice,
    startSelfMonitor,
    stopSelfMonitor,
    startCamera,
    stopCamera,
    startScreenShare,
    stopScreenShare,
    getLocalStream,
    getLocalCameraStream,
    getContext,
  };
}
