import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  EmptyState,
  ScreenBackground,
  StatusBanner,
  SurfaceCard,
  TopBar,
} from "../components/chrome";
import { MessageAttachments } from "../components/MessageAttachments";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import type { CoreServer, Channel, DmThreadApi, PinnedMessage } from "../types";
import { colors, radii, spacing, typography } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type PinnedMessagesScreenProps = {
  onBack: () => void;
} & (
  | {
      mode: "channel";
      server: CoreServer;
      channel: Channel;
      thread?: undefined;
    }
  | {
      mode: "dm";
      thread: DmThreadApi;
      server?: undefined;
      channel?: undefined;
    }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ─── Pin card ─────────────────────────────────────────────────────────────────

function PinCard({
  pin,
  onUnpin,
  canUnpin,
  mode,
  server,
}: {
  pin: PinnedMessage;
  onUnpin: (pin: PinnedMessage) => void;
  canUnpin: boolean;
  mode: "channel" | "dm";
  server?: CoreServer;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Avatar username={pin.author} pfpUrl={pin.pfp_url} size={32} />
        <View style={styles.cardMeta}>
          <Text style={styles.cardAuthor} numberOfLines={1}>
            {pin.author}
          </Text>
          {pin.createdAt ? (
            <Text style={styles.cardDate}>{formatDate(pin.createdAt)}</Text>
          ) : null}
        </View>
        {canUnpin && (
          <Pressable
            style={({ pressed }) => [
              styles.unpinBtn,
              pressed && styles.unpinBtnPressed,
            ]}
            onPress={() => onUnpin(pin)}
            hitSlop={8}
          >
            <Text style={styles.unpinBtnText}>Unpin</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.cardDivider} />

      {pin.content ? <Text style={styles.cardContent}>{pin.content}</Text> : null}

      {pin.attachments && pin.attachments.length > 0
        ? mode === "channel" && server
          ? (
              <MessageAttachments
                attachments={pin.attachments}
                scope="server"
                server={server}
              />
            )
          : (
              <MessageAttachments attachments={pin.attachments} scope="core" />
            )
        : null}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function PinnedMessagesScreen(props: PinnedMessagesScreenProps) {
  const { onBack, mode } = props;
  const { api } = useAuth();

  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  // ── Load pins ──────────────────────────────────────────────────────────────

  const loadPins = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      if (mode === "channel" && props.server && props.channel) {
        const data = await api.getServerPins(props.server, props.channel.id);
        setPins(data.pins ?? []);
      } else if (mode === "dm" && props.thread) {
        const data = await api.getDmPins(props.thread.id);
        setPins(data.pins ?? []);
      }
    } catch {
      setStatus("Failed to load pinned messages.");
    } finally {
      setLoading(false);
    }
  }, [api, mode, props.server, props.channel, props.thread]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  // ── Unpin ──────────────────────────────────────────────────────────────────

  const handleUnpin = useCallback(
    (pin: PinnedMessage) => {
      Alert.alert("Unpin Message", "Remove this message from pins?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpin",
          style: "destructive",
          onPress: async () => {
            try {
              if (mode === "channel" && props.server && props.channel) {
                await api.unpinServerMessage(
                  props.server,
                  props.channel.id,
                  pin.id,
                );
              } else if (mode === "dm" && props.thread) {
                await api.unpinDmMessage(props.thread.id, pin.id);
              }
              setPins((prev) => prev.filter((p) => p.id !== pin.id));
              setStatus("Message unpinned.");
            } catch {
              Alert.alert("Error", "Failed to unpin message.");
            }
          },
        },
      ]);
    },
    [api, mode, props.server, props.channel, props.thread],
  );

  // ── Derived ────────────────────────────────────────────────────────────────

  const title =
    mode === "channel"
      ? `Pins — #${props.channel?.name ?? ""}`
      : `Pins — ${props.thread?.name ?? "DM"}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScreenBackground>
      <TopBar title="Pinned Messages" subtitle={title} onBack={onBack} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : pins.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            eyebrow="PINS"
            icon="📌"
            title="No pinned messages"
            hint="Long-press a message and tap Pin to save it here."
          />
        </View>
      ) : (
        <FlatList
          data={pins}
          keyExtractor={(pin) => pin.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <SurfaceCard style={styles.summaryCard}>
              <Text style={styles.summaryText}>
                Saved messages stay here so you can revisit important notes,
                links, and decisions without digging through the whole chat.
              </Text>
            </SurfaceCard>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <PinCard
              pin={item}
              canUnpin
              onUnpin={handleUnpin}
              mode={mode}
              server={mode === "channel" ? props.server : undefined}
            />
          )}
        />
      )}

      {status ? <StatusBanner text={status} onDismiss={() => setStatus("")} /> : null}
    </ScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // States
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    justifyContent: "center",
  },
  summaryCard: {
    marginBottom: spacing.md,
  },
  summaryText: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
  },
  emptyIcon: { fontSize: 48 },
  emptyText: {
    ...typography.heading,
    color: colors.text,
    textAlign: "center",
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "center",
  },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },

  // Card
  card: {
    backgroundColor: colors.sidebar,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardAuthor: {
    ...typography.body,
    color: colors.text,
    fontWeight: "700",
  },
  cardDate: {
    ...typography.caption,
    color: colors.textDim,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  cardContent: {
    ...typography.body,
    color: colors.text,
    padding: spacing.md,
    lineHeight: 22,
  },

  // Attachments
  attachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  attachmentChip: {
    backgroundColor: colors.elev,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  attachmentName: {
    ...typography.caption,
    color: colors.textSoft,
  },

  // Unpin button
  unpinBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    flexShrink: 0,
  },
  unpinBtnPressed: {
    backgroundColor: "rgba(239,95,118,0.15)",
  },
  unpinBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
});
