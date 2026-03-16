import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAvatar } from "../ui/SafeAvatar";
import { HeadphonesIcon, MicrophoneIcon } from "../ui/VoiceIcons";

function formatDuration(totalSeconds = 0) {
  const mins = Math.floor(Number(totalSeconds || 0) / 60);
  const secs = Math.max(0, Number(totalSeconds || 0) % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function bindStream(node, stream) {
  if (!node) return;
  if (!stream) {
    if (node.srcObject) node.srcObject = null;
    return;
  }
  if (node.srcObject !== stream) node.srcObject = stream;
}

function getInitials(label = "") {
  const clean = String(label || "").trim();
  if (!clean) return "?";
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function clampDockRect(rect, bounds) {
  if (!bounds.width || !bounds.height) return rect;
  const inset = 16;
  const minY = 72;
  const width = Math.max(220, Math.min(rect.width, bounds.width - inset * 2));
  const height = Math.max(
    150,
    Math.min(rect.height, Math.max(180, bounds.height - minY - inset)),
  );
  const maxX = Math.max(inset, bounds.width - width - inset);
  const maxY = Math.max(minY, bounds.height - height - inset);
  return {
    width,
    height,
    x: Math.max(inset, Math.min(rect.x, maxX)),
    y: Math.max(minY, Math.min(rect.y, maxY)),
  };
}

function StreamVideo({ stream, className = "" }) {
  const videoRef = useRef(null);

  useEffect(() => {
    bindStream(videoRef.current, stream || null);
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      playsInline
      muted
    />
  );
}

function ParticipantCard({ participant, compact = false }) {
  if (!participant) return null;
  return (
    <article
      className={`voice-call-participant-card ${compact ? "compact" : ""} ${
        participant.speaking ? "speaking" : ""
      } ${participant.videoStream ? "has-video" : ""}`}
    >
      <div className="voice-call-participant-media">
        {participant.videoStream ? (
          <>
            <StreamVideo
              stream={participant.videoStream}
              className="voice-call-participant-video"
            />
            <span className="voice-call-participant-video-badge">
              {participant.isSelf ? "Your camera" : "Camera live"}
            </span>
          </>
        ) : (
          <SafeAvatar
            src={participant.pfpUrl}
            alt={participant.username}
            name={participant.username}
            seed={participant.userId || participant.username}
            className="voice-call-participant-avatar"
          />
        )}
      </div>
      <div className="voice-call-participant-meta">
        <strong>{participant.username || participant.userId || "Guest"}</strong>
        <span>
          {participant.deafened
            ? "Deafened"
            : participant.muted
              ? "Muted"
              : participant.speaking
                ? "Speaking"
                : participant.isSelf
                  ? "You"
                  : "Listening"}
        </span>
      </div>
      <div className="voice-call-participant-flags" aria-hidden="true">
        {participant.isSelf ? <span>You</span> : null}
        {participant.speaking ? <span>Live</span> : null}
      </div>
    </article>
  );
}

function DmStageParticipantOrb({ participant, size = "large" }) {
  if (!participant) return null;

  const statusLabel = participant.deafened
    ? "Deafened"
    : participant.muted
      ? "Muted"
      : participant.speaking
        ? "Speaking"
        : participant.isSelf
          ? "You"
          : "Listening";

  return (
    <div
      className={`voice-call-stage-dm-orb ${size} ${
        participant.speaking ? "speaking" : ""
      } ${participant.videoStream ? "has-video" : ""}`}
    >
      <div className="voice-call-stage-dm-orb-media">
        {participant.videoStream ? (
          <StreamVideo
            stream={participant.videoStream}
            className="voice-call-stage-dm-orb-video"
          />
        ) : (
          <SafeAvatar
            src={participant.pfpUrl}
            alt={participant.username}
            name={participant.username}
            seed={participant.userId || participant.username}
            className="voice-call-stage-dm-orb-avatar"
          />
        )}
        {participant.isSelf ? (
          <span className="voice-call-stage-dm-orb-pill">You</span>
        ) : null}
      </div>
      <div className="voice-call-stage-dm-orb-meta">
        <strong>{participant.username || participant.userId || "Guest"}</strong>
        <span>{statusLabel}</span>
      </div>
    </div>
  );
}

function DmStageParticipantChip({ participant }) {
  if (!participant) return null;

  return (
    <div
      className={`voice-call-stage-dm-chip ${
        participant.speaking ? "speaking" : ""
      }`}
    >
      <SafeAvatar
        src={participant.pfpUrl}
        alt={participant.username}
        name={participant.username}
        seed={participant.userId || participant.username}
        className="voice-call-stage-dm-chip-avatar"
      />
      <div className="voice-call-stage-dm-chip-copy">
        <strong>{participant.username || participant.userId || "Guest"}</strong>
        <span>
          {participant.deafened
            ? "Deafened"
            : participant.muted
              ? "Muted"
              : participant.speaking
                ? "Speaking"
                : participant.isSelf
                  ? "You"
                  : "In call"}
        </span>
      </div>
    </div>
  );
}

function ScreenShareTile({
  share,
  selected,
  onSelect,
  ownerName,
  ownerPfp,
  mini = false,
}) {
  return (
    <button
      type="button"
      className={`voice-call-share-tile ${mini ? "mini" : ""} ${
        selected ? "selected" : ""
      }`}
      onClick={() => onSelect?.(share.producerId)}
    >
      <div className="voice-call-share-media">
        <video
          autoPlay
          playsInline
          muted
          ref={(node) => bindStream(node, share.stream)}
        />
        <span className="voice-call-share-live-pill">LIVE</span>
      </div>
      <div className="voice-call-share-meta">
        <strong>{ownerName || "Screen Share"}</strong>
        <span>Tap to focus</span>
      </div>
      <div className="voice-call-share-owner" aria-hidden="true">
        <SafeAvatar
          src={ownerPfp}
          alt={ownerName || "Screen share owner"}
          name={ownerName}
          seed={ownerName}
          style={{ width: "100%", height: "100%", borderRadius: "50%" }}
        />
      </div>
    </button>
  );
}

export function VoiceCallStage({
  title,
  subtitle,
  variant = "default",
  presentation = "full",
  participants = [],
  remoteScreenShares = [],
  selectedRemoteScreenShare = null,
  onSelectScreenShare,
  isConnected = false,
  isMuted = false,
  isDeafened = false,
  isCameraEnabled = false,
  isScreenSharing = false,
  liveCameraCount = 0,
  duration = 0,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onJoin,
  onLeave,
  onClose,
  onExpand,
  showClose = false,
  joinLabel = "Join voice",
  leaveLabel = "Leave call",
  emptyTitle = "No live screen share yet",
  emptyDescription = "When someone starts sharing, it will show up here.",
}) {
  const stageRef = useRef(null);
  const heroVideoRef = useRef(null);
  const dockInteractionRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dockMinimized, setDockMinimized] = useState(false);
  const [dockRect, setDockRect] = useState({
    x: 24,
    y: 24,
    width: 320,
    height: 214,
  });
  const [dockReady, setDockReady] = useState(false);

  const participantCountLabel = `${participants.length} ${
    participants.length === 1 ? "person" : "people"
  }`;
  const isDmVariant = variant === "dm";
  const isEmbeddedPresentation = presentation === "dock";
  const cameraParticipants = useMemo(
    () => participants.filter((participant) => !!participant.videoStream),
    [participants],
  );
  const cameraCount =
    liveCameraCount || cameraParticipants.length || (isCameraEnabled ? 1 : 0);
  const cameraCountLabel = `${cameraCount} ${
    cameraCount === 1 ? "camera" : "cameras"
  }`;
  const shareCountLabel = `${remoteScreenShares.length} ${
    remoteScreenShares.length === 1 ? "live share" : "live shares"
  }`;
  const spotlightParticipants = useMemo(() => {
    const voiceOnlyParticipants = participants.filter(
      (participant) => !participant.videoStream,
    );
    return [...cameraParticipants, ...voiceOnlyParticipants].slice(0, 4);
  }, [cameraParticipants, participants]);

  const primaryParticipant = useMemo(
    () => participants.find((participant) => !participant.isSelf) || participants[0] || null,
    [participants],
  );
  const selfParticipant = useMemo(
    () => participants.find((participant) => participant.isSelf) || null,
    [participants],
  );
  const remoteParticipants = useMemo(
    () => participants.filter((participant) => !participant.isSelf),
    [participants],
  );
  const dmHeroParticipants = useMemo(() => {
    const preferred = remoteParticipants.length ? remoteParticipants : participants;
    return preferred.slice(0, 2);
  }, [participants, remoteParticipants]);
  const dmParticipantStrip = useMemo(() => {
    const ordered = remoteParticipants.length
      ? [...remoteParticipants, ...(selfParticipant ? [selfParticipant] : [])]
      : participants;
    return ordered.slice(0, 6);
  }, [participants, remoteParticipants, selfParticipant]);

  const selectedShareOwner = useMemo(
    () =>
      participants.find(
        (participant) => participant.userId === selectedRemoteScreenShare?.userId,
      ) || null,
    [participants, selectedRemoteScreenShare?.userId],
  );

  useEffect(() => {
    bindStream(heroVideoRef.current, selectedRemoteScreenShare?.stream || null);
  }, [selectedRemoteScreenShare]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!stageRef.current) {
        setIsFullscreen(false);
        return;
      }
      const current = document.fullscreenElement;
      setIsFullscreen(!!current && stageRef.current.contains(current));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (dockReady || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const next = clampDockRect(
      {
        width: Math.min(336, Math.max(264, rect.width * 0.28)),
        height: Math.min(244, Math.max(182, rect.height * 0.28)),
        x: Math.max(18, rect.width - Math.min(336, Math.max(264, rect.width * 0.28)) - 24),
        y: Math.max(92, rect.height - Math.min(244, Math.max(182, rect.height * 0.28)) - 24),
      },
      { width: rect.width, height: rect.height },
    );
    setDockRect(next);
    setDockReady(true);
  }, [dockReady]);

  useEffect(() => {
    const handleResize = () => {
      if (!stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      setDockRect((current) =>
        clampDockRect(current, { width: rect.width, height: rect.height }),
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const interaction = dockInteractionRef.current;
      if (!interaction) return;
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;
      if (interaction.type === "drag") {
        setDockRect(
          clampDockRect(
            {
              ...interaction.startRect,
              x: interaction.startRect.x + deltaX,
              y: interaction.startRect.y + deltaY,
            },
            interaction.bounds,
          ),
        );
        return;
      }
      if (interaction.type === "resize") {
        setDockRect(
          clampDockRect(
            {
              ...interaction.startRect,
              width: interaction.startRect.width + deltaX,
              height: interaction.startRect.height + deltaY,
            },
            interaction.bounds,
          ),
        );
      }
    };

    const stopInteraction = () => {
      dockInteractionRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction);
    window.addEventListener("pointercancel", stopInteraction);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
      window.removeEventListener("pointercancel", stopInteraction);
    };
  }, []);

  function startDockInteraction(type, event) {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    dockInteractionRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      startRect: dockRect,
      bounds: { width: rect.width, height: rect.height },
    };
  }

  async function toggleFullscreen() {
    const target = heroVideoRef.current?.parentElement || stageRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    await target.requestFullscreen?.().catch(() => {});
  }

  function resetDock() {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setDockRect(
      clampDockRect(
        {
          width: Math.min(336, Math.max(264, rect.width * 0.28)),
          height: Math.min(244, Math.max(182, rect.height * 0.28)),
          x: Math.max(18, rect.width - Math.min(336, Math.max(264, rect.width * 0.28)) - 24),
          y: Math.max(92, rect.height - Math.min(244, Math.max(182, rect.height * 0.28)) - 24),
        },
        { width: rect.width, height: rect.height },
      ),
    );
  }

  if (isDmVariant) {
    const dmSubtitle =
      subtitle ||
      (isConnected
        ? `Private call with ${primaryParticipant?.username || title || "your friend"}`
        : "Connecting to the private call");

    return (
      <section
        className={`voice-call-stage voice-call-stage-dm ${
          isEmbeddedPresentation ? "voice-call-stage-dm-embedded" : ""
        }`}
        ref={stageRef}
      >
        <div className="voice-call-stage-backdrop" aria-hidden="true" />

        <div className="voice-call-stage-dm-shell">
          <div className="voice-call-stage-dm-statusbar">
            <span className="voice-call-stage-kicker">
              <span className="voice-call-stage-live-dot" />
              {isConnected
                ? `In call${duration > 0 ? ` • ${formatDuration(duration)}` : ""}`
                : "Connecting"}
            </span>

            <div className="voice-call-stage-dm-badges">
              <span>{participantCountLabel}</span>
              <span>{cameraCountLabel}</span>
              <span>{shareCountLabel}</span>
            </div>
          </div>

          <div className="voice-call-stage-dm-body">
            {selectedRemoteScreenShare ? (
              <div
                className="voice-call-stage-dm-share-focus"
                onDoubleClick={() => void toggleFullscreen()}
              >
                <video ref={heroVideoRef} autoPlay playsInline />
                <div className="voice-call-stage-hero-label voice-call-stage-dm-share-label">
                  <strong>
                    {selectedShareOwner?.username ||
                      selectedRemoteScreenShare.userName ||
                      "Screen Share"}
                  </strong>
                  <span>
                    {selectedShareOwner?.isSelf
                      ? "You are sharing your screen"
                      : "Sharing live in this private call"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="voice-call-stage-dm-focus">
                <div
                  className={`voice-call-stage-dm-orb-row ${
                    dmHeroParticipants.length > 1 ? "split" : "solo"
                  }`}
                >
                  {dmHeroParticipants.length ? (
                    dmHeroParticipants.map((participant) => (
                      <DmStageParticipantOrb
                        key={`dm-orb-${participant.userId || participant.username}`}
                        participant={participant}
                      />
                    ))
                  ) : selfParticipant ? (
                    <DmStageParticipantOrb participant={selfParticipant} />
                  ) : (
                    <div className="voice-call-stage-dm-placeholder">
                      <span>{getInitials(title || "Call")}</span>
                    </div>
                  )}
                </div>

                {selfParticipant &&
                dmHeroParticipants.every(
                  (participant) => participant.userId !== selfParticipant.userId,
                ) ? (
                  <div className="voice-call-stage-dm-self-corner">
                    <DmStageParticipantOrb
                      participant={selfParticipant}
                      size="small"
                    />
                  </div>
                ) : null}

                <div className="voice-call-stage-dm-copy">
                  <h2>{title || "Private Call"}</h2>
                  <p>{dmSubtitle}</p>
                </div>
              </div>
            )}

            {(dmParticipantStrip.length > 0 || remoteScreenShares.length > 0) && (
              <div className="voice-call-stage-dm-rail">
                {dmParticipantStrip.length > 0 ? (
                  <div className="voice-call-stage-dm-chip-row">
                    {dmParticipantStrip.map((participant) => (
                      <DmStageParticipantChip
                        key={`dm-chip-${participant.userId || participant.username}`}
                        participant={participant}
                      />
                    ))}
                  </div>
                ) : null}

                {remoteScreenShares.length > 0 ? (
                  <div className="voice-call-stage-dm-share-row">
                    {remoteScreenShares.map((share) => (
                      <ScreenShareTile
                        key={`dm-share-${share.producerId}`}
                        share={share}
                        mini
                        selected={
                          selectedRemoteScreenShare?.producerId ===
                          share.producerId
                        }
                        onSelect={onSelectScreenShare}
                        ownerName={share.userName}
                        ownerPfp={share.userPfp}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="voice-call-stage-dm-toolbar">
          {isConnected ? (
            <>
              <button
                type="button"
                className={`voice-call-stage-dm-action ${isMuted ? "danger" : ""}`}
                onClick={() => onToggleMute?.()}
              >
                <span>
                  <MicrophoneIcon muted={isMuted} size={20} />
                </span>
                <small>{isMuted ? "Unmute" : "Mute"}</small>
              </button>
              <button
                type="button"
                className={`voice-call-stage-dm-action ${
                  isDeafened ? "danger" : ""
                }`}
                onClick={() => onToggleDeafen?.()}
              >
                <span>
                  <HeadphonesIcon deafened={isDeafened} size={20} />
                </span>
                <small>{isDeafened ? "Undeafen" : "Deafen"}</small>
              </button>
              <button
                type="button"
                className={`voice-call-stage-dm-action ${
                  isCameraEnabled ? "active" : ""
                }`}
                onClick={() => onToggleCamera?.()}
              >
                <span>{isCameraEnabled ? "📷" : "📸"}</span>
                <small>{isCameraEnabled ? "Camera off" : "Camera"}</small>
              </button>
              <button
                type="button"
                className={`voice-call-stage-dm-action ${
                  isScreenSharing ? "active" : ""
                }`}
                onClick={() => onToggleScreenShare?.()}
              >
                <span>{isScreenSharing ? "🛑" : "🖥️"}</span>
                <small>{isScreenSharing ? "Stop share" : "Share"}</small>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="voice-call-stage-dm-action active"
              onClick={() => onJoin?.()}
            >
              <span>📞</span>
              <small>{joinLabel}</small>
            </button>
          )}

          {isEmbeddedPresentation ? (
            onExpand ? (
              <button
                type="button"
                className="voice-call-stage-dm-action"
                onClick={() => onExpand?.()}
              >
                <span>🖥️</span>
                <small>Full view</small>
              </button>
            ) : null
          ) : (
            <button
              type="button"
              className="voice-call-stage-dm-action"
              onClick={toggleFullscreen}
            >
              <span>{isFullscreen ? "🗗" : "⛶"}</span>
              <small>{isFullscreen ? "Window" : "Fullscreen"}</small>
            </button>
          )}

          {!isEmbeddedPresentation && showClose && onClose ? (
            <button
              type="button"
              className="voice-call-stage-dm-action"
              onClick={() => onClose?.()}
            >
              <span>💬</span>
              <small>Chat</small>
            </button>
          ) : null}

          {isConnected && onLeave ? (
            <button
              type="button"
              className="voice-call-stage-dm-action danger end"
              onClick={() => onLeave?.()}
            >
              <span>📵</span>
              <small>{leaveLabel}</small>
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="voice-call-stage" ref={stageRef}>
      <div className="voice-call-stage-backdrop" aria-hidden="true" />
      <header className="voice-call-stage-header">
        <div className="voice-call-stage-title">
          <span className="voice-call-stage-kicker">
            <span className="voice-call-stage-live-dot" />
            {duration > 0 ? `Live call • ${formatDuration(duration)}` : "Live voice"}
          </span>
          <h2>{title || "Voice Call"}</h2>
          <p>
            {subtitle ||
              `${participantCountLabel} • ${cameraCountLabel} • ${shareCountLabel}`}
          </p>
        </div>

        <div className="voice-call-stage-controls">
          {isConnected ? (
            <>
              <button
                type="button"
                className={`voice-call-stage-control ${isMuted ? "danger" : ""}`}
                onClick={() => onToggleMute?.()}
              >
                <span className="voice-call-stage-control-body">
                  <MicrophoneIcon muted={isMuted} size={15} />
                  <span>{isMuted ? "Unmute" : "Mute"}</span>
                </span>
              </button>
              <button
                type="button"
                className={`voice-call-stage-control ${isDeafened ? "danger" : ""}`}
                onClick={() => onToggleDeafen?.()}
              >
                <span className="voice-call-stage-control-body">
                  <HeadphonesIcon deafened={isDeafened} size={15} />
                  <span>{isDeafened ? "Undeafen" : "Deafen"}</span>
                </span>
              </button>
              <button
                type="button"
                className={`voice-call-stage-control ${isCameraEnabled ? "active" : ""}`}
                onClick={() => onToggleCamera?.()}
              >
                {isCameraEnabled ? "Camera off" : "Camera on"}
              </button>
              <button
                type="button"
                className={`voice-call-stage-control ${isScreenSharing ? "active" : ""}`}
                onClick={() => onToggleScreenShare?.()}
              >
                {isScreenSharing ? "Stop share" : "Share screen"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="voice-call-stage-control active"
              onClick={() => onJoin?.()}
            >
              {joinLabel}
            </button>
          )}

          <button
            type="button"
            className="voice-call-stage-control"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? "Exit full" : "Fullscreen"}
          </button>

          {isConnected && onLeave ? (
            <button
              type="button"
              className="voice-call-stage-control danger"
              onClick={() => onLeave?.()}
            >
              {leaveLabel}
            </button>
          ) : null}

          {showClose && onClose ? (
            <button
              type="button"
              className="voice-call-stage-control ghost"
              onClick={() => onClose?.()}
            >
              Back
            </button>
          ) : null}
        </div>
      </header>

      <div className="voice-call-stage-body">
        <div className="voice-call-stage-hero">
          {selectedRemoteScreenShare ? (
            <div
              className="voice-call-stage-hero-media"
              onDoubleClick={() => void toggleFullscreen()}
            >
              <video ref={heroVideoRef} autoPlay playsInline />
              <div className="voice-call-stage-hero-label">
                <strong>
                  {selectedShareOwner?.username ||
                    selectedRemoteScreenShare.userName ||
                    "Screen Share"}
                </strong>
                <span>
                  {selectedShareOwner?.isSelf
                    ? "You are sharing"
                    : "Tap a different share from the dock to switch focus"}
                </span>
              </div>
            </div>
          ) : (
            <div className="voice-call-stage-empty">
              <div className="voice-call-stage-empty-copy">
                <span className="voice-call-stage-empty-badge">
                  {participantCountLabel}
                </span>
                <h3>{emptyTitle}</h3>
                <p>{emptyDescription}</p>
                {!isConnected && onJoin ? (
                  <button
                    type="button"
                    className="voice-call-stage-empty-cta"
                    onClick={() => onJoin?.()}
                  >
                    {joinLabel}
                  </button>
                ) : null}
              </div>

              <div className="voice-call-stage-focus-grid">
                {spotlightParticipants.map((participant) => (
                  <ParticipantCard
                    key={participant.userId || participant.username}
                    participant={participant}
                  />
                ))}
                {!participants.length && primaryParticipant ? (
                  <ParticipantCard participant={primaryParticipant} />
                ) : null}
              </div>
            </div>
          )}
        </div>

        <aside className="voice-call-stage-sidebar">
          <section className="voice-call-stage-panel">
            <div className="voice-call-stage-panel-head">
              <strong>Camera feeds</strong>
              <span>{cameraCountLabel}</span>
            </div>
            <div className="voice-call-stage-camera-list">
              {cameraParticipants.length ? (
                cameraParticipants.map((participant) => (
                  <ParticipantCard
                    key={`camera-${participant.userId || participant.username}`}
                    participant={participant}
                    compact
                  />
                ))
              ) : (
                <p className="voice-call-stage-panel-empty">
                  Camera feeds will appear here once someone turns one on.
                </p>
              )}
            </div>
          </section>

          <section className="voice-call-stage-panel">
            <div className="voice-call-stage-panel-head">
              <strong>In the room</strong>
              <span>{participantCountLabel}</span>
            </div>
            <div className="voice-call-stage-participant-list">
              {participants.length ? (
                participants.map((participant) => (
                  <ParticipantCard
                    key={participant.userId || participant.username}
                    participant={participant}
                    compact
                  />
                ))
              ) : (
                <p className="voice-call-stage-panel-empty">
                  Join the voice room to see everyone here.
                </p>
              )}
            </div>
          </section>

          <section className="voice-call-stage-panel">
            <div className="voice-call-stage-panel-head">
              <strong>Live shares</strong>
              <span>{shareCountLabel}</span>
            </div>
            <div className="voice-call-stage-share-list">
              {remoteScreenShares.length ? (
                remoteScreenShares.map((share) => (
                  <ScreenShareTile
                    key={share.producerId}
                    share={share}
                    selected={
                      selectedRemoteScreenShare?.producerId === share.producerId
                    }
                    onSelect={onSelectScreenShare}
                    ownerName={share.userName}
                    ownerPfp={share.userPfp}
                  />
                ))
              ) : (
                <p className="voice-call-stage-panel-empty">
                  Screen shares will appear here once someone starts streaming.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <div
        className={`voice-call-stage-dock ${dockMinimized ? "minimized" : ""}`}
        style={{
          width: dockRect.width,
          height: dockMinimized ? undefined : dockRect.height,
          left: dockRect.x,
          top: dockRect.y,
        }}
      >
        <div
          className="voice-call-stage-dock-head"
          onPointerDown={(event) => startDockInteraction("drag", event)}
        >
          <div>
            <strong>Preview Dock</strong>
            <span>Drag to move • pull the corner to resize</span>
          </div>
          <div className="voice-call-stage-dock-head-actions">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setDockMinimized((value) => !value)}
            >
              {dockMinimized ? "Expand" : "Minimize"}
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={resetDock}
            >
              Reset
            </button>
          </div>
        </div>

        {!dockMinimized && (
          <div className="voice-call-stage-dock-body">
            {remoteScreenShares.length > 0 && (
              <div className="voice-call-stage-dock-strip">
                {remoteScreenShares.map((share) => (
                  <ScreenShareTile
                    key={`dock-${share.producerId}`}
                    share={share}
                    mini
                    selected={
                      selectedRemoteScreenShare?.producerId === share.producerId
                    }
                    onSelect={onSelectScreenShare}
                    ownerName={share.userName}
                    ownerPfp={share.userPfp}
                  />
                ))}
              </div>
            )}

            {cameraParticipants.length > 0 && (
              <div className="voice-call-stage-dock-camera-strip">
                {cameraParticipants.map((participant) => (
                  <ParticipantCard
                    key={`dock-camera-${participant.userId || participant.username}`}
                    participant={participant}
                    compact
                  />
                ))}
              </div>
            )}

            <div className="voice-call-stage-dock-participants">
              {participants.map((participant) => (
                <ParticipantCard
                  key={`dock-participant-${participant.userId || participant.username}`}
                  participant={participant}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {!dockMinimized && (
          <button
            type="button"
            className="voice-call-stage-dock-resize"
            aria-label="Resize preview dock"
            onPointerDown={(event) => startDockInteraction("resize", event)}
          />
        )}
      </div>
    </section>
  );
}
