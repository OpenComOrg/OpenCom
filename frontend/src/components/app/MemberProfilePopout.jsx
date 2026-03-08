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
            <div className="avatar popout-avatar">
              {memberProfileCard.pfpUrl ? (
                <img
                  src={profileImageUrl(memberProfileCard.pfpUrl)}
                  alt="Profile avatar"
                  className="avatar-image"
                />
              ) : (
                getInitials(
                  memberProfileCard.displayName ||
                    memberProfileCard.username ||
                    "User",
                )
              )}
            </div>
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
                        className="popout-role-tag"
                        title={display.name}
                        style={{
                          backgroundColor: display.bgColor,
                          color: display.fgColor,
                          borderColor: display.bgColor,
                        }}
                      >
                        {String(display.name || "").toUpperCase() ===
                        "OFFICIAL"
                          ? `${display.icon} ${display.name}`
                          : display.icon}
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
            {(() => {
              const rich = getRichPresence(memberProfileCard.id);
              return rich ? (
                <div
                  className="message-embed-card"
                  style={{ marginTop: "8px", marginBottom: "8px" }}
                >
                  {rich.largeImageUrl && (
                    <img
                      src={rich.largeImageUrl}
                      alt={rich.largeImageText || "Activity"}
                      style={{
                        width: "100%",
                        borderRadius: "8px",
                        marginBottom: "6px",
                      }}
                    />
                  )}
                  <strong>{rich.name || "Activity"}</strong>
                  {rich.details && <p>{rich.details}</p>}
                  {rich.state && <p>{rich.state}</p>}
                  {Array.isArray(rich.buttons) && rich.buttons.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                        marginTop: "6px",
                      }}
                    >
                      {rich.buttons.map((button, index) => (
                        <a
                          key={`${button.url}-${index}`}
                          href={button.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ghost"
                          style={{
                            padding: "4px 8px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            textDecoration: "none",
                            color: "var(--text-soft)",
                          }}
                        >
                          {button.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : null;
            })()}
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
