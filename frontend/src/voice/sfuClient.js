import * as mediasoupClient from "mediasoup-client";

const DEFAULT_TIMEOUT_MS = 10000;

export function createSfuVoiceClient({ selfUserId, getSelfUserId, sendDispatch, waitForEvent, onRemoteAudioAdded, onRemoteAudioRemoved, debugLog }) {
  const state = {
    sessionToken: 0,
    guildId: "",
    channelId: "",
    device: null,
    sendTransport: null,
    recvTransport: null,
    localProducer: null,
    localStream: null,
    consumersByProducerId: new Map(),
    producerOwnerByProducerId: new Map(),
    isMuted: false,
    isDeafened: false,
    audioOutputDeviceId: "",
    pendingAudioStartByProducerId: new Map()
  };

  function log(message, context = {}) {
    debugLog?.(message, { guildId: state.guildId, channelId: state.channelId, ...context });
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
            log("audio.play() retry resolved", { producerId });
            removePendingAudioStart(producerId);
          })
          .catch((error) => {
            log("audio.play() retry blocked", { producerId, error: error?.message || "PLAY_BLOCKED" });
          });
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

  function resolveSelfUserId() {
    return getSelfUserId?.() || selfUserId || "";
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
      const details = errorData?.details ? `:${errorData.details}` : "";
      throw new Error(`VOICE_ERROR:${errorData?.error || "UNKNOWN"}${details}`);
    });
    return Promise.race([successPromise, errorPromise]);
  }

  async function createTransport(direction, token) {
    await sendDispatch("VOICE_CREATE_TRANSPORT", { guildId: state.guildId, channelId: state.channelId, direction });
    const created = await waitDispatch("VOICE_TRANSPORT_CREATED", (d) => d?.direction === direction);
    if (!isActive(token)) throw new Error("VOICE_SESSION_CANCELLED");
    const transport = direction === "send"
      ? state.device.createSendTransport(created.transport)
      : state.device.createRecvTransport(created.transport);
    transport.on("connectionstatechange", (connectionState) => {
      log("transport connectionstatechange", { direction, transportId: transport.id, connectionState });
    });
    return transport;
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
    log("consumer track received", {
      producerId,
      consumerId: consumer.id,
      trackReadyState: consumer.track?.readyState,
      trackMuted: consumer.track?.muted,
      trackEnabled: consumer.track?.enabled
    });

    const stream = new MediaStream([consumer.track]);
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    audio.preload = "auto";
    audio.muted = false;
    audio.srcObject = stream;
    audio.style.display = "none";
    document.body.appendChild(audio);

    audio.addEventListener("loadedmetadata", () => {
      log("audio loadedmetadata", {
        producerId,
        paused: audio.paused,
        muted: audio.muted,
        volume: audio.volume
      });
      if (audio.paused) {
        audio.play().catch((error) => {
          log("audio.play() blocked after loadedmetadata", { producerId, error: error?.message || "PLAY_BLOCKED" });
          scheduleAudioStartRetry(audio, producerId);
        });
      }
    });

    if (typeof audio.setSinkId === "function" && state.audioOutputDeviceId) {
      await audio.setSinkId(state.audioOutputDeviceId).catch((error) => {
        log("audio.setSinkId failed", { producerId, deviceId: state.audioOutputDeviceId, error: error?.message || "SET_SINK_ID_FAILED" });
      });
    }

    audio.volume = state.isDeafened ? 0 : 1;
    await audio.play().then(() => {
      log("audio.play() resolved", { producerId, paused: audio.paused });
    }).catch((error) => {
      log("audio.play() blocked", { producerId, error: error?.message || "PLAY_BLOCKED" });
      scheduleAudioStartRetry(audio, producerId);
    });

    state.consumersByProducerId.set(producerId, { consumer, audio, userId: userId || "" });
    if (userId) state.producerOwnerByProducerId.set(producerId, userId);
    onRemoteAudioAdded?.({ producerId, userId, audio });
  }

  async function join({ guildId, channelId, audioInputDeviceId, isMuted = false, isDeafened = false, audioOutputDeviceId = "" }) {
    await cleanup();
    state.sessionToken += 1;
    const token = state.sessionToken;
    state.guildId = guildId;
    state.channelId = channelId;
    state.isMuted = !!isMuted;
    state.isDeafened = !!isDeafened;
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
        log("VOICE_CONNECT_TRANSPORT send", { transportId: state.sendTransport.id });
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
            (d) => d?.guildId === state.guildId && d?.channelId === state.channelId && d?.userId === resolveSelfUserId()
          )
        );
        callback({ id: produced.producerId });
      } catch (error) {
        errback(error);
      }
    });

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : {})
    };
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    const localTrack = state.localStream.getAudioTracks()[0];
    if (!localTrack) throw new Error("MIC_TRACK_NOT_FOUND");
    state.localProducer = await state.sendTransport.produce({ track: localTrack });
    if (state.isMuted) {
      state.localProducer.pause();
      localTrack.enabled = false;
    }

    state.recvTransport = await createTransport("recv", token);
    state.recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        log("VOICE_CONNECT_TRANSPORT recv", { transportId: state.recvTransport.id });
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
    try { entry.audio.pause(); entry.audio.srcObject = null; entry.audio.remove(); } catch {}
    onRemoteAudioRemoved?.({ producerId, userId: entry.userId || "" });
  }

  async function cleanup() {
    state.sessionToken += 1;
    for (const producerId of [...state.pendingAudioStartByProducerId.keys()]) {
      removePendingAudioStart(producerId);
    }
    for (const producerId of [...state.consumersByProducerId.keys()]) {
      await cleanupConsumer(producerId);
    }
    try { state.localProducer?.close(); } catch {}
    state.localProducer = null;
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => track.stop());
      state.localStream = null;
    }
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
    if (state.localProducer && data.producerId === state.localProducer.id) return;

    if (type === "VOICE_NEW_PRODUCER" && data?.producerId) {
      if (data.userId && data.userId === resolveSelfUserId()) return;
      await consumeProducer(data.producerId, data.userId, state.sessionToken).catch((error) => {
        log("consumeProducer failed", { producerId: data.producerId, error: error?.message || "CONSUME_FAILED" });
      });
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
    if (state.localProducer) {
      if (state.isMuted) state.localProducer.pause();
      else state.localProducer.resume();
    }
    if (track) track.enabled = !state.isMuted;
  }

  function setDeafened(nextDeafened) {
    state.isDeafened = !!nextDeafened;
    for (const { audio } of state.consumersByProducerId.values()) {
      audio.volume = state.isDeafened ? 0 : 1;
    }
  }

  function setAudioOutputDevice(deviceId) {
    state.audioOutputDeviceId = deviceId || "";
    for (const { audio } of state.consumersByProducerId.values()) {
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
    setAudioOutputDevice,
    getLocalStream,
    getContext
  };
}
