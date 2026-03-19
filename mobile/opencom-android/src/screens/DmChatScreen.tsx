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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { File } from "expo-file-system";
import {
  ScreenBackground,
  StatusBanner,
  SurfaceCard,
  TopBar,
} from "../components/chrome";
import { MessageAttachments } from "../components/MessageAttachments";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import {
  formatBytes,
  getAttachmentDisplayName,
  guessMimeTypeFromFileName,
  isFilePickerCancellation,
} from "../attachments";
import type { DmMessageApi, DmThreadApi } from "../types";
import { colors, radii, spacing, typography } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type DmChatScreenProps = {
  thread: DmThreadApi;
  onBack: () => void;
  onViewPins?: () => void;
  onStartCall?: (thread: DmThreadApi) => void;
};

type ReplyTarget = {
  id: string;
  author: string;
  content: string;
};

type ContextMenuState = {
  message: DmMessageApi;
  isOwn: boolean;
} | null;

type PendingAttachment = {
  localId: string;
  remoteId: string;
  name: string;
  size: number | null;
};

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

// ─── Message item ─────────────────────────────────────────────────────────────

function MessageItem({
  message,
  myId,
  onLongPress,
}: {
  message: DmMessageApi;
  myId: string;
  onLongPress: (message: DmMessageApi, isOwn: boolean) => void;
}) {
  const isOwn = message.authorId === myId;
  const hasReply = !!message.replyToId;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.messageWrapper,
        isOwn && styles.messageWrapperOwn,
        pressed && styles.messagePressed,
      ]}
      onLongPress={() => onLongPress(message, isOwn)}
      delayLongPress={350}
    >
      {!isOwn && (
        <Avatar username={message.author} pfpUrl={message.pfp_url} size={32} />
      )}

      <View
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
      >
        {hasReply && (
          <View style={styles.replyQuote}>
            <View style={styles.replyQuoteBar} />
            <Text style={styles.replyQuoteText} numberOfLines={2}>
              <Text style={styles.replyQuoteAuthor}>
                {message.replyToAuthor ?? "Unknown"}
              </Text>
              {"  "}
              {message.replyToContent ?? ""}
            </Text>
          </View>
        )}

        {!isOwn && <Text style={styles.bubbleAuthor}>{message.author}</Text>}

        {message.content ? (
          <Text
            style={[styles.bubbleContent, isOwn && styles.bubbleContentOwn]}
          >
            {message.content}
          </Text>
        ) : null}

        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} scope="core" />
        )}

        <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
          {formatTime(message.createdAt)}
          {message.edited ? "  (edited)" : ""}
        </Text>
      </View>

      {isOwn && (
        <Avatar username={message.author} pfpUrl={message.pfp_url} size={32} />
      )}
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function DmChatScreen({
  thread,
  onBack,
  onViewPins,
  onStartCall,
}: DmChatScreenProps) {
  const {
    api,
    me,
    presenceByUserId,
    upsertDmMessage,
    removeDmMessage,
    dmMessages,
    setDmMessages,
  } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<DmMessageApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [status, setStatus] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);

  const listRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);
  const lastVisibleMessageIdRef = useRef("");

  // ── Derived ────────────────────────────────────────────────────────────────
  const participantPresence = presenceByUserId[thread.participantId];
  const cachedThreadMessages = dmMessages[thread.id];

  // ── Load messages ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    try {
      const data = await api.getDmMessages(thread.id, { limit: PAGE_SIZE });
      const msgs = (data.messages ?? []) as DmMessageApi[];
      setMessages(msgs);
      setHasMore(data.hasMore ?? false);
      lastVisibleMessageIdRef.current = msgs[msgs.length - 1]?.id ?? "";
      // Sync to global cache
      msgs.forEach((m) => upsertDmMessage(thread.id, m));
    } catch {
      setStatus("Failed to load messages.");
    }
  }, [api, thread.id, upsertDmMessage]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const data = await api.getDmMessages(thread.id, {
        limit: PAGE_SIZE,
        before: oldest.createdAt,
      });
      const older = (data.messages ?? []) as DmMessageApi[];
      setMessages((prev) => [...older, ...prev]);
      setDmMessages((prev) => {
        const existing = prev[thread.id] ?? [];
        const seen = new Set(existing.map((message) => message.id));
        const olderNewestFirst = [...older].reverse();
        const merged = [...existing];
        for (const message of olderNewestFirst) {
          if (seen.has(message.id)) continue;
          seen.add(message.id);
          merged.push(message);
        }
        return { ...prev, [thread.id]: merged };
      });
      setHasMore(data.hasMore ?? false);
    } catch {
      setStatus("Failed to load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [api, thread.id, messages, loadingOlder, hasMore, setDmMessages]);

  useEffect(() => {
    const cachedMessages = cachedThreadMessages
      ? [...cachedThreadMessages].reverse()
      : [];
    setLoading(true);
    setMessages(cachedMessages);
    setHasMore(false);
    setReplyTarget(null);
    setPendingAttachments([]);
    lastVisibleMessageIdRef.current =
      cachedMessages[cachedMessages.length - 1]?.id ?? "";
    if (cachedMessages.length > 0) {
      setLoading(false);
    }
    loadMessages().finally(() => setLoading(false));
  }, [thread.id]); // eslint-disable-line

  useEffect(() => {
    if (!cachedThreadMessages) return;
    const orderedMessages = [...cachedThreadMessages].reverse();
    const newestMessageId =
      orderedMessages[orderedMessages.length - 1]?.id ?? "";
    const shouldScroll =
      !!newestMessageId &&
      newestMessageId !== lastVisibleMessageIdRef.current &&
      isAtBottomRef.current;

    setMessages(orderedMessages);
    lastVisibleMessageIdRef.current = newestMessageId;

    if (shouldScroll) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [cachedThreadMessages]);

  // ── Send message ───────────────────────────────────────────────────────────
  const pickAttachment = useCallback(async () => {
    if (uploadingAttachment) return;
    if (pendingAttachments.length >= 10) {
      setStatus("You can attach up to 10 files per message.");
      return;
    }

    setUploadingAttachment(true);
    setStatus("");
    try {
      const picked = await File.pickFileAsync();
      const file = Array.isArray(picked) ? picked[0] : picked;
      const name = getAttachmentDisplayName({
        fileName: file?.name,
        filename: file?.name,
      });
      if (!file?.uri) throw new Error("FILE_PICK_FAILED");

      setStatus(`Uploading ${name}...`);
      const uploaded = await api.uploadDmAttachment(
        thread.id,
        file.uri,
        name,
        guessMimeTypeFromFileName(name, file.type),
      );
      setPendingAttachments((current) => [
        ...current,
        {
          localId: `${Date.now()}-${uploaded.id}`,
          remoteId: uploaded.id,
          name,
          size: file.size ?? null,
        },
      ]);
      setStatus(`${name} is ready to send.`);
    } catch (error) {
      if (!isFilePickerCancellation(error)) {
        setStatus("Failed to attach that file.");
      }
    } finally {
      setUploadingAttachment(false);
    }
  }, [api, pendingAttachments.length, thread.id, uploadingAttachment]);

  const removePendingAttachment = useCallback((localId: string) => {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.localId !== localId),
    );
  }, []);

  const onSend = useCallback(async () => {
    const content = composer.trim();
    const attachmentIds = pendingAttachments.map((attachment) => attachment.remoteId);
    if ((!content && attachmentIds.length === 0) || sending) return;
    setSending(true);
    setStatus("");
    try {
      await api.sendDmMessage(thread.id, content, {
        replyToId: replyTarget?.id ?? null,
        attachmentIds,
      });
      setComposer("");
      setReplyTarget(null);
      setPendingAttachments([]);
      // Refresh to get full message data (real-time may not always fire)
      await loadMessages();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setStatus("Failed to send message.");
    } finally {
      setSending(false);
    }
  }, [api, composer, pendingAttachments, replyTarget, sending, thread.id, loadMessages]);

  // ── Context menu ───────────────────────────────────────────────────────────
  const openContextMenu = useCallback(
    (message: DmMessageApi, isOwn: boolean) => {
      if (Platform.OS === "ios") {
        const options: string[] = ["Reply"];
        if (isOwn) options.push("Delete");
        options.push("Copy");
        options.push("Cancel");

        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            destructiveButtonIndex: isOwn ? 1 : undefined,
            cancelButtonIndex: options.length - 1,
          },
          (idx) => {
            const label = options[idx];
            if (label === "Reply") {
              setReplyTarget({
                id: message.id,
                author: message.author,
                content: message.content,
              });
            } else if (label === "Delete") {
              confirmDelete(message); // eslint-disable-line
            } else if (label === "Copy") {
              Alert.alert("Content", message.content);
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
    (message: DmMessageApi) => {
      Alert.alert("Delete Message", "Delete this message?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteDmMessage(thread.id, message.id);
              setMessages((prev) => prev.filter((m) => m.id !== message.id));
              removeDmMessage(thread.id, message.id);
            } catch {
              Alert.alert("Error", "Failed to delete message.");
            }
          },
        },
      ]);
    },
    [api, thread.id, removeDmMessage],
  );

  const handleContextAction = useCallback(
    (action: string) => {
      const cm = contextMenu;
      if (!cm) return;
      setContextMenu(null);
      if (action === "reply") {
        setReplyTarget({
          id: cm.message.id,
          author: cm.message.author,
          content: cm.message.content,
        });
      } else if (action === "delete") {
        confirmDelete(cm.message);
      } else if (action === "copy") {
        Alert.alert("Content", cm.message.content);
      }
    },
    [contextMenu, confirmDelete],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ScreenBackground>
        <TopBar
          title={thread.name}
          subtitle="Loading conversation"
          onBack={onBack}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
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
          title={thread.name}
          subtitle={
            participantPresence?.customStatus ||
            participantPresence?.status ||
            "Direct message"
          }
          onBack={onBack}
          leading={
            <Avatar
              username={thread.name}
              pfpUrl={thread.pfp_url}
              size={32}
              status={participantPresence?.status}
              showStatus
            />
          }
          right={
            <View style={styles.headerActions}>
              {onStartCall ? (
                <Pressable
                  onPress={() => onStartCall(thread)}
                  style={styles.headerBtn}
                  hitSlop={8}
                >
                  <Text style={styles.headerBtnText}>📞</Text>
                </Pressable>
              ) : null}
              {onViewPins ? (
                <Pressable onPress={onViewPins} style={styles.headerBtn} hitSlop={8}>
                  <Text style={styles.headerBtnText}>📌</Text>
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
          ListHeaderComponent={
            <>
              <SurfaceCard style={styles.chatIntro}>
                <Text style={styles.chatIntroTitle}>{thread.name}</Text>
                <Text style={styles.chatIntroText}>
                  Direct messages share the same layered chat shell as desktop,
                  with pinned messages, replies, and live updates.
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
                No messages yet. Say hello to {thread.name}!
              </Text>
            </View>
          }
        />

        {status ? <StatusBanner text={status} onDismiss={() => setStatus("")} /> : null}

        {replyTarget ? (
          <ReplyBar target={replyTarget} onClear={() => setReplyTarget(null)} />
        ) : null}

        {pendingAttachments.length > 0 ? (
          <View style={styles.pendingAttachmentsRow}>
            {pendingAttachments.map((attachment) => (
              <View key={attachment.localId} style={styles.pendingAttachmentChip}>
                <View style={styles.pendingAttachmentCopy}>
                  <Text style={styles.pendingAttachmentName} numberOfLines={1}>
                    {attachment.name}
                  </Text>
                  <Text style={styles.pendingAttachmentMeta} numberOfLines={1}>
                    {formatBytes(attachment.size) || "Ready to send"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => removePendingAttachment(attachment.localId)}
                  hitSlop={8}
                >
                  <Text style={styles.pendingAttachmentRemove}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.composerRow}>
          <Pressable
            style={[
              styles.attachBtn,
              uploadingAttachment && styles.attachBtnDisabled,
            ]}
            onPress={pickAttachment}
            disabled={uploadingAttachment}
          >
            {uploadingAttachment ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Text style={styles.attachBtnText}>＋</Text>
            )}
          </Pressable>
          <TextInput
            value={composer}
            onChangeText={setComposer}
            style={styles.composerInput}
            placeholder={`Message ${thread.name}`}
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={4000}
            editable={!sending}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!composer.trim() && pendingAttachments.length === 0 || sending) &&
                styles.sendBtnDisabled,
            ]}
            onPress={onSend}
            disabled={(!composer.trim() && pendingAttachments.length === 0) || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </Pressable>
        </View>

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
                  ? [{ label: "🗑️  Delete", action: "delete" }]
                  : []),
                { label: "📋  Copy", action: "copy" },
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
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.sidebar,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: 22, color: colors.text },
  headerInfo: { flex: 1, minWidth: 0 },
  headerTitle: { ...typography.heading, color: colors.text },
  headerStatus: {
    ...typography.caption,
    color: colors.textDim,
    textTransform: "capitalize",
  },
  headerBtn: { padding: spacing.xs, borderRadius: radii.sm },
  headerBtnText: { fontSize: 18 },

  // List
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  loadMoreText: { color: colors.brand, fontWeight: "600", fontSize: 13 },

  // Message wrapper
  messageWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  messageWrapperOwn: {
    flexDirection: "row-reverse",
  },
  messagePressed: { opacity: 0.75 },

  // Bubble
  bubble: {
    maxWidth: "78%",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 3,
  },
  bubbleOther: {
    backgroundColor: colors.elev,
    borderBottomLeftRadius: radii.sm,
  },
  bubbleOwn: {
    backgroundColor: colors.brand,
    borderBottomRightRadius: radii.sm,
  },
  bubbleAuthor: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "700",
    marginBottom: 1,
  },
  bubbleContent: { ...typography.body, color: colors.text },
  bubbleContentOwn: { color: "#fff" },
  bubbleTime: {
    ...typography.label,
    color: colors.textDim,
    textAlign: "right",
    marginTop: 2,
  },
  bubbleTimeOwn: { color: "rgba(255,255,255,0.65)" },

  // Reply quote inside bubble
  replyQuote: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: 4,
    opacity: 0.75,
  },
  replyQuoteBar: {
    width: 2,
    alignSelf: "stretch",
    backgroundColor: colors.textSoft,
    borderRadius: 1,
    flexShrink: 0,
  },
  replyQuoteText: { ...typography.caption, color: colors.textSoft, flex: 1 },
  replyQuoteAuthor: { fontWeight: "700" },

  // Attachments
  attachments: { marginTop: spacing.xs, gap: spacing.xs },
  attachmentChip: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
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
  attachBtn: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtnDisabled: { opacity: 0.6 },
  attachBtnText: {
    fontSize: 24,
    color: colors.brand,
    lineHeight: 24,
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
  pendingAttachmentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pendingAttachmentChip: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingAttachmentCopy: {
    maxWidth: 190,
  },
  pendingAttachmentName: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "700",
  },
  pendingAttachmentMeta: {
    ...typography.label,
    color: colors.textDim,
  },
  pendingAttachmentRemove: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: "700",
  },

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
