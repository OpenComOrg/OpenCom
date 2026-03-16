import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ScreenBackground,
  StatusBanner,
  SurfaceCard,
  TopBar,
} from "../components/chrome";
import { useAuth } from "../context/AuthContext";
import { useNodeGateway, httpToNodeGatewayWs } from "../hooks/useGateway";
import { Avatar } from "../components/Avatar";
import type {
  Channel,
  ChannelMessage,
  CoreServer,
  Guild,
  VoiceState,
} from "../types";
import { colors, radii, spacing, typography } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelScreenProps = {
  server: CoreServer;
  guild: Guild;
  channel: Channel;
  onBack: () => void;
  onViewPins?: () => void;
  onViewMembers?: () => void;
  onJoinVoice?: (server: CoreServer, guild: Guild, channel: Channel) => void;
};

type ReplyTarget = {
  id: string;
  author: string;
  content: string;
};

type ContextMenuState = {
  message: ChannelMessage;
  isOwn: boolean;
} | null;

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isVoiceChannel(ch: Channel): boolean {
  return ch.type === "voice";
}

// ─── Reply bar ────────────────────────────────────────────────────────────────

function ReplyBar({
  target,
  onClear,
}: {
  target: ReplyTarget;
  onClear: () => void;
}) {
  return (
    <View style={replyStyles.bar}>
      <View style={replyStyles.indicator} />
      <View style={replyStyles.info}>
        <Text style={replyStyles.label} numberOfLines={1}>
          Replying to <Text style={replyStyles.author}>{target.author}</Text>
        </Text>
        <Text style={replyStyles.preview} numberOfLines={1}>
          {target.content}
        </Text>
      </View>
      <Pressable onPress={onClear} style={replyStyles.closeBtn} hitSlop={8}>
        <Text style={replyStyles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const replyStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.elev,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  indicator: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: colors.brand,
    borderRadius: 2,
    flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  label: { ...typography.caption, color: colors.textDim },
  author: { color: colors.brand, fontWeight: "600" },
  preview: { ...typography.caption, color: colors.textDim },
  closeBtn: { padding: spacing.xs },
  closeText: { color: colors.textDim, fontSize: 14 },
});

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  visible,
  initialContent,
  onSave,
  onCancel,
}: {
  visible: boolean;
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialContent);

  useEffect(() => {
    if (visible) setText(initialContent);
  }, [visible, initialContent]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={editStyles.overlay} onPress={onCancel}>
        <Pressable style={editStyles.card} onPress={() => {}}>
          <Text style={editStyles.title}>Edit Message</Text>
          <TextInput
            style={editStyles.input}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            maxLength={4000}
            placeholderTextColor={colors.textDim}
          />
          <View style={editStyles.actions}>
            <Pressable style={editStyles.cancelBtn} onPress={onCancel}>
              <Text style={editStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[editStyles.saveBtn, !text.trim() && editStyles.disabled]}
              onPress={() => text.trim() && onSave(text.trim())}
            >
              <Text style={editStyles.saveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.sidebar,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.text },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: "top",
    fontSize: 15,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.textSoft, fontWeight: "600" },
  saveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  disabled: { opacity: 0.5 },
  saveText: { color: "#fff", fontWeight: "700" },
});

// ─── Voice members panel ──────────────────────────────────────────────────────

function VoiceMembersPanel({ voiceStates }: { voiceStates: VoiceState[] }) {
  const spotlightMembers = voiceStates.slice(0, 3);

  if (voiceStates.length === 0) {
    return (
      <View style={voiceStyles.empty}>
        <Text style={voiceStyles.emptyText}>No one in this voice channel</Text>
      </View>
    );
  }
  return (
    <ScrollView
      style={voiceStyles.container}
      contentContainerStyle={voiceStyles.content}
    >
      <View style={voiceStyles.hero}>
        <View style={voiceStyles.heroCopy}>
          <Text style={voiceStyles.heroEyebrow}>LIVE VOICE</Text>
          <Text style={voiceStyles.heroTitle}>
            {voiceStates.length} {voiceStates.length === 1 ? "person is" : "people are"} in the room
          </Text>
          <Text style={voiceStyles.heroText}>
            Track who is active here and jump into the live mobile room when
            you want the full roster and publisher view.
          </Text>
        </View>

        <View style={voiceStyles.spotlightRow}>
          {spotlightMembers.map((vs) => (
            <View key={`spotlight-${vs.userId}`} style={voiceStyles.spotlightCard}>
              <Avatar
                username={vs.username}
                pfpUrl={vs.pfp_url}
                size={40}
                status="online"
                showStatus={false}
              />
                <Text style={voiceStyles.spotlightName} numberOfLines={1}>
                  {vs.username ?? vs.userId}
                </Text>
              <Text style={voiceStyles.spotlightState}>
                {vs.speaking
                  ? "Speaking"
                  : vs.deafened
                    ? "Deafened"
                    : vs.muted
                      ? "Muted"
                      : "Listening"}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={voiceStyles.summaryRow}>
        <View style={voiceStyles.summaryPill}>
          <Text style={voiceStyles.summaryLabel}>Members</Text>
          <Text style={voiceStyles.summaryValue}>{voiceStates.length}</Text>
        </View>
        <View style={voiceStyles.summaryPill}>
          <Text style={voiceStyles.summaryLabel}>Speaking</Text>
          <Text style={voiceStyles.summaryValue}>
            {voiceStates.filter((entry) => entry.speaking).length}
          </Text>
        </View>
        <View style={voiceStyles.summaryPill}>
          <Text style={voiceStyles.summaryLabel}>Shares</Text>
          <Text style={voiceStyles.summaryValue}>Live now</Text>
        </View>
      </View>

      <Text style={voiceStyles.heading}>
        Room roster
      </Text>
      {voiceStates.map((vs) => (
        <View key={vs.userId} style={voiceStyles.row}>
          <Avatar
            username={vs.username}
            pfpUrl={vs.pfp_url}
            size={32}
            status="online"
            showStatus={false}
          />
          <Text style={voiceStyles.name} numberOfLines={1}>
            {vs.username ?? vs.userId}
          </Text>
          <View style={voiceStyles.icons}>
            {vs.muted ? (
              <Text style={voiceStyles.icon}>🔇</Text>
            ) : (
              <Text style={voiceStyles.iconOn}>🎙️</Text>
            )}
            {vs.deafened ? <Text style={voiceStyles.icon}>🎧</Text> : null}
            {vs.speaking ? <View style={voiceStyles.speakingDot} /> : null}
          </View>
        </View>
      ))}
      <View style={voiceStyles.note}>
        <Text style={voiceStyles.noteText}>
          Mobile can now join the live room and follow active publishers.
        </Text>
      </View>
    </ScrollView>
  );
}

const voiceStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  hero: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.sidebar,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroCopy: { gap: spacing.xs },
  heroEyebrow: {
    ...typography.caption,
    color: colors.brand,
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  heroTitle: {
    ...typography.title,
    color: colors.text,
  },
  heroText: {
    ...typography.body,
    color: colors.textDim,
  },
  spotlightRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  spotlightCard: {
    minWidth: 92,
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.xs,
  },
  spotlightName: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  spotlightState: {
    ...typography.caption,
    color: colors.textDim,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  summaryPill: {
    flexGrow: 1,
    minWidth: 92,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textDim,
  },
  summaryValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: "700",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textDim,
    textAlign: "center",
    ...typography.body,
  },
  heading: {
    ...typography.heading,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.elev,
    borderRadius: radii.md,
  },
  name: { flex: 1, ...typography.body, color: colors.text },
  icons: { flexDirection: "row", gap: 4, alignItems: "center" },
  icon: { fontSize: 14, opacity: 0.6 },
  iconOn: { fontSize: 14 },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  note: {
    marginTop: spacing.lg,
    backgroundColor: colors.elev,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noteText: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "center",
  },
});

// ─── Message item ─────────────────────────────────────────────────────────────

function MessageItem({
  message,
  myId,
  onLongPress,
}: {
  message: ChannelMessage;
  myId: string;
  onLongPress: (message: ChannelMessage, isOwn: boolean) => void;
}) {
  const isOwn = message.author_id === myId;
  const hasReply = !!message.reply_to_id;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.message,
        pressed && styles.messagePressed,
      ]}
      onLongPress={() => onLongPress(message, isOwn)}
      delayLongPress={350}
    >
      {hasReply && (
        <View style={styles.replyQuote}>
          <View style={styles.replyQuoteBar} />
          <Text style={styles.replyQuoteText} numberOfLines={1}>
            <Text style={styles.replyQuoteAuthor}>
              {message.reply_to_author ?? "Unknown"}
            </Text>
            {"  "}
            {message.reply_to_content ?? ""}
          </Text>
        </View>
      )}
      <View style={styles.messageRow}>
        <Avatar
          username={message.username}
          pfpUrl={message.pfp_url}
          size={36}
        />
        <View style={styles.messageBody}>
          <View style={styles.messageHeader}>
            <Text
              style={[styles.messageAuthor, isOwn && styles.messageAuthorOwn]}
            >
              {message.username ?? message.author_id}
            </Text>
            <Text style={styles.messageTime}>
              {formatTime(message.created_at)}
              {message.edited ? "  (edited)" : ""}
            </Text>
          </View>
          <Text style={styles.messageContent}>{message.content}</Text>
          {message.attachments && message.attachments.length > 0 && (
            <View style={styles.attachments}>
              {message.attachments.map((a) => (
            <View key={a.id} style={styles.attachmentChip}>
              <Text style={styles.attachmentName} numberOfLines={1}>
                    📎 {a.fileName ?? a.filename ?? "attachment"}
              </Text>
            </View>
          ))}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function ChannelScreen({
  server,
  guild,
  channel,
  onBack,
  onViewPins,
  onViewMembers,
  onJoinVoice,
}: ChannelScreenProps) {
  const { api, me, presenceByUserId } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [editModal, setEditModal] = useState<{
    messageId: string;
    content: string;
  } | null>(null);
  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);

  const listRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isVoice = isVoiceChannel(channel);
  const nodeGatewayWs = httpToNodeGatewayWs(server.baseUrl);

  // ── Load messages ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    try {
      const data = await api.listMessages(server, channel.id, {
        limit: PAGE_SIZE,
      });
      const msgs = (data.messages ?? []).slice().reverse();
      setMessages(msgs);
      setHasMore(data.hasMore ?? false);
    } catch {
      setStatus("Failed to load messages.");
    }
  }, [api, server, channel.id]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const data = await api.listMessages(server, channel.id, {
        limit: PAGE_SIZE,
        before: oldest.created_at,
      });
      const older = (data.messages ?? []).slice().reverse();
      setMessages((prev) => [...older, ...prev]);
      setHasMore(data.hasMore ?? false);
    } catch {
      setStatus("Failed to load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [api, server, channel.id, messages, loadingOlder, hasMore]);

  // ── Load voice states ──────────────────────────────────────────────────────
  const loadVoiceStates = useCallback(async () => {
    if (!isVoice) return;
    try {
      const data = await api.getVoiceStates(server, guild.id);
      const forChannel = (data.voiceStates ?? []).filter(
        (vs) => vs.channelId === channel.id,
      );
      setVoiceStates(forChannel);
    } catch {
      // non-fatal
    }
  }, [api, server, guild.id, channel.id, isVoice]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setHasMore(false);
    setReplyTarget(null);

    const run = async () => {
      if (isVoice) {
        await loadVoiceStates();
      } else {
        await loadMessages();
      }
      setLoading(false);
    };
    run();
  }, [channel.id]); // eslint-disable-line

  // ── Node gateway for real-time channel updates ─────────────────────────────
  useNodeGateway({
    wsUrl: nodeGatewayWs,
    membershipToken: server.membershipToken,
    guildId: guild.id,
    channelId: channel.id,
    enabled: true,
    onEvent: useCallback(
      (event) => {
        if (event.type === "MESSAGE_CREATE" && event.channelId === channel.id) {
          setMessages((prev) => [...prev, event.message]);
          if (isAtBottomRef.current) {
            setTimeout(
              () => listRef.current?.scrollToEnd({ animated: true }),
              50,
            );
          }
        } else if (
          event.type === "MESSAGE_UPDATE" &&
          event.channelId === channel.id
        ) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.messageId
                ? { ...m, content: event.content, edited: true }
                : m,
            ),
          );
        } else if (
          event.type === "MESSAGE_DELETE" &&
          event.channelId === channel.id
        ) {
          setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
        } else if (event.type === "VOICE_STATE_UPDATE") {
          setVoiceStates((prev) => {
            if (event.channelId === channel.id) {
              // upsert
              const idx = prev.findIndex((v) => v.userId === event.userId);
              const existing = idx >= 0 ? prev[idx] : null;
              const next = {
                userId: event.userId,
                username: event.username || existing?.username,
                pfp_url: event.pfp_url ?? existing?.pfp_url ?? null,
                channelId: event.channelId ?? channel.id,
                guildId: event.guildId,
                muted: event.muted,
                deafened: event.deafened,
                speaking: existing?.speaking ?? false,
              };
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = next;
                return updated;
              }
              return [...prev, next];
            } else {
              // left this channel
              return prev.filter((v) => v.userId !== event.userId);
            }
          });
        } else if (
          event.type === "VOICE_JOIN" &&
          event.channelId === channel.id
        ) {
          setVoiceStates((prev) => {
            if (prev.some((v) => v.userId === event.userId)) return prev;
            return [
              ...prev,
              {
                userId: event.userId,
                username: event.username,
                channelId: event.channelId,
                guildId: event.guildId,
                muted: false,
                deafened: false,
              },
            ];
          });
        } else if (
          event.type === "VOICE_LEAVE" &&
          event.channelId === channel.id
        ) {
          setVoiceStates((prev) =>
            prev.filter((v) => v.userId !== event.userId),
          );
        } else if (event.type === "VOICE_SPEAKING") {
          setVoiceStates((prev) =>
            prev.map((v) =>
              v.userId === event.userId
                ? { ...v, speaking: event.speaking }
                : v,
            ),
          );
        }
      },
      [channel.id],
    ),
  });

  // ── Send message ───────────────────────────────────────────────────────────
  const onSend = useCallback(async () => {
    const content = composer.trim();
    if (!content || sending) return;
    setSending(true);
    setStatus("");
    try {
      await api.sendMessage(server, channel.id, content, {
        replyToId: replyTarget?.id ?? null,
      });
      setComposer("");
      setReplyTarget(null);
      // Real-time will add the message, but also refresh as fallback
      await loadMessages();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setStatus("Failed to send message.");
    } finally {
      setSending(false);
    }
  }, [api, composer, server, channel.id, replyTarget, sending, loadMessages]);

  // ── Context menu (long press) ──────────────────────────────────────────────
  const openContextMenu = useCallback(
    (message: ChannelMessage, isOwn: boolean) => {
      if (Platform.OS === "ios") {
        const options: string[] = ["Reply"];
        if (isOwn) {
          options.push("Edit");
          options.push("Delete");
        }
        options.push("Copy");
        options.push("Pin");
        options.push("Cancel");

        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            destructiveButtonIndex: isOwn ? 2 : undefined,
            cancelButtonIndex: options.length - 1,
          },
          (idx) => {
            const label = options[idx];
            if (label === "Reply") {
              setReplyTarget({
                id: message.id,
                author: message.username ?? message.author_id,
                content: message.content,
              });
            } else if (label === "Edit") {
              setEditModal({ messageId: message.id, content: message.content });
            } else if (label === "Delete") {
              confirmDelete(message);
            } else if (label === "Copy") {
              // Copy not available without expo-clipboard in this build
              Alert.alert("Copy", message.content);
            } else if (label === "Pin") {
              pinMessage(message);
            }
          },
        );
      } else {
        setContextMenu({ message, isOwn });
      }
    },
    [], // eslint-disable-line
  );

  const confirmDelete = useCallback(
    (message: ChannelMessage) => {
      Alert.alert("Delete Message", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteServerMessage(server, channel.id, message.id);
              setMessages((prev) => prev.filter((m) => m.id !== message.id));
            } catch {
              Alert.alert("Error", "Failed to delete message.");
            }
          },
        },
      ]);
    },
    [api, server, channel.id],
  );

  const pinMessage = useCallback(
    async (message: ChannelMessage) => {
      try {
        await api.pinServerMessage(server, channel.id, message.id);
        Alert.alert("Pinned", "Message pinned successfully.");
      } catch {
        Alert.alert("Error", "Failed to pin message.");
      }
    },
    [api, server, channel.id],
  );

  const saveEdit = useCallback(
    async (content: string) => {
      if (!editModal) return;
      try {
        await api.editMessage(server, channel.id, editModal.messageId, content);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editModal.messageId ? { ...m, content, edited: true } : m,
          ),
        );
        setEditModal(null);
      } catch {
        Alert.alert("Error", "Failed to edit message.");
      }
    },
    [api, server, channel.id, editModal],
  );

  // ── Android context menu actions ───────────────────────────────────────────
  const handleContextAction = useCallback(
    (action: string) => {
      const cm = contextMenu;
      if (!cm) return;
      setContextMenu(null);

      if (action === "reply") {
        setReplyTarget({
          id: cm.message.id,
          author: cm.message.username ?? cm.message.author_id,
          content: cm.message.content,
        });
      } else if (action === "edit") {
        setEditModal({
          messageId: cm.message.id,
          content: cm.message.content,
        });
      } else if (action === "delete") {
        confirmDelete(cm.message);
      } else if (action === "copy") {
        Alert.alert("Content", cm.message.content);
      } else if (action === "pin") {
        pinMessage(cm.message);
      }
    },
    [contextMenu, confirmDelete, pinMessage],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ScreenBackground>
        <TopBar
          title={channel.name}
          subtitle={isVoice ? "Voice channel" : `#${channel.name}`}
          onBack={onBack}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </ScreenBackground>
    );
  }

  // Voice channel view
  if (isVoice) {
    return (
      <ScreenBackground>
        <TopBar
          title={channel.name}
          subtitle={`Voice room in ${guild.name}`}
          onBack={onBack}
          right={
            <Pressable
              onPress={loadVoiceStates}
              style={styles.headerBtn}
              hitSlop={8}
            >
              <Text style={styles.headerBtnText}>↻</Text>
            </Pressable>
          }
        />
        <View style={styles.voiceWrap}>
          <SurfaceCard style={styles.voiceIntro}>
            <Text style={styles.voiceIntroTitle}>Voice stage</Text>
            <Text style={styles.voiceIntroText}>
              Jump into the mobile voice room to join the live roster, follow
              who is speaking, and track active screen-share or camera
              publishers.
            </Text>
            {onJoinVoice ? (
              <Pressable
                style={styles.voiceJoinBtn}
                onPress={() => onJoinVoice(server, guild, channel)}
              >
                <Text style={styles.voiceJoinBtnText}>Open live room</Text>
              </Pressable>
            ) : null}
          </SurfaceCard>
          <VoiceMembersPanel voiceStates={voiceStates} />
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <TopBar
          title={channel.name}
          subtitle={`#${channel.name} in ${guild.name}`}
          onBack={onBack}
          right={
            <View style={styles.headerActions}>
              {onViewPins ? (
                <Pressable
                  onPress={onViewPins}
                  style={styles.headerBtn}
                  hitSlop={8}
                >
                  <Text style={styles.headerBtnText}>📌</Text>
                </Pressable>
              ) : null}
              {onViewMembers ? (
                <Pressable
                  onPress={onViewMembers}
                  style={styles.headerBtn}
                  hitSlop={8}
                >
                  <Text style={styles.headerBtnText}>👥</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.listContent}
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } =
              event.nativeEvent;
            isAtBottomRef.current =
              layoutMeasurement.height + contentOffset.y >=
              contentSize.height - 40;
          }}
          scrollEventThrottle={100}
          onEndReachedThreshold={0.15}
          ListHeaderComponent={
            <>
              <SurfaceCard style={styles.chatIntro}>
                <Text style={styles.chatIntroTitle}>#{channel.name}</Text>
                <Text style={styles.chatIntroText}>
                  This room follows the same channel-first layout as desktop:
                  scroll the history, pin important messages, then reply from the
                  composer below.
                </Text>
              </SurfaceCard>
              {loadingOlder ? (
                <ActivityIndicator
                  style={{ marginVertical: spacing.md }}
                  color={colors.brand}
                />
              ) : hasMore ? (
                <Pressable style={styles.loadMoreBtn} onPress={loadOlderMessages}>
                  <Text style={styles.loadMoreText}>Load older messages</Text>
                </Pressable>
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <MessageItem
              message={item}
              myId={me?.id ?? ""}
              onLongPress={openContextMenu}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No messages yet. Say hello in #{channel.name}!
              </Text>
            </View>
          }
        />

        {status ? <StatusBanner text={status} onDismiss={() => setStatus("")} /> : null}

        {replyTarget ? (
          <ReplyBar target={replyTarget} onClear={() => setReplyTarget(null)} />
        ) : null}

        <View style={styles.composerRow}>
          <TextInput
            value={composer}
            onChangeText={setComposer}
            style={styles.composerInput}
            placeholder={`Message #${channel.name}`}
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={4000}
            editable={!sending}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!composer.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={onSend}
            disabled={!composer.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </Pressable>
        </View>

        <EditModal
          visible={!!editModal}
          initialContent={editModal?.content ?? ""}
          onSave={saveEdit}
          onCancel={() => setEditModal(null)}
        />

        <Modal
          visible={!!contextMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setContextMenu(null)}
        >
          <Pressable
            style={styles.contextOverlay}
            onPress={() => setContextMenu(null)}
          >
            <View style={styles.contextCard}>
              <Text style={styles.contextTitle} numberOfLines={2}>
                {contextMenu?.message.content}
              </Text>
              {[
                { label: "↩️  Reply", action: "reply" },
                ...(contextMenu?.isOwn
                  ? [
                      { label: "✏️  Edit", action: "edit" },
                      { label: "🗑️  Delete", action: "delete" },
                    ]
                  : []),
                { label: "📋  Copy", action: "copy" },
                { label: "📌  Pin", action: "pin" },
              ].map(({ label, action }) => (
                <Pressable
                  key={action}
                  style={({ pressed }) => [
                    styles.contextItem,
                    pressed && styles.contextItemPressed,
                    action === "delete" && styles.contextItemDanger,
                  ]}
                  onPress={() => handleContextAction(action)}
                >
                  <Text
                    style={[
                      styles.contextItemText,
                      action === "delete" && styles.contextItemTextDanger,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  voiceWrap: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  voiceIntro: {
    gap: spacing.xs,
  },
  voiceIntroTitle: {
    ...typography.title,
    color: colors.text,
  },
  voiceIntroText: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
  },
  voiceJoinBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
  },
  voiceJoinBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  chatIntro: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  chatIntroTitle: {
    ...typography.title,
    color: colors.text,
  },
  chatIntroText: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.sidebar,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: 22, color: colors.text },
  channelIcon: { fontSize: 16, color: colors.textDim },
  headerTitle: { ...typography.heading, color: colors.text, flex: 1 },
  headerActions: { flexDirection: "row", gap: spacing.xs },
  headerBtn: {
    padding: spacing.xs,
    borderRadius: radii.sm,
  },
  headerBtnText: { fontSize: 18 },

  // List
  listContent: { padding: spacing.md, paddingBottom: spacing.lg },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  loadMoreText: { color: colors.brand, fontWeight: "600", fontSize: 13 },

  // Message
  message: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  messagePressed: { backgroundColor: colors.hover },
  messageRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  messageBody: { flex: 1, minWidth: 0 },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: 2,
  },
  messageAuthor: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "700",
  },
  messageAuthorOwn: { color: colors.brandStrong },
  messageTime: { ...typography.label, color: colors.textDim },
  messageContent: { ...typography.body, color: colors.text },

  // Reply quote
  replyQuote: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    marginLeft: 44,
    gap: spacing.xs,
  },
  replyQuoteBar: {
    width: 2,
    alignSelf: "stretch",
    backgroundColor: colors.textDim,
    borderRadius: 1,
    flexShrink: 0,
  },
  replyQuoteText: { ...typography.caption, color: colors.textDim, flex: 1 },
  replyQuoteAuthor: { fontWeight: "700" },

  // Attachments
  attachments: { marginTop: spacing.xs, gap: spacing.xs },
  attachmentChip: {
    backgroundColor: colors.elev,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  attachmentName: { ...typography.caption, color: colors.textSoft },

  // Empty
  empty: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.textDim, textAlign: "center" },

  // Composer
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    maxHeight: 120,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 60,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#fff", fontWeight: "700" },

  // Context menu
  contextOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  contextCard: {
    backgroundColor: colors.sidebar,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  contextTitle: {
    ...typography.caption,
    color: colors.textDim,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  contextItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  contextItemPressed: { backgroundColor: colors.hover },
  contextItemDanger: {},
  contextItemText: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  contextItemTextDanger: { color: colors.danger },
});
