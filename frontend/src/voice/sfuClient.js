import * as mediasoupClient from "mediasoup-client";

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MIC_GAIN_PERCENT = 100;
const DEFAULT_VOICE_ICE_SERVERS = Object.freeze([
  Object.freeze({
    urls: Object.freeze([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ]),
  }),
]);
const VOICE_ICE_SERVERS_STORAGE_KEY = "opencom_voice_ice_servers";
const VOICE_ICE_TRANSPORT_POLICY_STORAGE_KEY =
  "opencom_voice_ice_transport_policy";
export const VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET = "strict";
export const VOICE_NOISE_SUPPRESSION_PRESETS = Object.freeze({
  strict: Object.freeze({
    gateOpenRms: 0.022,
    gateCloseRms: 0.016,
    gateAttack: 0.62,
    gateRelease: 0.05,
    highpassHz: 150,
    lowpassHz: 6800,
    compressorThreshold: -50,
    compressorKnee: 20,
    compressorRatio: 12,
    compressorAttack: 0.003,
    compressorRelease: 0.24,
  }),
  balanced: Object.freeze({
    gateOpenRms: 0.014,
    gateCloseRms: 0.01,
    gateAttack: 0.48,
    gateRelease: 0.08,
    highpassHz: 120,
    lowpassHz: 7800,
    compressorThreshold: -45,
    compressorKnee: 28,
    compressorRatio: 10,
    compressorAttack: 0.004,
    compressorRelease: 0.2,
  }),
  light: Object.freeze({
    gateOpenRms: 0.009,
    gateCloseRms: 0.0065,
    gateAttack: 0.35,
    gateRelease: 0.12,
    highpassHz: 80,
    lowpassHz: 9800,
    compressorThreshold: -38,
    compressorKnee: 24,
    compressorRatio: 6,
    compressorAttack: 0.005,
    compressorRelease: 0.16,
  }),
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
    if (
      typeof server.credentialType === "string" &&
      server.credentialType.trim()
    ) {
      cloned.credentialType = server.credentialType.trim();
    }
    return cloned;
  });
}

function normalizeIceServerUrls(urls) {
  const normalized = (Array.isArray(urls) ? urls : [urls])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!normalized.length) return null;
  return normalized.length === 1 ? normalized[0] : normalized;
}

function normalizeIceServer(server) {
  if (!server || typeof server !== "object") return null;
  const urls = normalizeIceServerUrls(server.urls);
  if (!urls) return null;
  const normalized = { urls };
  if (typeof server.username === "string" && server.username.trim()) {
    normalized.username = server.username.trim();
  }
  if (server.credential !== undefined && server.credential !== null) {
    normalized.credential = server.credential;
  }
  if (
    typeof server.credentialType === "string" &&
    server.credentialType.trim()
  ) {
    normalized.credentialType = server.credentialType.trim();
  }
  return normalized;
}

function parseIceServersConfig(rawValue) {
  if (typeof rawValue !== "string") {
    return { explicit: false, iceServers: [], error: null };
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { explicit: false, iceServers: [], error: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return {
      explicit: true,
      iceServers: list.map((entry) => normalizeIceServer(entry)).filter(Boolean),
      error: null,
    };
  } catch (error) {
    return {
      explicit: true,
      iceServers: [],
      error: error instanceof Error ? error : new Error("ICE_CONFIG_PARSE_FAILED"),
    };
  }
}

function readVoiceConfigValue(storageKey, envValue) {
  if (typeof window !== "undefined") {
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue !== null && storedValue.trim()) {
      return { value: storedValue, source: "localStorage" };
    }
  }
  if (typeof envValue === "string" && envValue.trim()) {
    return { value: envValue, source: "env" };
  }
  return { value: null, source: "default" };
}

function normalizeIceTransportPolicy(rawValue) {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "all" || normalized === "relay") return normalized;
  return null;
}

function summarizeIceServerUrls(iceServers = []) {
  return iceServers.flatMap((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.map((value) => String(value || "").trim()).filter(Boolean);
  });
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
  onScreenShareStateChange,
}) {
  const log = (message, context = {}) => {
    if (typeof debugLog === "function") debugLog(message, context);
  };
  const state = {
    sessionToken: 0,
    guildId: "",
    channelId: "",
    device: null,
    sendTransport: null,
    recvTransport: null,
    localAudioProducer: null,
    localScreenProducer: null,
    localStream: null,
    localScreenStream: null,
    localScreenTrackEndedHandler: null,
    consumersByProducerId: new Map(),
    producerOwnerByProducerId: new Map(),
    isMuted: false,
    isDeafened: false,
    noiseSuppression: true,
    noiseSuppressionPreset: VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    noiseSuppressionConfig: {
      ...VOICE_NOISE_SUPPRESSION_PRESETS[
        VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET
      ],
    },
    micGainPercent: DEFAULT_MIC_GAIN_PERCENT,
    audioInputDeviceId: "",
    audioOutputDeviceId: "",
    rawLocalStream: null,
    localAudioContext: null,
    localAudioNodes: null,
    pendingAudioStartByProducerId: new Map(),
    pendingIceRestartByTransportId: new Map(),
    userAudioPrefsByUserId: new Map(),
    selfMonitorAudio: null,
    selfMonitorActive: false,
  };

  function resolveIceConfiguration() {
    const iceServersValue = readVoiceConfigValue(
      VOICE_ICE_SERVERS_STORAGE_KEY,
      import.meta.env.VITE_VOICE_ICE_SERVERS,
    );
    const parsedIceServers = parseIceServersConfig(iceServersValue.value);
    if (parsedIceServers.error) {
      log("voice iceServers config parse failed, falling back to defaults", {
        source: iceServersValue.source,
        error: parsedIceServers.error.message,
      });
    }
    const iceServers =
      parsedIceServers.error || !parsedIceServers.explicit
        ? cloneIceServers(DEFAULT_VOICE_ICE_SERVERS)
        : cloneIceServers(parsedIceServers.iceServers);

    const transportPolicyValue = readVoiceConfigValue(
      VOICE_ICE_TRANSPORT_POLICY_STORAGE_KEY,
      import.meta.env.VITE_VOICE_ICE_TRANSPORT_POLICY,
    );
    const iceTransportPolicy = normalizeIceTransportPolicy(
      transportPolicyValue.value,
    );
    if (transportPolicyValue.value && iceTransportPolicy === null) {
      log("voice iceTransportPolicy config ignored", {
        source: transportPolicyValue.source,
        value: transportPolicyValue.value,
      });
    }

    return {
      iceServers,
      iceServerSource: parsedIceServers.explicit
        ? iceServersValue.source
        : "default-stun",
      iceTransportPolicy:
        iceTransportPolicy && iceTransportPolicy !== "all"
          ? iceTransportPolicy
          : undefined,
    };
  }

  function clearPendingIceRestart(transportId) {
    const pending = state.pendingIceRestartByTransportId.get(transportId);
    if (!pending) return;
    if (pending.timer) window.clearTimeout(pending.timer);
    state.pendingIceRestartByTransportId.delete(transportId);
  }

  async function restartIceForTransport(transport, direction, token, reason) {
    if (!transport?.id || !isActive(token)) return;
    const currentTransport =
      direction === "send" ? state.sendTransport : state.recvTransport;
    if (!currentTransport || currentTransport.id !== transport.id) return;

    const existing = state.pendingIceRestartByTransportId.get(transport.id);
    if (existing?.inProgress) return;
    if (existing?.timer) window.clearTimeout(existing.timer);
    state.pendingIceRestartByTransportId.set(transport.id, {
      timer: null,
      inProgress: true,
    });

    try {
      const requestId = createVoiceRequestId(`restart-ice-${direction}`);
      log("transport restartIce requested", {
        direction,
        transportId: transport.id,
        reason,
      });
      await sendDispatch("VOICE_RESTART_ICE", {
        guildId: state.guildId,
        channelId: state.channelId,
        transportId: transport.id,
        requestId,
      });
      const restarted = await waitForVoiceResponse(() =>
        waitDispatch(
          "VOICE_ICE_RESTARTED",
          (d) =>
            d?.transportId === transport.id && d?.requestId === requestId,
        ),
      );
      if (!isActive(token)) throw new Error("VOICE_SESSION_CANCELLED");
      const latestTransport =
        direction === "send" ? state.sendTransport : state.recvTransport;
      if (!latestTransport || latestTransport.id !== transport.id) {
        throw new Error("VOICE_TRANSPORT_STALE");
      }
      await transport.restartIce({ iceParameters: restarted.iceParameters });
      log("transport restartIce applied", {
        direction,
        transportId: transport.id,
      });
    } catch (error) {
      log("transport restartIce failed", {
        direction,
        transportId: transport.id,
        reason,
        error: String(error?.message || error),
      });
    } finally {
      clearPendingIceRestart(transport.id);
    }
  }

  function scheduleIceRestart(transport, direction, token, reason, delayMs = 0) {
    if (!transport?.id || !isActive(token)) return;
    const existing = state.pendingIceRestartByTransportId.get(transport.id);
    if (existing?.inProgress || existing?.timer) return;
    const timer = window.setTimeout(() => {
      restartIceForTransport(transport, direction, token, reason).catch(
        () => {},
      );
    }, Math.max(0, delayMs));
    state.pendingIceRestartByTransportId.set(transport.id, {
      timer,
      inProgress: false,
    });
  }

  function attachTransportDebugHandlers(transport, direction, token) {
    if (!transport) return;
    transport.on("icegatheringstatechange", (iceGatheringState) => {
      log("transport icegatheringstatechange", {
        direction,
        transportId: transport.id,
        iceGatheringState,
      });
    });
    transport.on("icecandidateerror", (event) => {
      log("transport icecandidateerror", {
        direction,
        transportId: transport.id,
        url: event?.url || "",
        address: event?.address || "",
        port: event?.port || 0,
        errorCode: event?.errorCode || 0,
        errorText: event?.errorText || "",
      });
    });
    transport.on("connectionstatechange", (connectionState) => {
      log("transport connectionstatechange", {
        direction,
        transportId: transport.id,
        connectionState,
      });
      if (connectionState === "connected" || connectionState === "completed") {
        clearPendingIceRestart(transport.id);
        return;
      }
      if (connectionState === "disconnected") {
        scheduleIceRestart(
          transport,
          direction,
          token,
          "connection-disconnected",
          1500,
        );
        return;
      }
      if (connectionState === "failed") {
        scheduleIceRestart(transport, direction, token, "connection-failed");
      }
    });
  }

  function normalizeUserAudioPreference(pref = {}) {
    const muted = !!pref?.muted;
    const volumeRaw = Number(pref?.volume);
    const volume = Number.isFinite(volumeRaw)
      ? Math.max(0, Math.min(100, volumeRaw))
      : 100;
    return { muted, volume };
  }

  function applyAudioPreferenceToAudio(audio, userId) {
    if (!audio) return;
    if (state.isDeafened) {
      audio.volume = 0;
      return;
    }
    const pref = normalizeUserAudioPreference(
      state.userAudioPrefsByUserId.get(userId) || {},
    );
    audio.volume = pref.muted ? 0 : pref.volume / 100;
  }

  function removePendingAudioStart(producerId) {
    const pending = state.pendingAudioStartByProducerId.get(producerId);
    if (!pending) return;
    pending.cleanup();
    state.pendingAudioStartByProducerId.delete(producerId);
  }

  function scheduleAudioStartRetry(audio, producerId) {
    if (
      !audio ||
      !producerId ||
      state.pendingAudioStartByProducerId.has(producerId)
    )
      return;

    const retryStart = () => {
      if (audio.paused) {
        audio
          .play()
          .then(() => {
            removePendingAudioStart(producerId);
          })
          .catch(() => {});
      } else {
        removePendingAudioStart(producerId);
      }
    };

    const events = ["pointerdown", "touchstart", "keydown", "click"];
    events.forEach((eventName) =>
      window.addEventListener(eventName, retryStart, { passive: true }),
    );
    const timer = window.setInterval(retryStart, 1500);

    state.pendingAudioStartByProducerId.set(producerId, {
      cleanup: () => {
        window.clearInterval(timer);
        events.forEach((eventName) =>
          window.removeEventListener(eventName, retryStart),
        );
      },
    });
  }

  function isActive(token) {
    return token === state.sessionToken && !!state.channelId;
  }

  function setScreenSharing(active) {
    onScreenShareStateChange?.(!!active);
  }

  function applyLocalTrackEnabledState() {
    const track = state.localStream?.getAudioTracks?.()?.[0] || null;
    if (!track) return;
    // Keep the local processed track running while self-monitor is active, even if muted.
    track.enabled = !state.isMuted || state.selfMonitorActive;
  }

  function resolveSelfUserId() {
    return getSelfUserId?.() || selfUserId || "";
  }

  function normalizeMicGainPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_MIC_GAIN_PERCENT;
    return Math.max(0, Math.min(200, numeric));
  }

  function clampNoiseValue(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  function normalizeNoiseSuppressionPreset(value) {
    const key = String(value || "")
      .trim()
      .toLowerCase();
    if (key === "custom") return "custom";
    if (VOICE_NOISE_SUPPRESSION_PRESETS[key]) return key;
    return VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET;
  }

  function getNoiseSuppressionPresetConfig(preset) {
    const presetKey = normalizeNoiseSuppressionPreset(preset);
    if (presetKey === "custom")
      return VOICE_NOISE_SUPPRESSION_PRESETS[
        VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET
      ];
    return (
      VOICE_NOISE_SUPPRESSION_PRESETS[presetKey] ||
      VOICE_NOISE_SUPPRESSION_PRESETS[VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET]
    );
  }

  function normalizeNoiseSuppressionConfig(config = {}, fallbackConfig = null) {
    const base =
      fallbackConfig ||
      state.noiseSuppressionConfig ||
      getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset);
    const normalized = {
      gateOpenRms: clampNoiseValue(
        config.gateOpenRms,
        0.004,
        0.06,
        base.gateOpenRms,
      ),
      gateCloseRms: clampNoiseValue(
        config.gateCloseRms,
        0.002,
        0.05,
        base.gateCloseRms,
      ),
      gateAttack: clampNoiseValue(
        config.gateAttack,
        0.05,
        0.95,
        base.gateAttack,
      ),
      gateRelease: clampNoiseValue(
        config.gateRelease,
        0.01,
        0.8,
        base.gateRelease,
      ),
      highpassHz: clampNoiseValue(config.highpassHz, 40, 300, base.highpassHz),
      lowpassHz: clampNoiseValue(config.lowpassHz, 4200, 14000, base.lowpassHz),
      compressorThreshold: clampNoiseValue(
        config.compressorThreshold,
        -70,
        -8,
        base.compressorThreshold,
      ),
      compressorKnee: clampNoiseValue(
        config.compressorKnee,
        0,
        40,
        base.compressorKnee,
      ),
      compressorRatio: clampNoiseValue(
        config.compressorRatio,
        1,
        20,
        base.compressorRatio,
      ),
      compressorAttack: clampNoiseValue(
        config.compressorAttack,
        0.001,
        0.05,
        base.compressorAttack,
      ),
      compressorRelease: clampNoiseValue(
        config.compressorRelease,
        0.04,
        0.8,
        base.compressorRelease,
      ),
    };
    if (normalized.gateCloseRms >= normalized.gateOpenRms) {
      normalized.gateCloseRms = Math.max(0.002, normalized.gateOpenRms * 0.8);
    }
    if (normalized.lowpassHz <= normalized.highpassHz + 250) {
      normalized.lowpassHz = Math.min(14000, normalized.highpassHz + 250);
    }
    return normalized;
  }

  function applyNoiseSuppressionProfile({ preset, config } = {}) {
    const nextPreset = normalizeNoiseSuppressionPreset(
      preset || state.noiseSuppressionPreset,
    );
    const presetConfig = getNoiseSuppressionPresetConfig(nextPreset);
    state.noiseSuppressionPreset = nextPreset;
    state.noiseSuppressionConfig = normalizeNoiseSuppressionConfig(
      config || {},
      presetConfig,
    );
    if (state.localAudioNodes?.noiseGateState) {
      state.localAudioNodes.noiseGateState.config =
        state.noiseSuppressionConfig;
    }
  }

  function getRequestedAudioConstraints() {
    return {
      echoCancellation: true,
      noiseSuppression: !!state.noiseSuppression,
      autoGainControl: true,
      ...(state.audioInputDeviceId
        ? { deviceId: { exact: state.audioInputDeviceId } }
        : {}),
    };
  }

  function stopStreamTracks(stream) {
    if (!stream) return;
    for (const track of stream.getTracks?.() || []) {
      try {
        track.stop();
      } catch {}
    }
  }

  function clearSelfMonitorState() {
    const audio = state.selfMonitorAudio;
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
    state.selfMonitorAudio = null;
    state.selfMonitorActive = false;
  }

  function getAudioContextConstructor() {
    if (typeof window === "undefined") return null;
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function setNoiseGateEnabled(enabled) {
    const noiseGateState = state.localAudioNodes?.noiseGateState;
    if (!noiseGateState) return;
    noiseGateState.enabled = !!enabled;
  }

  function applyMicGainToProcessingNode() {
    const gainNode = state.localAudioNodes?.gainNode;
    if (!gainNode?.gain) return;
    const nextGain = normalizeMicGainPercent(state.micGainPercent) / 100;
    const now = state.localAudioContext?.currentTime ?? 0;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(nextGain, now, 0.015);
    } catch {
      gainNode.gain.value = nextGain;
    }
  }

  function setAudioParamValue(param, value, audioContextOverride = null) {
    if (!param || !Number.isFinite(value)) return;
    const now =
      audioContextOverride?.currentTime ??
      state.localAudioContext?.currentTime ??
      0;
    try {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, 0.02);
    } catch {
      param.value = value;
    }
  }

  function applyNoiseProcessingTuning({
    audioContext = state.localAudioContext,
    nodes = state.localAudioNodes,
  } = {}) {
    const highpassNode = nodes?.highpassNode;
    const lowpassNode = nodes?.lowpassNode;
    const compressorNode = nodes?.compressorNode;
    if (!highpassNode || !lowpassNode || !compressorNode) return;
    const config =
      state.noiseSuppressionConfig ||
      getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset);

    if (state.noiseSuppression) {
      setAudioParamValue(
        highpassNode.frequency,
        config.highpassHz,
        audioContext,
      );
      setAudioParamValue(highpassNode.Q, 0.71, audioContext);
      setAudioParamValue(lowpassNode.frequency, config.lowpassHz, audioContext);
      setAudioParamValue(lowpassNode.Q, 0.71, audioContext);
      setAudioParamValue(
        compressorNode.threshold,
        config.compressorThreshold,
        audioContext,
      );
      setAudioParamValue(
        compressorNode.knee,
        config.compressorKnee,
        audioContext,
      );
      setAudioParamValue(
        compressorNode.ratio,
        config.compressorRatio,
        audioContext,
      );
      setAudioParamValue(
        compressorNode.attack,
        config.compressorAttack,
        audioContext,
      );
      setAudioParamValue(
        compressorNode.release,
        config.compressorRelease,
        audioContext,
      );
      return;
    }

    // Neutral mode when suppression is disabled.
    setAudioParamValue(highpassNode.frequency, 20, audioContext);
    setAudioParamValue(highpassNode.Q, 0.01, audioContext);
    setAudioParamValue(lowpassNode.frequency, 20000, audioContext);
    setAudioParamValue(lowpassNode.Q, 0.01, audioContext);
    setAudioParamValue(compressorNode.threshold, 0, audioContext);
    setAudioParamValue(compressorNode.knee, 0, audioContext);
    setAudioParamValue(compressorNode.ratio, 1, audioContext);
    setAudioParamValue(compressorNode.attack, 0.003, audioContext);
    setAudioParamValue(compressorNode.release, 0.05, audioContext);
  }

  function buildProcessedAudioStream(rawStream) {
    const rawTrack = rawStream?.getAudioTracks?.()?.[0] || null;
    if (!rawTrack)
      return { stream: null, track: null, audioContext: null, nodes: null };

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      return {
        stream: rawStream,
        track: rawTrack,
        audioContext: null,
        nodes: null,
      };
    }

    const audioContext = new AudioContextCtor();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const sourceNode = audioContext.createMediaStreamSource(rawStream);
    const highpassNode = audioContext.createBiquadFilter();
    highpassNode.type = "highpass";

    const lowpassNode = audioContext.createBiquadFilter();
    lowpassNode.type = "lowpass";

    const compressorNode = audioContext.createDynamicsCompressor();

    const gainNode = audioContext.createGain();
    gainNode.gain.value = normalizeMicGainPercent(state.micGainPercent) / 100;

    const noiseGateState = {
      enabled: !!state.noiseSuppression,
      config:
        state.noiseSuppressionConfig ||
        getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset),
      gate: 1,
      isOpen: true,
    };
    const gateNode =
      typeof audioContext.createScriptProcessor === "function"
        ? audioContext.createScriptProcessor(1024, 1, 1)
        : null;
    if (gateNode) {
      gateNode.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const output = event.outputBuffer.getChannelData(0);
        if (!noiseGateState.enabled) {
          output.set(input);
          noiseGateState.gate = 1;
          noiseGateState.isOpen = true;
          return;
        }
        const gateConfig =
          noiseGateState.config ||
          state.noiseSuppressionConfig ||
          getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset);

        let sum = 0;
        for (let i = 0; i < input.length; i += 1) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        if (noiseGateState.isOpen) {
          if (rms < gateConfig.gateCloseRms) noiseGateState.isOpen = false;
        } else if (rms > gateConfig.gateOpenRms) {
          noiseGateState.isOpen = true;
        }

        const target = noiseGateState.isOpen ? 1 : 0;
        const smoothing =
          target > noiseGateState.gate
            ? gateConfig.gateAttack
            : gateConfig.gateRelease;
        noiseGateState.gate += (target - noiseGateState.gate) * smoothing;
        for (let i = 0; i < input.length; i += 1) {
          output[i] = input[i] * noiseGateState.gate;
        }
      };
    }

    const destination = audioContext.createMediaStreamDestination();
    sourceNode.connect(highpassNode);
    highpassNode.connect(lowpassNode);
    lowpassNode.connect(compressorNode);
    compressorNode.connect(gainNode);
    if (gateNode) {
      gainNode.connect(gateNode);
      gateNode.connect(destination);
    } else {
      gainNode.connect(destination);
    }

    const processedTrack = destination.stream.getAudioTracks?.()?.[0] || null;
    if (!processedTrack) {
      try {
        audioContext.close();
      } catch {}
      return {
        stream: rawStream,
        track: rawTrack,
        audioContext: null,
        nodes: null,
      };
    }

    const built = {
      stream: destination.stream,
      track: processedTrack,
      audioContext,
      nodes: {
        sourceNode,
        highpassNode,
        lowpassNode,
        compressorNode,
        gainNode,
        gateNode,
        destination,
        noiseGateState,
      },
    };
    applyNoiseProcessingTuning({
      audioContext: built.audioContext,
      nodes: built.nodes,
    });
    return built;
  }

  async function closeLocalAudioPipeline({
    stopLocalStream = true,
    stopRawStream = true,
  } = {}) {
    clearSelfMonitorState();
    if (state.localAudioContext) {
      try {
        await state.localAudioContext.close();
      } catch {}
    }
    state.localAudioContext = null;
    state.localAudioNodes = null;
    if (stopLocalStream) {
      stopStreamTracks(state.localStream);
      state.localStream = null;
    }
    if (stopRawStream) {
      stopStreamTracks(state.rawLocalStream);
      state.rawLocalStream = null;
    }
  }

  function emitLocalAudioProcessingInfo(localTrack) {
    const rawTrack = state.rawLocalStream?.getAudioTracks?.()?.[0] || null;
    const trackForSettings = rawTrack || localTrack;
    const trackSettings =
      trackForSettings && typeof trackForSettings.getSettings === "function"
        ? trackForSettings.getSettings()
        : {};
    const supportedConstraints =
      navigator.mediaDevices?.getSupportedConstraints?.() || {};
    onLocalAudioProcessingInfo?.({
      requested: {
        noiseSuppression: !!state.noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      },
      applied: {
        noiseSuppression:
          typeof trackSettings.noiseSuppression === "boolean"
            ? trackSettings.noiseSuppression
            : null,
        echoCancellation:
          typeof trackSettings.echoCancellation === "boolean"
            ? trackSettings.echoCancellation
            : null,
        autoGainControl:
          typeof trackSettings.autoGainControl === "boolean"
            ? trackSettings.autoGainControl
            : null,
      },
      supported: {
        noiseSuppression: !!supportedConstraints.noiseSuppression,
        echoCancellation: !!supportedConstraints.echoCancellation,
        autoGainControl: !!supportedConstraints.autoGainControl,
      },
      client: {
        processingActive: !!state.localAudioNodes,
        noiseGateActive: !!state.localAudioNodes?.noiseGateState?.enabled,
        micGainPercent: normalizeMicGainPercent(state.micGainPercent),
        noisePreset: state.noiseSuppressionPreset,
        noiseConfig: state.noiseSuppressionConfig,
      },
    });
  }

  async function rebuildLocalAudioTrack({ reacquireInput = false } = {}) {
    const previousLocalStream = state.localStream;
    const previousRawStream = state.rawLocalStream;
    const previousAudioContext = state.localAudioContext;

    let nextRawStream = previousRawStream;
    if (reacquireInput || !nextRawStream?.getAudioTracks?.()?.[0]) {
      nextRawStream = await navigator.mediaDevices.getUserMedia({
        audio: getRequestedAudioConstraints(),
      });
    }

    const built = buildProcessedAudioStream(nextRawStream);
    const nextTrack = built.track || null;
    if (!nextTrack) {
      if (nextRawStream !== previousRawStream) stopStreamTracks(nextRawStream);
      if (built.audioContext) {
        try {
          await built.audioContext.close();
        } catch {}
      }
      throw new Error("MIC_TRACK_NOT_FOUND");
    }

    try {
      if (state.localAudioProducer) {
        await state.localAudioProducer.replaceTrack({ track: nextTrack });
      }
    } catch (error) {
      if (built.audioContext) {
        try {
          await built.audioContext.close();
        } catch {}
      }
      if (nextRawStream !== previousRawStream) stopStreamTracks(nextRawStream);
      if (built.stream && built.stream !== nextRawStream)
        stopStreamTracks(built.stream);
      throw error;
    }

    state.rawLocalStream = nextRawStream;
    state.localAudioContext = built.audioContext;
    state.localAudioNodes = built.nodes;
    state.localStream = built.stream || new MediaStream([nextTrack]);
    applyMicGainToProcessingNode();
    setNoiseGateEnabled(state.noiseSuppression);
    applyNoiseProcessingTuning();

    if (state.localAudioProducer) {
      if (state.isMuted) {
        state.localAudioProducer.pause();
      } else {
        state.localAudioProducer.resume();
      }
    }
    applyLocalTrackEnabledState();

    if (
      previousAudioContext &&
      previousAudioContext !== state.localAudioContext
    ) {
      try {
        await previousAudioContext.close();
      } catch {}
    }
    if (previousLocalStream && previousLocalStream !== state.localStream) {
      stopStreamTracks(previousLocalStream);
    }
    if (previousRawStream && previousRawStream !== state.rawLocalStream) {
      stopStreamTracks(previousRawStream);
    }

    emitLocalAudioProcessingInfo(nextTrack);
    return nextTrack;
  }

  function setMicGain(nextMicGainPercent) {
    state.micGainPercent = normalizeMicGainPercent(nextMicGainPercent);
    applyMicGainToProcessingNode();
    const localTrack = state.localStream?.getAudioTracks?.()?.[0] || null;
    if (localTrack) emitLocalAudioProcessingInfo(localTrack);
  }

  function setNoiseSuppressionConfig(nextProfile = {}) {
    const nextPreset = normalizeNoiseSuppressionPreset(
      nextProfile?.preset || state.noiseSuppressionPreset,
    );
    const nextConfigInput =
      nextProfile &&
      typeof nextProfile === "object" &&
      nextProfile.config &&
      typeof nextProfile.config === "object"
        ? nextProfile.config
        : nextProfile;
    applyNoiseSuppressionProfile({
      preset: nextPreset,
      config: nextConfigInput,
    });
    setNoiseGateEnabled(state.noiseSuppression);
    applyNoiseProcessingTuning();
    const localTrack = state.localStream?.getAudioTracks?.()?.[0] || null;
    if (localTrack) emitLocalAudioProcessingInfo(localTrack);
  }

  async function setNoiseSuppression(nextNoiseSuppression) {
    state.noiseSuppression = !!nextNoiseSuppression;
    setNoiseGateEnabled(state.noiseSuppression);
    applyNoiseProcessingTuning();
    const currentTrack = state.localStream?.getAudioTracks?.()?.[0];
    if (!currentTrack) return;
    const rawTrack = state.rawLocalStream?.getAudioTracks?.()?.[0] || null;
    const requestedConstraints = getRequestedAudioConstraints();

    try {
      if (rawTrack && typeof rawTrack.applyConstraints === "function") {
        await rawTrack.applyConstraints(requestedConstraints);
      }
      emitLocalAudioProcessingInfo(currentTrack);
      return;
    } catch {
      // If constraints can't be updated in place, rebuild from a fresh capture.
    }

    try {
      await rebuildLocalAudioTrack({ reacquireInput: true });
    } catch {
      emitLocalAudioProcessingInfo(currentTrack);
    }
  }

  async function setAudioInputDevice(nextAudioInputDeviceId) {
    state.audioInputDeviceId = nextAudioInputDeviceId || "";
    const currentTrack = state.localStream?.getAudioTracks?.()?.[0];
    if (!currentTrack) return;

    try {
      await rebuildLocalAudioTrack({ reacquireInput: true });
    } catch {
      emitLocalAudioProcessingInfo(currentTrack);
    }
  }

  function getDesktopBridge() {
    if (typeof window === "undefined") return null;
    return window.opencomDesktopBridge || null;
  }

  async function pickDesktopDisplaySourceId(sources = []) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error("SCREEN_SOURCE_NOT_FOUND");
    }

    const bridge = getDesktopBridge();
    if (typeof bridge?.pickDisplaySource === "function") {
      const selectedId = await bridge.pickDisplaySource();
      if (!selectedId) throw new Error("SCREEN_SOURCE_CANCELLED");
      return selectedId;
    }

    const preferred =
      sources.find((source) => source?.type === "screen") || sources[0];
    if (!preferred?.id) throw new Error("SCREEN_SOURCE_NOT_FOUND");
    return preferred.id;
  }

  async function getDesktopFallbackDisplayStream() {
    const bridge = getDesktopBridge();
    if (!bridge?.getDisplaySources || !navigator?.mediaDevices?.getUserMedia) {
      throw new Error("SCREEN_SHARE_NOT_SUPPORTED");
    }

    const sources = await bridge.getDisplaySources();
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error("SCREEN_SOURCE_NOT_FOUND");
    }
    const sourceId = await pickDesktopDisplaySourceId(sources);

    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxFrameRate: 30,
          maxWidth: 3840,
          maxHeight: 2160,
        },
      },
    });
  }

  async function waitDispatch(type, match, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return waitForEvent({
      type,
      match,
      timeoutMs,
      guildId: state.guildId,
      channelId: state.channelId,
      sessionToken: state.sessionToken,
    });
  }

  async function waitForVoiceError(timeoutMs = DEFAULT_TIMEOUT_MS) {
    return waitForEvent({
      type: "VOICE_ERROR",
      timeoutMs,
      guildId: state.guildId,
      channelId: state.channelId,
      sessionToken: state.sessionToken,
    });
  }

  async function waitForVoiceResponse(
    waitForSuccess,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    const successPromise = waitForSuccess();
    const errorPromise = waitForVoiceError(timeoutMs).then((errorData) => {
      throw new Error(`VOICE_ERROR: ${errorData?.error || "UNKNOWN"}`);
    });
    return Promise.race([successPromise, errorPromise]);
  }

  async function createTransport(direction, token) {
    const requestId = createVoiceRequestId(`transport-${direction}`);
    await sendDispatch("VOICE_CREATE_TRANSPORT", {
      guildId: state.guildId,
      channelId: state.channelId,
      direction,
      requestId,
    });
    const created = await waitDispatch(
      "VOICE_TRANSPORT_CREATED",
      (d) => d?.direction === direction && d?.requestId === requestId,
    );
    if (!isActive(token)) throw new Error("VOICE_SESSION_CANCELLED");
    const {
      iceServers,
      iceServerSource,
      iceTransportPolicy,
    } = resolveIceConfiguration();
    log("creating local mediasoup transport", {
      direction,
      transportId: created.transport?.id || "",
      iceServerSource,
      iceServerUrls: summarizeIceServerUrls(iceServers),
      iceTransportPolicy: iceTransportPolicy || "all",
      remoteIceCandidateCount: Array.isArray(created.transport?.iceCandidates)
        ? created.transport.iceCandidates.length
        : 0,
    });
    const transportOptions = {
      ...created.transport,
      iceServers,
      ...(iceTransportPolicy ? { iceTransportPolicy } : {}),
    };
    const transport =
      direction === "send"
        ? state.device.createSendTransport(transportOptions)
        : state.device.createRecvTransport(transportOptions);
    attachTransportDebugHandlers(transport, direction, token);
    return transport;
  }

  async function consumeProducer(producerId, userId, token) {
    if (
      !producerId ||
      !state.recvTransport ||
      !state.device ||
      !isActive(token)
    )
      return;
    if (state.consumersByProducerId.has(producerId)) return;

    const requestId = createVoiceRequestId("consume");
    await sendDispatch("VOICE_CONSUME", {
      guildId: state.guildId,
      channelId: state.channelId,
      transportId: state.recvTransport.id,
      producerId,
      rtpCapabilities: state.device.rtpCapabilities,
      requestId,
    });

    const consumerOptions = await waitForVoiceResponse(() =>
      waitDispatch(
        "VOICE_CONSUMED",
        (d) => d?.producerId === producerId && d?.requestId === requestId,
      ),
    );
    if (!isActive(token)) return;

    const consumer = await state.recvTransport.consume(consumerOptions);
    const stream = new MediaStream([consumer.track]);
    if (consumer.kind === "audio") {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.preload = "auto";
      audio.muted = false;
      audio.srcObject = stream;
      audio.style.display = "none";
      document.body.appendChild(audio);
      audio.addEventListener("loadedmetadata", () => {
        if (audio.paused) {
          audio
            .play()
            .then(() => {
              log("audio.play() resolved", { producerId, userId });
            })
            .catch((err) => {
              log("audio.play() failed, scheduling retry", {
                producerId,
                userId,
                error: String(err?.message || err),
              });
              scheduleAudioStartRetry(audio, producerId);
            });
        }
      });
      if (typeof audio.setSinkId === "function" && state.audioOutputDeviceId) {
        await audio.setSinkId(state.audioOutputDeviceId).catch(() => {});
      }
      applyAudioPreferenceToAudio(audio, userId || "");
      await audio
        .play()
        .then(() => {
          log("audio.play() resolved (eager)", { producerId, userId });
        })
        .catch((err) => {
          log("audio.play() failed (eager), scheduling retry", {
            producerId,
            userId,
            error: String(err?.message || err),
          });
          scheduleAudioStartRetry(audio, producerId);
        });
      state.consumersByProducerId.set(producerId, {
        consumer,
        audio,
        stream,
        kind: "audio",
        userId: userId || "",
      });
      if (userId) state.producerOwnerByProducerId.set(producerId, userId);
      onRemoteAudioAdded?.({
        producerId,
        guildId: state.guildId,
        channelId: state.channelId,
        userId,
        audio,
      });
      return;
    }

    state.consumersByProducerId.set(producerId, {
      consumer,
      stream,
      kind: consumer.kind,
      userId: userId || "",
    });
    if (userId) state.producerOwnerByProducerId.set(producerId, userId);
    onRemoteVideoAdded?.({ producerId, userId, stream, kind: consumer.kind });
  }

  async function join({
    guildId,
    channelId,
    audioInputDeviceId,
    micGain = DEFAULT_MIC_GAIN_PERCENT,
    noiseSuppression = true,
    noiseSuppressionPreset = VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    noiseSuppressionConfig = null,
    isMuted = false,
    isDeafened = false,
    audioOutputDeviceId = "",
  }) {
    await cleanup();
    state.sessionToken += 1;
    const token = state.sessionToken;
    state.guildId = guildId;
    state.channelId = channelId;
    state.isMuted = !!isMuted;
    state.isDeafened = !!isDeafened;
    state.noiseSuppression = !!noiseSuppression;
    state.micGainPercent = normalizeMicGainPercent(micGain);
    applyNoiseSuppressionProfile({
      preset: noiseSuppressionPreset,
      config:
        noiseSuppressionConfig ||
        getNoiseSuppressionPresetConfig(noiseSuppressionPreset),
    });
    state.audioInputDeviceId = audioInputDeviceId || "";
    state.audioOutputDeviceId = audioOutputDeviceId || "";

    log("joining voice channel", { guildId, channelId, sessionToken: token });
    const joinRequestId = createVoiceRequestId("join");
    await sendDispatch("VOICE_JOIN", { guildId, channelId, requestId: joinRequestId });
    const joined = await waitForEvent({
      type: "VOICE_JOINED",
      match: (d) =>
        d?.guildId === guildId &&
        d?.channelId === channelId &&
        d?.requestId === joinRequestId,
      timeoutMs: 12000,
      guildId,
      channelId,
      sessionToken: token,
    });
    if (!isActive(token)) throw new Error("VOICE_SESSION_CANCELLED");

    log("VOICE_JOINED received, loading device", {
      guildId,
      channelId,
      producerCount: (joined.producers || []).length,
    });
    state.device = new mediasoupClient.Device();
    await state.device.load({ routerRtpCapabilities: joined.rtpCapabilities });

    state.sendTransport = await createTransport("send", token);
    state.sendTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        try {
          const requestId = createVoiceRequestId("connect-send");
          log("send transport connecting", {
            transportId: state.sendTransport.id,
            guildId: state.guildId,
            channelId: state.channelId,
          });
          await sendDispatch("VOICE_CONNECT_TRANSPORT", {
            guildId: state.guildId,
            channelId: state.channelId,
            transportId: state.sendTransport.id,
            dtlsParameters,
            requestId,
          });
          await waitForVoiceResponse(
            () =>
              waitDispatch(
                "VOICE_TRANSPORT_CONNECTED",
                (d) =>
                  d?.transportId === state.sendTransport.id &&
                  d?.requestId === requestId,
                DEFAULT_TIMEOUT_MS,
              ),
          );
          callback();
        } catch (error) {
          errback(error);
        }
      },
    );
    state.sendTransport.on(
      "produce",
      async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const requestId = createVoiceRequestId(`produce-${kind}`);
          await sendDispatch("VOICE_PRODUCE", {
            guildId: state.guildId,
            channelId: state.channelId,
            transportId: state.sendTransport.id,
            kind,
            rtpParameters,
            requestId,
          });
          const produced = await waitForVoiceResponse(() =>
            waitDispatch(
              "VOICE_PRODUCED",
              (d) =>
                d?.requestId === requestId &&
                d?.guildId === state.guildId &&
                d?.channelId === state.channelId &&
                d?.userId === resolveSelfUserId(),
            ),
          );
          callback({ id: produced.producerId });
        } catch (error) {
          errback(error);
        }
      },
    );

    const localTrack = await rebuildLocalAudioTrack({ reacquireInput: true });
    if (!localTrack) throw new Error("MIC_TRACK_NOT_FOUND");
    state.localAudioProducer = await state.sendTransport.produce({
      track: localTrack,
    });
    if (state.isMuted) {
      state.localAudioProducer.pause();
      localTrack.enabled = false;
    }

    state.recvTransport = await createTransport("recv", token);
    state.recvTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        try {
          const requestId = createVoiceRequestId("connect-recv");
          log("recv transport connecting", {
            transportId: state.recvTransport.id,
            guildId: state.guildId,
            channelId: state.channelId,
          });
          await sendDispatch("VOICE_CONNECT_TRANSPORT", {
            guildId: state.guildId,
            channelId: state.channelId,
            transportId: state.recvTransport.id,
            dtlsParameters,
            requestId,
          });
          await waitForVoiceResponse(
            () =>
              waitDispatch(
                "VOICE_TRANSPORT_CONNECTED",
                (d) =>
                  d?.transportId === state.recvTransport.id &&
                  d?.requestId === requestId,
                DEFAULT_TIMEOUT_MS,
              ),
          );
          callback();
        } catch (error) {
          errback(error);
        }
      },
    );

    for (const producer of joined.producers || []) {
      await consumeProducer(producer.producerId, producer.userId, token);
    }
  }

  async function cleanupConsumer(producerId) {
    const entry = state.consumersByProducerId.get(producerId);
    if (!entry) return;
    state.consumersByProducerId.delete(producerId);
    state.producerOwnerByProducerId.delete(producerId);
    removePendingAudioStart(producerId);
    try {
      entry.consumer.close();
    } catch {}
    if (entry.audio) {
      try {
        entry.audio.pause();
        entry.audio.srcObject = null;
        entry.audio.remove();
      } catch {}
      onRemoteAudioRemoved?.({ producerId, userId: entry.userId || "" });
      return;
    }
    onRemoteVideoRemoved?.({ producerId, userId: entry.userId || "" });
  }

  function clearLocalScreenState({ stopTracks = false } = {}) {
    if (state.localScreenStream) {
      const track = state.localScreenStream.getVideoTracks()?.[0];
      if (track && state.localScreenTrackEndedHandler) {
        track.removeEventListener("ended", state.localScreenTrackEndedHandler);
      }
      if (stopTracks) {
        state.localScreenStream
          .getTracks()
          .forEach((currentTrack) => currentTrack.stop());
      }
    }
    state.localScreenTrackEndedHandler = null;
    state.localScreenStream = null;
    state.localScreenProducer = null;
    setScreenSharing(false);
  }

  async function stopScreenShare({ notifyServer = true } = {}) {
    if (!state.localScreenProducer) {
      clearLocalScreenState({ stopTracks: true });
      return;
    }

    const producerId = state.localScreenProducer.id;
    try {
      state.localScreenProducer.close();
    } catch {}
    clearLocalScreenState({ stopTracks: true });

    if (!notifyServer || !producerId || !state.guildId || !state.channelId)
      return;
    await sendDispatch("VOICE_CLOSE_PRODUCER", {
      guildId: state.guildId,
      channelId: state.channelId,
      producerId,
    }).catch(() => {});
  }

  async function startScreenShare() {
    if (!state.sendTransport || !state.guildId || !state.channelId) {
      throw new Error("NOT_IN_VOICE_CHANNEL");
    }
    if (state.localScreenProducer) return;
    let displayStream = null;
    const canUseDesktopBridgeCapture =
      !!getDesktopBridge()?.getDisplaySources &&
      !!navigator?.mediaDevices?.getUserMedia;

    if (canUseDesktopBridgeCapture) {
      try {
        displayStream = await getDesktopFallbackDisplayStream();
      } catch (error) {
        if (error?.message === "SCREEN_SOURCE_CANCELLED") throw error;
        if (!navigator.mediaDevices?.getDisplayMedia) throw error;
        displayStream = await navigator.mediaDevices
          .getDisplayMedia({
            video: { frameRate: { ideal: 30, max: 60 } },
            audio: false,
          })
          .catch(() => {
            throw error;
          });
      }
    } else if (navigator.mediaDevices?.getDisplayMedia) {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });
    } else {
      throw new Error("SCREEN_SHARE_NOT_SUPPORTED");
    }
    const screenTrack = displayStream.getVideoTracks()[0];
    if (!screenTrack) {
      displayStream.getTracks().forEach((track) => track.stop());
      throw new Error("SCREEN_TRACK_NOT_FOUND");
    }

    try {
      const producer = await state.sendTransport.produce({
        track: screenTrack,
        appData: { source: "screen" },
      });
      state.localScreenProducer = producer;
      state.localScreenStream = displayStream;
      const endedHandler = () => {
        stopScreenShare().catch(() => {});
      };
      state.localScreenTrackEndedHandler = endedHandler;
      screenTrack.addEventListener("ended", endedHandler);
      setScreenSharing(true);
    } catch (error) {
      displayStream.getTracks().forEach((track) => track.stop());
      clearLocalScreenState({ stopTracks: false });
      throw error;
    }
  }

  async function cleanup() {
    state.sessionToken += 1;
    for (const producerId of [...state.pendingAudioStartByProducerId.keys()]) {
      removePendingAudioStart(producerId);
    }
    for (const transportId of [...state.pendingIceRestartByTransportId.keys()]) {
      clearPendingIceRestart(transportId);
    }
    for (const producerId of [...state.consumersByProducerId.keys()]) {
      await cleanupConsumer(producerId);
    }
    await stopScreenShare({ notifyServer: false }).catch(() => {});
    try {
      state.localAudioProducer?.close();
    } catch {}
    state.localAudioProducer = null;
    await closeLocalAudioPipeline({
      stopLocalStream: true,
      stopRawStream: true,
    });
    try {
      state.sendTransport?.close();
    } catch {}
    state.sendTransport = null;
    try {
      state.recvTransport?.close();
    } catch {}
    state.recvTransport = null;
    state.device = null;
    state.guildId = "";
    state.channelId = "";
  }

  async function handleGatewayDispatch(type, data) {
    if (!state.channelId || !state.guildId) return;
    if (data?.guildId && data.guildId !== state.guildId) return;
    if (data?.channelId && data.channelId !== state.channelId) return;
    if (
      state.localAudioProducer &&
      data.producerId === state.localAudioProducer.id
    )
      return;
    if (
      state.localScreenProducer &&
      data.producerId === state.localScreenProducer.id
    )
      return;

    if (type === "VOICE_NEW_PRODUCER" && data?.producerId) {
      if (data.userId && data.userId === resolveSelfUserId()) return; // ignore self
      await consumeProducer(
        data.producerId,
        data.userId,
        state.sessionToken,
      ).catch(() => {});
      return;
    }

    if (type === "VOICE_PRODUCER_CLOSED" && data?.producerId) {
      await cleanupConsumer(data.producerId);
      return;
    }

    if (type === "VOICE_USER_LEFT" && data?.userId) {
      closeConsumersForUser(data.userId);
    }
  }

  function closeConsumersForUser(userId) {
    if (!userId) return;
    const producerIds = [...state.producerOwnerByProducerId.entries()]
      .filter(([, owner]) => owner === userId)
      .map(([producerId]) => producerId);
    producerIds.forEach((producerId) => {
      cleanupConsumer(producerId).catch(() => {});
    });
  }

  function setMuted(nextMuted) {
    state.isMuted = !!nextMuted;
    if (state.localAudioProducer) {
      if (state.isMuted) state.localAudioProducer.pause();
      else state.localAudioProducer.resume();
    }
    applyLocalTrackEnabledState();
  }

  function setDeafened(nextDeafened) {
    state.isDeafened = !!nextDeafened;
    for (const { audio, userId } of state.consumersByProducerId.values()) {
      if (!audio) continue;
      applyAudioPreferenceToAudio(audio, userId || "");
    }
  }

  async function startSelfMonitor() {
    if (state.selfMonitorActive && state.selfMonitorAudio) return;
    const localTrack = state.localStream?.getAudioTracks?.()?.[0] || null;
    if (!localTrack) throw new Error("MIC_TEST_NOT_READY");

    state.selfMonitorActive = true;
    applyLocalTrackEnabledState();
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

    try {
      await audio.play();
    } catch (error) {
      try {
        audio.pause();
      } catch {}
      try {
        audio.srcObject = null;
      } catch {}
      try {
        audio.remove();
      } catch {}
      state.selfMonitorAudio = null;
      state.selfMonitorActive = false;
      applyLocalTrackEnabledState();
      throw error instanceof Error
        ? error
        : new Error("MIC_TEST_PLAYBACK_FAILED");
    }

    state.selfMonitorAudio = audio;
  }

  async function stopSelfMonitor() {
    clearSelfMonitorState();
    applyLocalTrackEnabledState();
  }

  function setUserAudioPreference(userId, pref = {}) {
    const key = String(userId || "").trim();
    if (!key) return;
    state.userAudioPrefsByUserId.set(key, normalizeUserAudioPreference(pref));
    for (const {
      audio,
      userId: ownerId,
    } of state.consumersByProducerId.values()) {
      if (!audio || ownerId !== key) continue;
      applyAudioPreferenceToAudio(audio, key);
    }
  }

  function setAudioOutputDevice(deviceId) {
    state.audioOutputDeviceId = deviceId || "";
    for (const { audio } of state.consumersByProducerId.values()) {
      if (!audio) continue;
      if (typeof audio.setSinkId === "function" && state.audioOutputDeviceId) {
        audio.setSinkId(state.audioOutputDeviceId).catch(() => {});
      }
    }
    if (
      state.selfMonitorAudio &&
      typeof state.selfMonitorAudio.setSinkId === "function"
    ) {
      const sinkId = state.audioOutputDeviceId || "default";
      state.selfMonitorAudio.setSinkId(sinkId).catch(() => {});
    }
  }

  function getLocalStream() {
    return state.localStream;
  }

  function getContext() {
    return { guildId: state.guildId, channelId: state.channelId };
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
    startScreenShare,
    stopScreenShare,
    getLocalStream,
    getContext,
  };
}
