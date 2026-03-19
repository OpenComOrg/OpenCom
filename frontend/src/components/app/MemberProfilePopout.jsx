import { useEffect, useMemo, useState } from "react";
import { SafeAvatar } from "../ui/SafeAvatar";

function formatDurationLabel(totalSeconds) {
  const safeTotal = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeTotal / 60);
  const seconds = safeTotal % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function MemberProfilePopout({
  memberProfileCard,
  memberProfilePopoutRef,
  profileCardPosition,
  openMemberContextMenu,
  startDraggingProfileCard,
  profileImageUrl,
  getInitials,
  presenceLabel,
  getPresence,
  formatAccountCreated,
  getBadgePresentation,
  guildState,
  getRichPresence,
  openDmFromFriend,
  openFullProfileViewer,
  canKickMembers,
  me,
  kickMember,
  canBanMembers,
  banMember,
  setMemberProfileCard,
}) {
  const richPresence = memberProfileCard
    ? getRichPresence(memberProfileCard.id)
    : null;
  const hasTimedActivity = Boolean(
    richPresence?.startTimestamp || richPresence?.endTimestamp,
  );
  const [activityNow, setActivityNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasTimedActivity) return undefined;
    setActivityNow(Date.now());
    const timer = window.setInterval(() => {
      setActivityNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasTimedActivity, richPresence?.startTimestamp, richPresence?.endTimestamp]);

  const activityTimeline = useMemo(() => {
    if (!richPresence) return null;
    const startMs = Number(richPresence.startTimestamp || 0) * 1000;
    const endMs = Number(richPresence.endTimestamp || 0) * 1000;
    const hasStart = Number.isFinite(startMs) && startMs > 0;
    const hasEnd = Number.isFinite(endMs) && endMs > 0;
    if (!hasStart && !hasEnd) return null;

    const elapsedSeconds = hasStart
      ? Math.max(0, Math.floor((activityNow - startMs) / 1000))
      : 0;
    const totalSeconds = hasStart && hasEnd
      ? Math.max(0, Math.floor((endMs - startMs) / 1000))
      : 0;
    const remainingSeconds = hasEnd
      ? Math.max(0, Math.floor((endMs - activityNow) / 1000))
      : 0;
    const progress = totalSeconds > 0
      ? Math.max(0, Math.min(1, elapsedSeconds / totalSeconds))
      : null;

    return {
      elapsedLabel: hasStart ? formatDurationLabel(elapsedSeconds) : null,
      remainingLabel: hasEnd ? formatDurationLabel(remainingSeconds) : null,
      progress,
    };
  }, [activityNow, richPresence]);

  if (!memberProfileCard) return null;

  return (
    <div
      ref={memberProfilePopoutRef}
      className="member-profile-popout"
      style={{
        left: profileCardPosition.x,
        top: profileCardPosition.y,
        right: "auto",
        bottom: "auto",
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) =>
        openMemberContextMenu(event, memberProfileCard)
      }
    >
      <div
        className="popout-drag-handle"
        onPointerDown={startDraggingProfileCard}
      >
        Drag
      </div>
      <div
        className="popout-banner"
        style={{
          backgroundImage: memberProfileCard.bannerUrl
            ? `url(${profileImageUrl(memberProfileCard.bannerUrl)})`
            : undefined,
        }}
      />
      <div className="popout-content">
        <SafeAvatar
          src={profileImageUrl(memberProfileCard.pfpUrl)}
          alt="Profile avatar"
          name={
            memberProfileCard.displayName ||
            memberProfileCard.username ||
            "User"
          }
          seed={memberProfileCard.id || memberProfileCard.username}
          className="avatar popout-avatar"
          imgClassName="avatar-image"
        />
        <h4>
          {memberProfileCard.displayName || memberProfileCard.username}
        </h4>
        <p className="hint">
          @{memberProfileCard.username} ·{" "}
          {presenceLabel(
            getPresence(memberProfileCard?.id) ||
              memberProfileCard?.status ||
              "offline",
          )}
        </p>
        {memberProfileCard.platformTitle && (
          <p className="hint">{memberProfileCard.platformTitle}</p>
        )}
        {formatAccountCreated(memberProfileCard.createdAt) && (
          <p className="hint">
            Account created:{" "}
            {formatAccountCreated(memberProfileCard.createdAt)}
          </p>
        )}
        {Array.isArray(memberProfileCard.badgeDetails) &&
          memberProfileCard.badgeDetails.length > 0 && (
            <div className="popout-roles">
              {memberProfileCard.badgeDetails.map((badge, index) => {
                const display = getBadgePresentation(badge);
                return (
                  <span
                    key={`${badge.id || badge.name || "badge"}-${index}`}
                    className={`popout-role-tag ${display.imageUrl ? "has-media" : ""}`}
                    title={display.name}
                    style={{
                      backgroundColor: display.bgColor,
                      color: display.fgColor,
                      borderColor: display.bgColor,
                    }}
                  >
                    {display.imageUrl ? (
                      <img
                        className="popout-role-badge-image"
                        src={display.imageUrl}
                        alt={display.name}
                      />
                    ) : String(display.name || "").toUpperCase() === "OFFICIAL" ? (
                      `${display.icon} ${display.name}`
                    ) : (
                      display.icon
                    )}
                  </span>
                );
              })}
            </div>
          )}
        {memberProfileCard.roleIds?.length > 0 && guildState?.roles && (
          <div className="popout-roles">
            {(guildState.roles || [])
              .filter(
                (r) =>
                  (memberProfileCard.roleIds || []).includes(r.id) &&
                  !r.is_everyone,
              )
              .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
              .map((role) => {
                const hex =
                  role.color != null && role.color !== ""
                    ? typeof role.color === "number"
                      ? `#${Number(role.color).toString(16).padStart(6, "0")}`
                      : role.color
                    : "#99aab5";
                return (
                  <span
                    key={role.id}
                    className="popout-role-tag"
                    style={{
                      backgroundColor: hex + "22",
                      color: hex,
                      borderColor: hex,
                    }}
                  >
                    {role.name}
                  </span>
                );
              })}
          </div>
        )}
        <p>{memberProfileCard.bio || "No bio set."}</p>
        {richPresence ? (
          <div className="profile-rich-presence-card">
            <div className="profile-rich-presence-main">
              <div className="profile-rich-presence-art">
                {richPresence.largeImageUrl ? (
                  <img
                    src={profileImageUrl(richPresence.largeImageUrl)}
                    alt={
                      richPresence.largeImageText ||
                      richPresence.name ||
                      "Activity"
                    }
                    className="profile-rich-presence-art-image"
                  />
                ) : (
                  <div className="profile-rich-presence-art-fallback">
                    {(richPresence.name || getInitials(memberProfileCard.displayName || memberProfileCard.username || "A")).slice(0, 1).toUpperCase()}
                  </div>
                )}
                {richPresence.smallImageUrl && (
                  <span className="profile-rich-presence-art-badge">
                    <img
                      src={profileImageUrl(richPresence.smallImageUrl)}
                      alt={richPresence.smallImageText || "Activity icon"}
                    />
                  </span>
                )}
              </div>
              <div className="profile-rich-presence-copy">
                <span className="profile-rich-presence-label">
                  {richPresence.name || "Activity"}
                </span>
                {richPresence.details && (
                  <strong className="profile-rich-presence-title">
                    {richPresence.details}
                  </strong>
                )}
                {richPresence.state && (
                  <span className="profile-rich-presence-subtitle">
                    {richPresence.state}
                  </span>
                )}
                {richPresence.largeImageText && !richPresence.details && (
                  <span className="profile-rich-presence-subtitle">
                    {richPresence.largeImageText}
                  </span>
                )}
                {richPresence.smallImageText && (
                  <span className="profile-rich-presence-meta">
                    {richPresence.smallImageText}
                  </span>
                )}
              </div>
            </div>
            {activityTimeline?.progress != null && (
              <div className="profile-rich-presence-timeline">
                <div className="profile-rich-presence-progress">
                  <span
                    className="profile-rich-presence-progress-fill"
                    style={{ width: `${activityTimeline.progress * 100}%` }}
                  />
                </div>
                <div className="profile-rich-presence-times">
                  <span>{activityTimeline.elapsedLabel || "00:00"}</span>
                  <span>{activityTimeline.remainingLabel || "00:00"}</span>
                </div>
              </div>
            )}
            {Array.isArray(richPresence.buttons) &&
              richPresence.buttons.length > 0 && (
                <div className="profile-rich-presence-buttons">
                  {richPresence.buttons.map((button, index) => (
                    <a
                      key={`${button.url}-${index}`}
                      href={button.url}
                      target="_blank"
                      rel="noreferrer"
                      className="profile-rich-presence-button"
                    >
                      {button.label}
                    </a>
                  ))}
                </div>
              )}
          </div>
        ) : null}
        <div className="popout-actions">
          <button
            className="ghost"
            onClick={() =>
              openDmFromFriend({
                id: memberProfileCard.id,
                username: memberProfileCard.username,
              })
            }
          >
            Message
          </button>
          <button
            className="ghost"
            onClick={() => openFullProfileViewer(memberProfileCard)}
          >
            View Full Profile
          </button>
          {canKickMembers && memberProfileCard.id !== me?.id && (
            <button
              className="ghost"
              onClick={() => kickMember(memberProfileCard.id)}
            >
              Kick
            </button>
          )}
          {canBanMembers && memberProfileCard.id !== me?.id && (
            <button
              className="danger"
              onClick={() => banMember(memberProfileCard.id, "")}
            >
              Ban
            </button>
          )}
          <button onClick={() => setMemberProfileCard(null)}>Close</button>
        </div>
      </div>
    </div>
  );
}
