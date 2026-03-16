import { useEffect, useRef } from "react";
import { SafeAvatar } from "./ui/SafeAvatar";
import { MicrophoneIcon } from "./ui/VoiceIcons";

// ─── Tiny ring-tone generator (no external deps) ─────────────────────────────
function useRingTone(active) {
  const ctxRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    function beep() {
      try {
        const ctx = new AudioCtx();
        ctxRef.current = ctx;
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
        gain.gain.linearRampToValueAtTime(0, now + 0.38);

        [
          [440, 0],
          [550, 0.15],
        ].forEach(([freq, offset]) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(now + offset);
          osc.stop(now + 0.4);
        });

        setTimeout(() => ctx.close().catch(() => {}), 600);
      } catch {}
    }

    beep();
    timerRef.current = setInterval(beep, 3200);

    return () => {
      clearInterval(timerRef.current);
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [active]);
}

// ─── Small avatar helper ──────────────────────────────────────────────────────
function CallAvatar({ pfpUrl, username, size = 56 }) {
  return (
    <SafeAvatar
      src={pfpUrl}
      alt={username}
      name={username}
      seed={username}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        fontSize: size * 0.38,
      }}
      imgStyle={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IncomingCallToast
//
// Full-screen dimmed overlay shown when another user is calling you.
// Props:
//   call      – { callId, callerId, callerName, callerPfp }
//   onAccept  – () => void
//   onDecline – () => void
// ─────────────────────────────────────────────────────────────────────────────
export function IncomingCallToast({ call, onAccept, onDecline }) {
  useRingTone(!!call);

  if (!call) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incoming voice call"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        style={{
          background: "var(--bg-elev, #1a2741)",
          border: "1px solid var(--border-subtle, rgba(152,174,219,0.2))",
          borderRadius: "clamp(16px,1.4vw,28px)",
          padding: "clamp(28px,3vw,48px) clamp(32px,4vw,56px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "clamp(14px,1.4vw,24px)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          minWidth: "clamp(260px,28vw,380px)",
          maxWidth: "min(94vw, 400px)",
          textAlign: "center",
          animation: "slideUp 0.22s cubic-bezier(.22,1,.36,1)",
        }}
      >
        {/* Pulsing ring around avatar */}
        <div style={{ position: "relative", width: 68, height: 68 }}>
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: "2px solid var(--brand, #7386ff)",
              animation: "ringPulse 1.6s ease-in-out infinite",
              opacity: 0.55,
            }}
          />
          <CallAvatar
            pfpUrl={call.callerPfp}
            username={call.callerName}
            size={68}
          />
        </div>

        <div>
          <p
            style={{
              margin: 0,
              fontSize: "clamp(11px,0.9vw,13px)",
              color: "var(--text-dim, #90a5cf)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Incoming voice call
          </p>
          <h2
            style={{
              margin: "4px 0 0",
              fontSize: "clamp(18px,1.5vw,24px)",
              color: "var(--text-main, #edf2ff)",
              fontWeight: 700,
            }}
          >
            {call.callerName}
          </h2>
        </div>

        <div
          style={{ display: "flex", gap: "clamp(10px,1vw,16px)", marginTop: 4 }}
        >
          <button
            onClick={onDecline}
            style={{
              background: "var(--danger, #ef5f76)",
              border: "none",
              borderRadius: "50%",
              width: 56,
              height: 56,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              fontSize: 22,
              transition: "opacity 0.15s, transform 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.8";
              e.currentTarget.style.transform = "scale(1.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "scale(1)";
            }}
            aria-label="Decline call"
          >
            📵
          </button>
          <button
            onClick={onAccept}
            style={{
              background: "var(--green, #37cd93)",
              border: "none",
              borderRadius: "50%",
              width: 56,
              height: 56,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              fontSize: 22,
              transition: "opacity 0.15s, transform 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.8";
              e.currentTarget.style.transform = "scale(1.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "scale(1)";
            }}
            aria-label="Accept call"
          >
            📞
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp  { from { transform: translateY(32px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes ringPulse {
          0%,100% { transform: scale(1);    opacity: 0.55 }
          50%      { transform: scale(1.22); opacity: 0.2  }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActiveCallBar
//
// Slim floating bar shown at the bottom of the screen while in a private call.
// Props:
//   call      – { callId, otherName, otherPfp, channelId }
//   isMuted   – boolean
//   duration  – seconds elapsed (passed in from parent, incremented via useEffect)
//   onMute    – () => void
//   onEnd     – () => void
// ─────────────────────────────────────────────────────────────────────────────
export function ActiveCallBar({ call, isMuted, duration = 0, onMute, onEnd }) {
  if (!call) return null;

  const mins = String(Math.floor(duration / 60)).padStart(2, "0");
  const secs = String(duration % 60).padStart(2, "0");

  return (
    <div
      style={{
        position: "fixed",
        bottom: "clamp(12px,1.2vw,20px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 8000,
        background: "var(--bg-elev, #1a2741)",
        border: "1px solid var(--border-subtle, rgba(152,174,219,0.2))",
        borderRadius: "clamp(12px,1vw,20px)",
        padding: "clamp(8px,0.7vw,12px) clamp(14px,1.2vw,20px)",
        display: "flex",
        alignItems: "center",
        gap: "clamp(10px,0.9vw,16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        animation: "slideUp 0.22s cubic-bezier(.22,1,.36,1)",
        userSelect: "none",
      }}
    >
      <CallAvatar pfpUrl={call.otherPfp} username={call.otherName} size={32} />

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            fontSize: "clamp(12px,0.9vw,14px)",
            fontWeight: 600,
            color: "var(--text-main, #edf2ff)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "clamp(80px,8vw,140px)",
          }}
        >
          {call.otherName}
        </span>
        <span
          style={{
            fontSize: "clamp(10px,0.75vw,12px)",
            color: "var(--green, #37cd93)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          🔊 {mins}:{secs}
        </span>
      </div>

      {/* Mute */}
      <button
        onClick={onMute}
        title={isMuted ? "Unmute" : "Mute"}
        style={{
          background: isMuted
            ? "var(--danger, #ef5f76)"
            : "rgba(255,255,255,0.08)",
          border: "none",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer",
          fontSize: 16,
          color: "var(--text-main, #edf2ff)",
          transition: "background 0.15s",
        }}
      >
        <MicrophoneIcon muted={isMuted} size={16} />
      </button>

      {/* End call */}
      <button
        onClick={onEnd}
        title="End call"
        style={{
          background: "var(--danger, #ef5f76)",
          border: "none",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer",
          fontSize: 16,
          color: "#fff",
          fontWeight: 600,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        End
      </button>

      <style>{`
        @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity: 0 } to { transform: translateX(-50%) translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CallMessageCard
//
// Replaces the raw "__CALL_REQUEST__" system message in the DM log with a
// styled card the user can click to join the call (if it's still active).
//
// Props:
//   message        – the raw message object { id, authorId, createdAt, … }
//   me             – { id }
//   activeCallId   – string | null  (current active call id, if any)
//   onJoin         – (callId) => void  (only shown when call is active)
//   callerName     – string
// ─────────────────────────────────────────────────────────────────────────────
export function CallMessageCard({
  message,
  me,
  activeCallId,
  onJoin,
  callerName,
}) {
  const isOutgoing = message.authorId === me?.id;
  const label = isOutgoing
    ? "You started a call"
    : `${callerName || "Someone"} is calling`;
  const isLive = !!activeCallId;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: "var(--bg-chat-alt, #1a2a45)",
        border: "1px solid var(--border-subtle, rgba(152,174,219,0.2))",
        borderRadius: "clamp(8px,0.7vw,14px)",
        padding: "clamp(8px,0.7vw,12px) clamp(12px,1vw,18px)",
        margin: "2px 0",
        maxWidth: "clamp(220px,24vw,320px)",
        cursor: isLive && !isOutgoing ? "pointer" : "default",
        transition: "background 0.15s",
      }}
      onClick={() => isLive && !isOutgoing && onJoin && onJoin(activeCallId)}
      onMouseEnter={(e) => {
        if (isLive && !isOutgoing)
          e.currentTarget.style.background =
            "var(--bg-hover, rgba(132,165,255,0.16))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-chat-alt, #1a2a45)";
      }}
      role={isLive && !isOutgoing ? "button" : undefined}
      aria-label={isLive && !isOutgoing ? "Join voice call" : undefined}
    >
      <span style={{ fontSize: 20 }}>📞</span>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            fontSize: "clamp(12px,0.9vw,14px)",
            fontWeight: 600,
            color: "var(--text-main, #edf2ff)",
          }}
        >
          {label}
        </span>
        {isLive && !isOutgoing ? (
          <span
            style={{
              fontSize: "clamp(10px,0.75vw,12px)",
              color: "var(--green, #37cd93)",
              fontWeight: 600,
            }}
          >
            Tap to join →
          </span>
        ) : (
          <span
            style={{
              fontSize: "clamp(10px,0.75vw,12px)",
              color: "var(--text-dim, #90a5cf)",
            }}
          >
            {isLive ? "In progress" : "Call ended"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OutgoingCallToast
//
// Shown to the caller while waiting for the other person to pick up.
// Props:
//   call     – { calleeName, calleePfp }
//   onCancel – () => void
// ─────────────────────────────────────────────────────────────────────────────
export function OutgoingCallToast({ call, onCancel }) {
  if (!call) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "clamp(12px,1.2vw,20px)",
        right: "clamp(12px,1.2vw,20px)",
        zIndex: 8500,
        background: "var(--bg-elev, #1a2741)",
        border: "1px solid var(--border-subtle, rgba(152,174,219,0.2))",
        borderRadius: "clamp(12px,1vw,20px)",
        padding: "clamp(14px,1.2vw,20px) clamp(18px,1.6vw,28px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        minWidth: "clamp(180px,16vw,240px)",
        textAlign: "center",
        animation: "slideInRight 0.22s cubic-bezier(.22,1,.36,1)",
      }}
    >
      <CallAvatar
        pfpUrl={call.calleePfp}
        username={call.calleeName}
        size={44}
      />

      <div>
        <p
          style={{
            margin: 0,
            fontSize: "clamp(10px,0.75vw,12px)",
            color: "var(--text-dim, #90a5cf)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          Calling…
        </p>
        <strong
          style={{
            fontSize: "clamp(14px,1.1vw,17px)",
            color: "var(--text-main, #edf2ff)",
          }}
        >
          {call.calleeName}
        </strong>
      </div>

      <button
        onClick={onCancel}
        style={{
          background: "var(--danger, #ef5f76)",
          border: "none",
          borderRadius: "50%",
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          fontSize: 18,
          transition: "opacity 0.15s, transform 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.transform = "scale(1.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.transform = "scale(1)";
        }}
        aria-label="Cancel call"
      >
        📵
      </button>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(32px); opacity: 0 }
          to   { transform: translateX(0);    opacity: 1 }
        }
      `}</style>
    </div>
  );
}
