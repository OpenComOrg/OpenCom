import * as mediasoupClient from "mediasoup-client";

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MIC_GAIN_PERCENT = 100;
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
    compressorRelease: 0.24
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
    compressorRelease: 0.2
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
    compressorRelease: 0.16
  })
});

export function createSfuVoiceClient({
  selfUserId,
  getSelfUserId,
  sendDispatch,
  waitForEvent,
  onLocalAudioProcessingInfo,
  onRemoteAudioAdded,
  onRemoteAudioRemoved,
  onRemoteVideoAdded,
  onRemoteVideoRemoved,
  onScreenShareStateChange
}) {
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
    noiseSuppressionConfig: { ...VOICE_NOISE_SUPPRESSION_PRESETS[VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET] },
    micGainPercent: DEFAULT_MIC_GAIN_PERCENT,
    audioInputDeviceId: "",
    audioOutputDeviceId: "",
    rawLocalStream: null,
    localAudioContext: null,
    localAudioNodes: null,
    pendingAudioStartByProducerId: new Map(),
    userAudioPrefsByUserId: new Map()
  };

  function normalizeUserAudioPreference(pref = {}) {
    const muted = !!pref?.muted;
    const volumeRaw = Number(pref?.volume);
    const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(100, volumeRaw)) : 100;
    return { muted, volume };
  }

  function applyAudioPreferenceToAudio(audio, userId) {
    if (!audio) return;
    if (state.isDeafened) {
      audio.volume = 0;
      return;
    }
    const pref = normalizeUserAudioPreference(state.userAudioPrefsByUserId.get(userId) || {});
    audio.volume = pref.muted ? 0 : pref.volume / 100;
  }

  function removePendingAudioStart(producerId) {
    const pending = state.pendingAudioStartByProducerId.get(producerId);
    if (!pending) return;
    pending.cleanup();
    state.pendingAudioStartByProducerId.delete(producerId);
  }

  function scheduleAudioStartRetry(audio, producerId) {
    if (!audio || !producerId || state.pendingAudioStartByProducerId.has(producerId)) return;

    const retryStart = () => {
      if (audio.paused) {
        audio.play()
          .then(() => {
            removePendingAudioStart(producerId);
          })
          .catch(() => {});
      } else {
        removePendingAudioStart(producerId);
      }
    };

    const events = ["pointerdown", "touchstart", "keydown", "click"];
    events.forEach((eventName) => window.addEventListener(eventName, retryStart, { passive: true }));
    const timer = window.setInterval(retryStart, 1500);

    state.pendingAudioStartByProducerId.set(producerId, {
      cleanup: () => {
        window.clearInterval(timer);
        events.forEach((eventName) => window.removeEventListener(eventName, retryStart));
      }
    });
  }

  function isActive(token) {
    return token === state.sessionToken && !!state.channelId;
  }

  function setScreenSharing(active) {
    onScreenShareStateChange?.(!!active);
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
    const key = String(value || "").trim().toLowerCase();
    if (key === "custom") return "custom";
    if (VOICE_NOISE_SUPPRESSION_PRESETS[key]) return key;
    return VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET;
  }

  function getNoiseSuppressionPresetConfig(preset) {
    const presetKey = normalizeNoiseSuppressionPreset(preset);
    if (presetKey === "custom") return VOICE_NOISE_SUPPRESSION_PRESETS[VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET];
    return VOICE_NOISE_SUPPRESSION_PRESETS[presetKey] || VOICE_NOISE_SUPPRESSION_PRESETS[VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET];
  }

  function normalizeNoiseSuppressionConfig(config = {}, fallbackConfig = null) {
    const base = fallbackConfig || state.noiseSuppressionConfig || getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset);
    const normalized = {
      gateOpenRms: clampNoiseValue(config.gateOpenRms, 0.004, 0.06, base.gateOpenRms),
      gateCloseRms: clampNoiseValue(config.gateCloseRms, 0.002, 0.05, base.gateCloseRms),
      gateAttack: clampNoiseValue(config.gateAttack, 0.05, 0.95, base.gateAttack),
      gateRelease: clampNoiseValue(config.gateRelease, 0.01, 0.8, base.gateRelease),
      highpassHz: clampNoiseValue(config.highpassHz, 40, 300, base.highpassHz),
      lowpassHz: clampNoiseValue(config.lowpassHz, 4200, 14000, base.lowpassHz),
      compressorThreshold: clampNoiseValue(config.compressorThreshold, -70, -8, base.compressorThreshold),
      compressorKnee: clampNoiseValue(config.compressorKnee, 0, 40, base.compressorKnee),
      compressorRatio: clampNoiseValue(config.compressorRatio, 1, 20, base.compressorRatio),
      compressorAttack: clampNoiseValue(config.compressorAttack, 0.001, 0.05, base.compressorAttack),
      compressorRelease: clampNoiseValue(config.compressorRelease, 0.04, 0.8, base.compressorRelease)
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
    const nextPreset = normalizeNoiseSuppressionPreset(preset || state.noiseSuppressionPreset);
    const presetConfig = getNoiseSuppressionPresetConfig(nextPreset);
    state.noiseSuppressionPreset = nextPreset;
    state.noiseSuppressionConfig = normalizeNoiseSuppressionConfig(config || {}, presetConfig);
    if (state.localAudioNodes?.noiseGateState) {
      state.localAudioNodes.noiseGateState.config = state.noiseSuppressionConfig;
    }
  }

  function getRequestedAudioConstraints() {
    return {
      echoCancellation: true,
      noiseSuppression: !!state.noiseSuppression,
      autoGainControl: true,
      ...(state.audioInputDeviceId ? { deviceId: { exact: state.audioInputDeviceId } } : {})
    };
  }

  function stopStreamTracks(stream) {
    if (!stream) return;
    for (const track of stream.getTracks?.() || []) {
      try { track.stop(); } catch {}
    }
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
    const now = audioContextOverride?.currentTime ?? state.localAudioContext?.currentTime ?? 0;
    try {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, 0.02);
    } catch {
      param.value = value;
    }
  }

  function applyNoiseProcessingTuning({ audioContext = state.localAudioContext, nodes = state.localAudioNodes } = {}) {
    const highpassNode = nodes?.highpassNode;
    const lowpassNode = nodes?.lowpassNode;
    const compressorNode = nodes?.compressorNode;
    if (!highpassNode || !lowpassNode || !compressorNode) return;
    const config = state.noiseSuppressionConfig || getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset);

    if (state.noiseSuppression) {
      setAudioParamValue(highpassNode.frequency, config.highpassHz, audioContext);
      setAudioParamValue(highpassNode.Q, 0.71, audioContext);
      setAudioParamValue(lowpassNode.frequency, config.lowpassHz, audioContext);
      setAudioParamValue(lowpassNode.Q, 0.71, audioContext);
      setAudioParamValue(compressorNode.threshold, config.compressorThreshold, audioContext);
      setAudioParamValue(compressorNode.knee, config.compressorKnee, audioContext);
      setAudioParamValue(compressorNode.ratio, config.compressorRatio, audioContext);
      setAudioParamValue(compressorNode.attack, config.compressorAttack, audioContext);
      setAudioParamValue(compressorNode.release, config.compressorRelease, audioContext);
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
    if (!rawTrack) return { stream: null, track: null, audioContext: null, nodes: null };

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      return {
        stream: rawStream,
        track: rawTrack,
        audioContext: null,
        nodes: null
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
      config: state.noiseSuppressionConfig || getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset),
      gate: 1,
      isOpen: true
    };
    const gateNode = typeof audioContext.createScriptProcessor === "function"
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
        const gateConfig = noiseGateState.config || state.noiseSuppressionConfig || getNoiseSuppressionPresetConfig(state.noiseSuppressionPreset);

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
        const smoothing = target > noiseGateState.gate ? gateConfig.gateAttack : gateConfig.gateRelease;
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
      try { audioContext.close(); } catch {}
      return {
        stream: rawStream,
        track: rawTrack,
        audioContext: null,
        nodes: null
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
        noiseGateState
      }
    };
    applyNoiseProcessingTuning({ audioContext: built.audioContext, nodes: built.nodes });
    return built;
  }

  async function closeLocalAudioPipeline({ stopLocalStream = true, stopRawStream = true } = {}) {
    if (state.localAudioContext) {
      try { await state.localAudioContext.close(); } catch {}
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
    const trackSettings = trackForSettings && typeof trackForSettings.getSettings === "function" ? trackForSettings.getSettings() : {};
    const supportedConstraints = navigator.mediaDevices?.getSupportedConstraints?.() || {};
    onLocalAudioProcessingInfo?.({
      requested: {
        noiseSuppression: !!state.noiseSuppression,
        echoCancellation: true,
        autoGainControl: true
      },
      applied: {
        noiseSuppression: typeof trackSettings.noiseSuppression === "boolean" ? trackSettings.noiseSuppression : null,
        echoCancellation: typeof trackSettings.echoCancellation === "boolean" ? trackSettings.echoCancellation : null,
        autoGainControl: typeof trackSettings.autoGainControl === "boolean" ? trackSettings.autoGainControl : null
      },
      supported: {
        noiseSuppression: !!supportedConstraints.noiseSuppression,
        echoCancellation: !!supportedConstraints.echoCancellation,
        autoGainControl: !!supportedConstraints.autoGainControl
      },
      client: {
        processingActive: !!state.localAudioNodes,
        noiseGateActive: !!state.localAudioNodes?.noiseGateState?.enabled,
        micGainPercent: normalizeMicGainPercent(state.micGainPercent),
        noisePreset: state.noiseSuppressionPreset,
        noiseConfig: state.noiseSuppressionConfig
      }
    });
  }

  async function rebuildLocalAudioTrack({ reacquireInput = false } = {}) {
    const previousLocalStream = state.localStream;
    const previousRawStream = state.rawLocalStream;
    const previousAudioContext = state.localAudioContext;

    let nextRawStream = previousRawStream;
    if (reacquireInput || !nextRawStream?.getAudioTracks?.()?.[0]) {
      nextRawStream = await navigator.mediaDevices.getUserMedia({
        audio: getRequestedAudioConstraints()
      });
    }

    const built = buildProcessedAudioStream(nextRawStream);
    const nextTrack = built.track || null;
    if (!nextTrack) {
      if (nextRawStream !== previousRawStream) stopStreamTracks(nextRawStream);
      if (built.audioContext) {
        try { await built.audioContext.close(); } catch {}
      }
      throw new Error("MIC_TRACK_NOT_FOUND");
    }

    try {
      if (state.localAudioProducer) {
        await state.localAudioProducer.replaceTrack({ track: nextTrack });
      }
    } catch (error) {
      if (built.audioContext) {
        try { await built.audioContext.close(); } catch {}
      }
      if (nextRawStream !== previousRawStream) stopStreamTracks(nextRawStream);
      if (built.stream && built.stream !== nextRawStream) stopStreamTracks(built.stream);
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
        nextTrack.enabled = false;
      } else {
        state.localAudioProducer.resume();
        nextTrack.enabled = true;
      }
    } else {
      nextTrack.enabled = !state.isMuted;
    }

    if (previousAudioContext && previousAudioContext !== state.localAudioContext) {
      try { await previousAudioContext.close(); } catch {}
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
    const nextPreset = normalizeNoiseSuppressionPreset(nextProfile?.preset || state.noiseSuppressionPreset);
    const nextConfigInput = nextProfile && typeof nextProfile === "object" && nextProfile.config && typeof nextProfile.config === "object"
      ? nextProfile.config
      : nextProfile;
    applyNoiseSuppressionProfile({ preset: nextPreset, config: nextConfigInput });
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

    const preferred = sources.find((source) => source?.type === "screen") || sources[0];
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
          maxHeight: 2160
        }
      }
    });
  }

  async function waitDispatch(type, match, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return waitForEvent({ type, match, timeoutMs, guildId: state.guildId, channelId: state.channelId, sessionToken: state.sessionToken });
  }

  async function waitForTransportConnected(transportId, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return waitForEvent({
      type: "VOICE_TRANSPORT_CONNECTED",
      timeoutMs,
      guildId: state.guildId,
      channelId: state.channelId,
      sessionToken: state.sessionToken,
      transportId
    });
  }

  async function waitForVoiceError(timeoutMs = DEFAULT_TIMEOUT_MS) {
    return waitForEvent({
      type: "VOICE_ERROR",
      timeoutMs,
      guildId: state.guildId,
      channelId: state.channelId,
      sessionToken: state.sessionToken
    });
  }

  async function waitForVoiceResponse(waitForSuccess, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const successPromise = waitForSuccess();
    const errorPromise = waitForVoiceError(timeoutMs).then((errorData) => {
      throw new Error(`VOICE_ERROR: ${errorData?.error || "UNKNOWN"}`);
    });
    return Promise.race([successPromise, errorPromise]);
  }

  async function createTransport(direction, token) {
    await sendDispatch("VOICE_CREATE_TRANSPORT", { guildId: state.guildId, channelId: state.channelId, direction });
    const created = await waitDispatch("VOICE_TRANSPORT_CREATED", (d) => d?.direction === direction);
    if (!isActive(token)) throw new Error("VOICE_SESSION_CANCELLED");
    return direction === "send"
      ? state.device.createSendTransport(created.transport)
      : state.device.createRecvTransport(created.transport);
  }

  async function consumeProducer(producerId, userId, token) {
    if (!producerId || !state.recvTransport || !state.device || !isActive(token)) return;
    if (state.consumersByProducerId.has(producerId)) return;

    await sendDispatch("VOICE_CONSUME", {
      guildId: state.guildId,
      channelId: state.channelId,
      transportId: state.recvTransport.id,
      producerId,
      rtpCapabilities: state.device.rtpCapabilities
    });

    const consumerOptions = await waitForVoiceResponse(
      () => waitDispatch("VOICE_CONSUMED", (d) => d?.producerId === producerId)
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
          audio.play().catch(() => {
            scheduleAudioStartRetry(audio, producerId);
          });
        }
      });
      if (typeof audio.setSinkId === "function" && state.audioOutputDeviceId) {
        await audio.setSinkId(state.audioOutputDeviceId).catch(() => {});
      }
      applyAudioPreferenceToAudio(audio, userId || "");
      await audio.play().catch(() => {
        scheduleAudioStartRetry(audio, producerId);
      });
      state.consumersByProducerId.set(producerId, {
        consumer,
        audio,
        stream,
        kind: "audio",
        userId: userId || ""
      });
      if (userId) state.producerOwnerByProducerId.set(producerId, userId);
      onRemoteAudioAdded?.({ producerId, guildId: state.guildId, channelId: state.channelId, userId, audio });
      return;
    }

    state.consumersByProducerId.set(producerId, {
      consumer,
      stream,
      kind: consumer.kind,
      userId: userId || ""
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
    audioOutputDeviceId = ""
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
      config: noiseSuppressionConfig || getNoiseSuppressionPresetConfig(noiseSuppressionPreset)
    });
    state.audioInputDeviceId = audioInputDeviceId || "";
    state.audioOutputDeviceId = audioOutputDeviceId || "";

    await sendDispatch("VOICE_JOIN", { guildId, channelId });
    const joined = await waitForEvent({
      type: "VOICE_JOINED",
      match: (d) => d?.guildId === guildId && d?.channelId === channelId,
      timeoutMs: 12000,
      guildId,
      channelId,
      sessionToken: token
    });
    if (!isActive(token)) throw new Error("VOICE_SESSION_CANCELLED");

    state.device = new mediasoupClient.Device();
    await state.device.load({ routerRtpCapabilities: joined.rtpCapabilities });

    state.sendTransport = await createTransport("send", token);
    state.sendTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        if (import.meta.env.DEV) {
          console.debug("[voice] sending VOICE_CONNECT_TRANSPORT", {
            transportId: state.sendTransport.id,
            guildId: state.guildId,
            channelId: state.channelId
          });
        }
        await sendDispatch("VOICE_CONNECT_TRANSPORT", {
          guildId: state.guildId,
          channelId: state.channelId,
          transportId: state.sendTransport.id,
          dtlsParameters
        });
        await waitForVoiceResponse(() => waitForTransportConnected(state.sendTransport.id));
        callback();
      } catch (error) {
        errback(error);
      }
    });
    state.sendTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
      try {
        await sendDispatch("VOICE_PRODUCE", {
          guildId: state.guildId,
          channelId: state.channelId,
          transportId: state.sendTransport.id,
          kind,
          rtpParameters
        });
        const produced = await waitForVoiceResponse(
          () => waitDispatch(
            "VOICE_PRODUCED",
            (d) =>
              d?.guildId === state.guildId &&
              d?.channelId === state.channelId &&
              d?.userId === resolveSelfUserId()
          )
        );
        callback({ id: produced.producerId });
      } catch (error) {
        errback(error);
      }
    });

    const localTrack = await rebuildLocalAudioTrack({ reacquireInput: true });
    if (!localTrack) throw new Error("MIC_TRACK_NOT_FOUND");
    state.localAudioProducer = await state.sendTransport.produce({ track: localTrack });
    if (state.isMuted) {
      state.localAudioProducer.pause();
      localTrack.enabled = false;
    }

    state.recvTransport = await createTransport("recv", token);
    state.recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        if (import.meta.env.DEV) {
          console.debug("[voice] sending VOICE_CONNECT_TRANSPORT", {
            transportId: state.recvTransport.id,
            guildId: state.guildId,
            channelId: state.channelId
          });
        }
        await sendDispatch("VOICE_CONNECT_TRANSPORT", {
          guildId: state.guildId,
          channelId: state.channelId,
          transportId: state.recvTransport.id,
          dtlsParameters
        });
        await waitForVoiceResponse(() => waitForTransportConnected(state.recvTransport.id));
        callback();
      } catch (error) {
        errback(error);
      }
    });

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
    try { entry.consumer.close(); } catch {}
    if (entry.audio) {
      try { entry.audio.pause(); entry.audio.srcObject = null; entry.audio.remove(); } catch {}
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
        state.localScreenStream.getTracks().forEach((currentTrack) => currentTrack.stop());
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
    try { state.localScreenProducer.close(); } catch {}
    clearLocalScreenState({ stopTracks: true });

    if (!notifyServer || !producerId || !state.guildId || !state.channelId) return;
    await sendDispatch("VOICE_CLOSE_PRODUCER", {
      guildId: state.guildId,
      channelId: state.channelId,
      producerId
    }).catch(() => {});
  }

  async function startScreenShare() {
    if (!state.sendTransport || !state.guildId || !state.channelId) {
      throw new Error("NOT_IN_VOICE_CHANNEL");
    }
    if (state.localScreenProducer) return;
    let displayStream = null;
    const canUseDesktopBridgeCapture = !!getDesktopBridge()?.getDisplaySources && !!navigator?.mediaDevices?.getUserMedia;

    if (canUseDesktopBridgeCapture) {
      try {
        displayStream = await getDesktopFallbackDisplayStream();
      } catch (error) {
        if (error?.message === "SCREEN_SOURCE_CANCELLED") throw error;
        if (!navigator.mediaDevices?.getDisplayMedia) throw error;
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 } },
          audio: false
        }).catch(() => {
          throw error;
        });
      }
    } else if (navigator.mediaDevices?.getDisplayMedia) {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false
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
        appData: { source: "screen" }
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
    for (const producerId of [...state.consumersByProducerId.keys()]) {
      await cleanupConsumer(producerId);
    }
    await stopScreenShare({ notifyServer: false }).catch(() => {});
    try { state.localAudioProducer?.close(); } catch {}
    state.localAudioProducer = null;
    await closeLocalAudioPipeline({ stopLocalStream: true, stopRawStream: true });
    try { state.sendTransport?.close(); } catch {}
    state.sendTransport = null;
    try { state.recvTransport?.close(); } catch {}
    state.recvTransport = null;
    state.device = null;
    state.guildId = "";
    state.channelId = "";
  }

  async function handleGatewayDispatch(type, data) {
    if (!state.channelId || !state.guildId) return;
    if (data?.guildId && data.guildId !== state.guildId) return;
    if (data?.channelId && data.channelId !== state.channelId) return;
    if (state.localAudioProducer && data.producerId === state.localAudioProducer.id) return;
    if (state.localScreenProducer && data.producerId === state.localScreenProducer.id) return;


    if (type === "VOICE_NEW_PRODUCER" && data?.producerId) {
      if (data.userId && data.userId === resolveSelfUserId()) return; // ignore self
        await consumeProducer(data.producerId, data.userId, state.sessionToken).catch(() => {});
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
    const track = state.localStream?.getAudioTracks?.()[0];
    if (state.localAudioProducer) {
      if (state.isMuted) state.localAudioProducer.pause();
      else state.localAudioProducer.resume();
    }
    if (track) track.enabled = !state.isMuted;
  }

  function setDeafened(nextDeafened) {
    state.isDeafened = !!nextDeafened;
    for (const { audio, userId } of state.consumersByProducerId.values()) {
      if (!audio) continue;
      applyAudioPreferenceToAudio(audio, userId || "");
    }
  }

  function setUserAudioPreference(userId, pref = {}) {
    const key = String(userId || "").trim();
    if (!key) return;
    state.userAudioPrefsByUserId.set(key, normalizeUserAudioPreference(pref));
    for (const { audio, userId: ownerId } of state.consumersByProducerId.values()) {
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
    startScreenShare,
    stopScreenShare,
    getLocalStream,
    getContext
  };
}
