import { useState, useEffect, useRef } from "react";

export function MessageView({ 
  messages = [], 
  currentUserId,
  channelName,
  onSendMessage,
  isLoading = false
}) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      await onSendMessage?.(inputText.trim());
      setInputText("");
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // Group messages by author and time
  const messageGroups = [];
  let currentGroup = null;

  for (const msg of messages) {
    const msgTime = new Date(msg.createdAt);
    const shouldGroup = currentGroup 
      && currentGroup.authorId === msg.authorId
      && (msgTime.getTime() - new Date(currentGroup.lastTime).getTime()) < 120000;

    if (shouldGroup) {
      currentGroup.messages.push(msg);
      currentGroup.lastTime = msg.createdAt;
    } else {
      currentGroup = {
        authorId: msg.authorId,
        author: msg.username,
        pfpUrl: msg.pfp_url,
        firstTime: msg.createdAt,
        lastTime: msg.createdAt,
        messages: [msg]
      };
      messageGroups.push(currentGroup);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ 
        padding: "16px", 
        borderBottom: "1px solid var(--border-subtle)",
        background: "rgba(255,255,255,0.02)"
      }}>
        <h2 style={{ margin: 0 }}># {channelName}</h2>
      </div>

      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }}>
        {messageGroups.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-dim)", marginTop: "32px" }}>
            No messages yet. Start the conversation!
          </div>
        )}

        {messageGroups.map((group, idx) => (
          <div key={idx} style={{ display: "flex", gap: "12px" }}>
            {group.pfpUrl ? (
              <img
                src={group.pfpUrl}
                alt={group.author}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0
                }}
              />
            ) : (
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: `hsl(${Math.abs(group.authorId.charCodeAt(0) * 7) % 360}, 70%, 60%)`,
                display: "grid",
                placeItems: "center",
                fontSize: "14px",
                fontWeight: "bold",
                flexShrink: 0
              }}>
                {group.author?.substring(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", marginBottom: "2px" }}>
                <strong>{group.author}</strong>
                <span style={{ color: "var(--text-dim)", marginLeft: "8px", fontSize: "11px" }}>
                  {new Date(group.firstTime).toLocaleTimeString()}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {group.messages.map((msg, idx) => (
                  <div key={idx} style={{ wordBreak: "break-word", color: "var(--text-soft)" }}>
                    {msg.content}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} style={{
        padding: "16px",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        gap: "8px"
      }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1 }}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !inputText.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
