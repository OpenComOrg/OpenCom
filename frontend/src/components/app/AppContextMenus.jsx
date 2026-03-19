export function AppContextMenus({
  messageContextMenu,
  addMessageReaction,
  setReplyTarget,
  setDmReplyTarget,
  reportMessage,
  setMessageContextMenu,
  togglePinMessage,
  setStatus,
  canDeleteServerMessages,
  deleteServerMessage,
  deleteDmMessage,
  memberContextMenu,
  voiceStateByUserId,
  getVoiceMemberAudioPref,
  setVoiceMemberAudioPref,
  promptSetVoiceMemberLocalVolume,
  me,
  canServerMuteMembers,
  canServerDeafenMembers,
  canMoveVoiceMembers,
  setServerVoiceMemberState,
  disconnectVoiceMember,
  openMemberProfile,
  openDmFromFriend,
  canKickMembers,
  kickMember,
  canBanMembers,
  banMember,
  canModerateMembers,
  setModerationMemberId,
  setSettingsOpen,
  setSettingsTab,
  setMemberContextMenu,
  serverContextMenu,
  openServerFromContext,
  canAccessServerAdminPanel,
  openServerAdmin,
  canManageServer,
  activeServerId,
  workingGuildId,
  promptCreateChannelFlow,
  moveServerInRail,
  setInviteServerId,
  copyServerId,
  leaveServer,
  deleteServer,
  setServerContextMenu,
  channelContextMenu,
  openChannelSettings,
  setChannelPermsChannelId,
  setChannelContextMenu,
  setActiveChannelId,
  deleteChannelById,
  categoryContextMenu,
  setCategoryContextMenu,
}) {
  return (
    <>
      {messageContextMenu && (
        <div
          className="server-context-menu"
          style={{ top: messageContextMenu.y, left: messageContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              addMessageReaction(
                messageContextMenu.message,
                messageContextMenu.message.kind,
              );
              setMessageContextMenu(null);
            }}
          >
            Add Reaction
          </button>
          {messageContextMenu.message.kind === "server" && (
            <button
              onClick={() => {
                setReplyTarget({
                  author: messageContextMenu.message.author,
                  content: messageContextMenu.message.content,
                });
                setMessageContextMenu(null);
              }}
            >
              Reply
            </button>
          )}
          {messageContextMenu.message.kind === "dm" && (
            <button
              onClick={() => {
                setDmReplyTarget({
                  author: messageContextMenu.message.author,
                  content: messageContextMenu.message.content,
                });
                setMessageContextMenu(null);
              }}
            >
              Reply
            </button>
          )}
          {!messageContextMenu.message.mine &&
            messageContextMenu.message.authorId && (
              <button
                className="danger"
                onClick={() => {
                  reportMessage(messageContextMenu.message);
                  setMessageContextMenu(null);
                }}
              >
                Report Message
              </button>
            )}
          <button
            onClick={() => {
              togglePinMessage(messageContextMenu.message);
              setMessageContextMenu(null);
            }}
          >
            {messageContextMenu.message.pinned ? "Unpin" : "Pin"}
          </button>
          {messageContextMenu.message.kind === "dm" && (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    messageContextMenu.message.content || "",
                  );
                  setStatus("Copied message text.");
                } catch {
                  setStatus("Could not copy message text.");
                }
                setMessageContextMenu(null);
              }}
            >
              Copy Text
            </button>
          )}
          {(messageContextMenu.message.mine || canDeleteServerMessages) &&
            messageContextMenu.message.kind === "server" && (
              <button
                className="danger"
                onClick={() =>
                  deleteServerMessage(messageContextMenu.message.id)
                }
              >
                Delete
              </button>
            )}
          {messageContextMenu.message.mine &&
            messageContextMenu.message.kind === "dm" && (
              <button
                className="danger"
                onClick={() => deleteDmMessage(messageContextMenu.message.id)}
              >
                Delete
              </button>
            )}
        </div>
      )}

      {memberContextMenu && (
        <div
          className="server-context-menu"
          style={{ top: memberContextMenu.y, left: memberContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const memberId = memberContextMenu.member?.id;
            const memberVoice = memberId
              ? voiceStateByUserId.get(memberId)
              : null;
            const localVoicePref = getVoiceMemberAudioPref(memberId);
            return (
              <>
                {memberVoice?.channelId && (
                  <button className="ghost" disabled>
                    In voice: {memberVoice.channelId}
                  </button>
                )}
                <button
                  onClick={() => {
                    setVoiceMemberAudioPref(memberId, {
                      muted: !localVoicePref.muted,
                    });
                    setStatus(
                      localVoicePref.muted
                        ? "Local voice unmuted for member."
                        : "Local voice muted for member.",
                    );
                    setMemberContextMenu(null);
                  }}
                >
                  {localVoicePref.muted ? "Local Unmute" : "Local Mute"}
                </button>
                <button
                  onClick={async () => {
                    await promptSetVoiceMemberLocalVolume(memberId);
                    setMemberContextMenu(null);
                  }}
                >
                  Local Volume ({localVoicePref.volume}%)
                </button>
                {memberVoice?.channelId &&
                  memberId !== me?.id &&
                  canServerMuteMembers && (
                    <button
                      className={memberVoice.muted ? "danger" : "ghost"}
                      onClick={async () => {
                        await setServerVoiceMemberState(
                          memberVoice.channelId,
                          memberId,
                          { muted: !memberVoice.muted },
                        );
                        setMemberContextMenu(null);
                      }}
                    >
                      {memberVoice.muted ? "Server Unmute" : "Server Mute"}
                    </button>
                  )}
                {memberVoice?.channelId &&
                  memberId !== me?.id &&
                  canServerDeafenMembers && (
                    <button
                      className={memberVoice.deafened ? "danger" : "ghost"}
                      onClick={async () => {
                        await setServerVoiceMemberState(
                          memberVoice.channelId,
                          memberId,
                          { deafened: !memberVoice.deafened },
                        );
                        setMemberContextMenu(null);
                      }}
                    >
                      {memberVoice.deafened
                        ? "Server Undeafen"
                        : "Server Deafen"}
                    </button>
                  )}
                {memberVoice?.channelId &&
                  memberId !== me?.id &&
                  canMoveVoiceMembers && (
                    <button
                      className="danger"
                      onClick={async () => {
                        await disconnectVoiceMember(
                          memberVoice.channelId,
                          memberId,
                        );
                        setMemberContextMenu(null);
                      }}
                    >
                      Disconnect From VC
                    </button>
                  )}
              </>
            );
          })()}
          <button
            onClick={() => {
              openMemberProfile(memberContextMenu.member, {
                x: memberContextMenu.x,
                y: memberContextMenu.y,
              });
              setMemberContextMenu(null);
            }}
          >
            View Profile
          </button>
          <button
            onClick={() => {
              openDmFromFriend({
                id: memberContextMenu.member.id,
                username:
                  memberContextMenu.member.username ||
                  memberContextMenu.member.id,
              });
              setMemberContextMenu(null);
            }}
          >
            Message
          </button>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  memberContextMenu.member.id || "",
                );
                setStatus("User ID copied.");
              } catch {
                setStatus("Could not copy user ID.");
              }
              setMemberContextMenu(null);
            }}
          >
            Copy User ID
          </button>
          {canKickMembers && memberContextMenu.member.id !== me?.id && (
            <button
              className="danger"
              onClick={async () => {
                await kickMember(memberContextMenu.member.id);
                setMemberContextMenu(null);
              }}
            >
              Kick Member
            </button>
          )}
          {canBanMembers && memberContextMenu.member.id !== me?.id && (
            <button
              className="danger"
              onClick={async () => {
                await banMember(memberContextMenu.member.id, "");
                setMemberContextMenu(null);
              }}
            >
              Ban Member
            </button>
          )}
          {canModerateMembers && (
            <button
              onClick={() => {
                setModerationMemberId(memberContextMenu.member.id || "");
                setSettingsOpen(true);
                setSettingsTab("moderation");
                setMemberContextMenu(null);
              }}
            >
              Open Moderation Panel
            </button>
          )}
        </div>
      )}

      {serverContextMenu && (
        <div
          className="server-context-menu"
          style={{ top: serverContextMenu.y, left: serverContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const contextRoles = Array.isArray(serverContextMenu.server?.roles)
              ? serverContextMenu.server.roles.map((role) =>
                  String(role || "").toLowerCase(),
                )
              : [];
            const canOpenContextServerAdmin =
              canAccessServerAdminPanel &&
              (contextRoles.includes("owner") ||
                contextRoles.includes("platform_admin") ||
                contextRoles.includes("admin") ||
                contextRoles.includes("server_admin"));
            return (
              <>
          <button
            onClick={() => openServerFromContext(serverContextMenu.server.id)}
          >
            Open Server
          </button>
          {canManageServer &&
            serverContextMenu.server.id === activeServerId &&
            !!workingGuildId && (
              <>
                <button
                  onClick={() => {
                    promptCreateChannelFlow({ fixedType: "text" });
                    setServerContextMenu(null);
                  }}
                >
                  Create Text Channel
                </button>
                <button
                  onClick={() => {
                    promptCreateChannelFlow({ fixedType: "voice" });
                    setServerContextMenu(null);
                  }}
                >
                  Create Voice Channel
                </button>
                <button
                  onClick={() => {
                    promptCreateChannelFlow({ fixedType: "category" });
                    setServerContextMenu(null);
                  }}
                >
                  Create Category
                </button>
              </>
            )}
          <button
            onClick={() => moveServerInRail(serverContextMenu.server.id, "up")}
          >
            Move Up
          </button>
          <button
            onClick={() =>
              moveServerInRail(serverContextMenu.server.id, "down")
            }
          >
            Move Down
          </button>
          <button
            onClick={() => {
              setInviteServerId(serverContextMenu.server.id);
              setSettingsOpen(true);
              setSettingsTab("invites");
              setServerContextMenu(null);
            }}
          >
            Create Invite
          </button>
          <button onClick={() => copyServerId(serverContextMenu.server.id)}>
            Copy Server ID
          </button>
          <button
            onClick={() => {
              setSettingsOpen(true);
              setSettingsTab("server");
              setServerContextMenu(null);
            }}
          >
            Server Settings
          </button>
          {canOpenContextServerAdmin && (
            <button
              onClick={() => {
                openServerAdmin(serverContextMenu.server.id);
                setServerContextMenu(null);
              }}
            >
              Open Server Admin
            </button>
          )}
          <button
            className="danger"
            onClick={() => leaveServer(serverContextMenu.server)}
          >
            Leave Server
          </button>
          {(serverContextMenu.server.roles || []).includes("owner") && (
            <button
              className="danger"
              onClick={() => deleteServer(serverContextMenu.server)}
            >
              Delete Server
            </button>
          )}
              </>
            );
          })()}
        </div>
      )}

      {channelContextMenu && (
        <div
          className="server-context-menu"
          style={{ top: channelContextMenu.y, left: channelContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          {canManageServer && (
            <>
              <button
                onClick={() => openChannelSettings(channelContextMenu.channel)}
              >
                Edit Channel
              </button>
              <button
                onClick={() => {
                  openServerAdmin(activeServerId, {
                    tab: "channels",
                    guildId: workingGuildId,
                    channelId: channelContextMenu.channel.id,
                    channelAction: "permissions",
                  });
                  setChannelContextMenu(null);
                }}
              >
                Permissions
              </button>
            </>
          )}
          <button
            onClick={() => {
              setActiveChannelId(channelContextMenu.channel.id);
              setChannelContextMenu(null);
            }}
          >
            Open
          </button>
          {canManageServer && (
            <button
              className="danger"
              onClick={() => deleteChannelById(channelContextMenu.channel)}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {categoryContextMenu && (
        <div
          className="server-context-menu"
          style={{ top: categoryContextMenu.y, left: categoryContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          {canManageServer && (
            <>
              <button
                onClick={() => {
                  promptCreateChannelFlow({
                    fixedType: "text",
                    fixedParentId: categoryContextMenu.category.id,
                  });
                  setCategoryContextMenu(null);
                }}
              >
                Create Text Channel
              </button>
              <button
                onClick={() => {
                  promptCreateChannelFlow({
                    fixedType: "voice",
                    fixedParentId: categoryContextMenu.category.id,
                  });
                  setCategoryContextMenu(null);
                }}
              >
                Create Voice Channel
              </button>
              <button
                onClick={() =>
                  openChannelSettings(categoryContextMenu.category)
                }
              >
                Edit Category
              </button>
              <button
                className="danger"
                onClick={() => deleteChannelById(categoryContextMenu.category)}
              >
                Delete Category
              </button>
            </>
          )}
        </div>
      )}

    </>
  );
}
