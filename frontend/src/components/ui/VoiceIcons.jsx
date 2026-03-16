function IconFrame({ children, size = 18, className = "", title = "" }) {
  return (
    <span
      className={`voice-icon ${className}`.trim()}
      aria-hidden="true"
      title={title || undefined}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

export function MicrophoneIcon({
  muted = false,
  size = 18,
  className = "",
  title = "",
}) {
  return (
    <IconFrame
      size={size}
      className={className}
      title={title || (muted ? "Muted microphone" : "Microphone")}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6.5 10.5a5.5 5.5 0 0 0 11 0" />
      <path d="M12 16.5v4.5" />
      <path d="M8.5 21h7" />
      {muted ? <path d="M4 4l16 16" /> : null}
    </IconFrame>
  );
}

export function HeadphonesIcon({
  deafened = false,
  size = 18,
  className = "",
  title = "",
}) {
  return (
    <IconFrame
      size={size}
      className={className}
      title={title || (deafened ? "Deafened" : "Headphones")}
    >
      <path d="M4 13a8 8 0 0 1 16 0" />
      <path d="M5.5 12.5v5a1.5 1.5 0 0 0 1.5 1.5h1.5v-7.5H7a1.5 1.5 0 0 0-1.5 1.5Z" />
      <path d="M18.5 12.5v5a1.5 1.5 0 0 1-1.5 1.5h-1.5v-7.5H17a1.5 1.5 0 0 1 1.5 1.5Z" />
      {deafened ? <path d="M4 4l16 16" /> : null}
    </IconFrame>
  );
}
