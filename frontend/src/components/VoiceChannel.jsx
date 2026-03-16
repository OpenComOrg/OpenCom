import { useState, useEffect, useRef } from "react";
import { SafeAvatar } from "./ui/SafeAvatar";
import { HeadphonesIcon, MicrophoneIcon } from "./ui/VoiceIcons";

export function VoiceChannel({ 
  channelId, 
  channelName,
  voiceMembers = [],
  isConnected = false,
  onConnect,
  onDisconnect,
  onMuteToggle,
  onDeafenToggle
}) {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [callActive, setCallActive] = useState(false);

  const handleConnect = async () => {
    try {
      await onConnect?.(channelId);
      setCallActive(true);
    } catch (err) {
      console.error("Failed to join voice:", err);
    }
  };

  const handleDisconnect = async () => {
    try {
      await onDisconnect?.();
      setCallActive(false);
    } catch (err) {
      console.error("Failed to leave voice:", err);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      borderRadius: "12px",
      background: "var(--bg-elev)",
      border: "1px solid var(--border-subtle)"
    }}>
      <div>
        <h3 style={{ margin: "0 0 8px 0" }}>🔊 {channelName}</h3>
        <p style={{ margin: "0", fontSize: "13px", color: "var(--text-dim)" }}>
          {voiceMembers.length} {voiceMembers.length === 1 ? "member" : "members"}
        </p>
      </div>

      {voiceMembers.length > 0 && (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: "8px"
        }}>
          {voiceMembers.map(member => (
            <div key={member.id} style={{
              padding: "8px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "8px",
              textAlign: "center",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px"
            }}>
              <SafeAvatar
                src={member.pfp_url}
                alt={member.username}
                name={member.username}
                seed={member.id}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  fontWeight: "bold",
                }}
                imgStyle={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <div>
                {member.username}
                {member.deafened ? (
                  <span style={{ marginInlineStart: "6px" }}>
                    <HeadphonesIcon deafened size={13} />
                  </span>
                ) : member.muted ? (
                  <span style={{ marginInlineStart: "6px" }}>
                    <MicrophoneIcon muted size={13} />
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        {!callActive ? (
          <button onClick={handleConnect} style={{ flex: 1 }}>
            Join Voice
          </button>
        ) : (
          <>
            <button 
              onClick={() => {
                setIsMuted(!isMuted);
                onMuteToggle?.(!isMuted);
              }}
              className={isMuted ? "danger" : ""}
              style={{ flex: 1 }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <MicrophoneIcon muted={isMuted} size={16} />
                <span>{isMuted ? "Unmute" : "Mute"}</span>
              </span>
            </button>
            <button 
              onClick={() => {
                setIsDeafened(!isDeafened);
                onDeafenToggle?.(!isDeafened);
              }}
              className={isDeafened ? "danger" : ""}
              style={{ flex: 1 }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <HeadphonesIcon deafened={isDeafened} size={16} />
                <span>{isDeafened ? "Undeafen" : "Deafen"}</span>
              </span>
            </button>
            <button onClick={handleDisconnect} className="danger" style={{ flex: 1 }}>
              Leave
            </button>
          </>
        )}
      </div>
    </div>
  );
}
