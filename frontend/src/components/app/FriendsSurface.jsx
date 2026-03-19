export function FriendsSurface({
  friendView,
  setFriendView,
  friendQuery,
  setFriendQuery,
  friendAddInput,
  setFriendAddInput,
  addFriend,
  friendRequests,
  respondToFriendRequest,
  filteredFriends,
  getPresence,
  presenceLabel,
  getActivitySummary,
  renderPresenceAvatar,
  openDmFromFriend,
  openMemberProfile,
}) {
  const visibleFriends =
    friendView === "online"
      ? filteredFriends.filter((friend) => getPresence(friend.id) !== "offline")
      : filteredFriends;

  function getFriendPrimaryLabel(friend) {
    return friend.displayName || friend.username || "Unknown user";
  }

  function truncateLabel(value, maxLength = 60) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  function getFriendSecondaryLabel(friend, maxLength = 60) {
    const activityLabel = getActivitySummary(friend.id, {
      fallback: presenceLabel(getPresence(friend.id)),
      maxLength,
    });
    const hasDisplayName =
      friend.displayName &&
      friend.username &&
      friend.displayName !== friend.username;
    if (hasDisplayName) {
      return truncateLabel(`@${friend.username} · ${activityLabel}`, maxLength);
    }
    return truncateLabel(activityLabel, maxLength);
  }

  return (
    <div className="friends-surface">
      <section className="friends-main">
        <header className="friends-header">
          <h3>Friends</h3>
          <div className="friends-tabs">
            <button
              className={friendView === "online" ? "active" : "ghost"}
              onClick={() => setFriendView("online")}
            >
              Online
            </button>
            <button
              className={friendView === "all" ? "active" : "ghost"}
              onClick={() => setFriendView("all")}
            >
              All
            </button>
            <button
              className={friendView === "add" ? "active" : "ghost"}
              onClick={() => setFriendView("add")}
            >
              Add Friend
            </button>
            <button
              className={friendView === "requests" ? "active" : "ghost"}
              onClick={() => setFriendView("requests")}
            >
              Requests
            </button>
          </div>
        </header>

        <input
          placeholder="Search friends"
          value={friendQuery}
          onChange={(event) => setFriendQuery(event.target.value)}
        />

        {friendView === "add" && (
          <div className="friend-add-card">
            <h4>Add Friend</h4>
            <p className="hint">Type the username and send your request instantly.</p>
            <div className="friend-add-row">
              <input
                placeholder="Username"
                value={friendAddInput}
                onChange={(event) => setFriendAddInput(event.target.value)}
              />
              <button onClick={addFriend}>Send Request</button>
            </div>
          </div>
        )}

        {friendView === "requests" && (
          <div className="friend-add-card">
            <h4>Friend Requests</h4>
            {friendRequests.incoming.map((request) => (
              <div key={request.id} className="friend-row">
                <div className="friend-meta">
                  <strong>{request.username}</strong>
                  <span>Incoming request</span>
                </div>
                <div className="row-actions">
                  <button onClick={() => respondToFriendRequest(request.id, "accept")}>
                    Accept
                  </button>
                  <button
                    className="ghost"
                    onClick={() => respondToFriendRequest(request.id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {friendRequests.outgoing.map((request) => (
              <div key={request.id} className="friend-row">
                <div className="friend-meta">
                  <strong>{request.username}</strong>
                  <span>Pending</span>
                </div>
                <div className="row-actions">
                  <button
                    className="ghost"
                    onClick={() => respondToFriendRequest(request.id, "cancel")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
            {!friendRequests.incoming.length && !friendRequests.outgoing.length && (
              <p className="hint">No pending friend requests.</p>
            )}
          </div>
        )}

        {(friendView === "online" || friendView === "all") &&
          visibleFriends.length === 0 && (
            <div className="friend-empty-state">
              <strong>
                {friendView === "online"
                  ? "No friends are online right now."
                  : "No friends matched that search."}
              </strong>
              <p className="hint">
                {friendView === "online"
                  ? "Try switching to All, sending a new request, or checking back a little later."
                  : "Clear the search or send a new request to start building your network."}
              </p>
            </div>
          )}

        {visibleFriends.map((friend) => {
          const primaryLabel = getFriendPrimaryLabel(friend);
          const secondaryLabel = getFriendSecondaryLabel(friend);
          return (
            <div key={friend.id} className="friend-row">
              <div className="friend-row-main">
                {renderPresenceAvatar({
                  userId: friend.id,
                  username: primaryLabel,
                  pfpUrl: friend.pfp_url,
                  size: 32,
                })}
                <div className="friend-meta">
                  <strong>{primaryLabel}</strong>
                  <span title={secondaryLabel}>
                    {secondaryLabel}
                  </span>
                </div>
              </div>
              <button
                className="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  openDmFromFriend(friend);
                }}
              >
                Message
              </button>
            </div>
          );
        })}
      </section>

      <aside className="active-now">
        <h4>Active Now</h4>
        {filteredFriends.slice(0, 5).map((friend) => {
          const primaryLabel = getFriendPrimaryLabel(friend);
          const secondaryLabel = getFriendSecondaryLabel(friend, 48);
          return (
            <button
              key={`active-${friend.id}`}
              className="active-card"
              onClick={(event) => {
                event.stopPropagation();
                openMemberProfile(friend, {
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
            >
                <div className="friend-row-main">
                  {renderPresenceAvatar({
                    userId: friend.id,
                    username: primaryLabel,
                    pfpUrl: friend.pfp_url,
                    size: 30,
                  })}
                  <div className="friend-meta">
                    <strong>{primaryLabel}</strong>
                    <span title={secondaryLabel}>
                      {secondaryLabel}
                    </span>
                  </div>
                </div>
            </button>
          );
        })}
        {!filteredFriends.length && (
          <p className="hint">When friends are active, they will appear here.</p>
        )}
      </aside>
    </div>
  );
}
