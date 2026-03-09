import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import type { CoreServer, Invite } from "../types";
import { colors, radii, spacing, typography } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type CreateInviteScreenProps = {
  server: CoreServer;
  onBack: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(iso: string | null | undefined): string {
  if (!iso) return "Never";
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
    return "Unknown";
  }
}

function buildJoinUrl(code: string): string {
  return `https://opencom.online/join/${code}`;
}

// ─── Invite card ──────────────────────────────────────────────────────────────

function InviteCard({
  invite,
  onShare,
  onDelete,
}: {
  invite: Invite;
  onShare: (invite: Invite) => void;
  onDelete: (invite: Invite) => void;
}) {
  const joinUrl = invite.joinUrl ?? buildJoinUrl(invite.code);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardCode} numberOfLines={1}>
            {invite.code}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {invite.permanent ? "Permanent" : `Expires: ${formatExpiry(invite.expiresAt)}`}
            {invite.uses != null ? `  •  ${invite.uses} uses` : ""}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <Pressable
            style={({ pressed }) => [
              styles.cardBtn,
              styles.cardBtnShare,
              pressed && styles.cardBtnPressed,
            ]}
            onPress={() => onShare(invite)}
          >
            <Text style={styles.cardBtnShareText}>Share</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.cardBtn,
              styles.cardBtnDelete,
              pressed && styles.cardBtnPressed,
            ]}
            onPress={() => onDelete(invite)}
          >
            <Text style={styles.cardBtnDeleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.cardUrl} numberOfLines={1} selectable>
        {joinUrl}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function CreateInviteScreen({ server, onBack }: CreateInviteScreenProps) {
  const { api } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");

  // Form state
  const [customCode, setCustomCode] = useState("");
  const [isPermanent, setIsPermanent] = useState(true);

  // ── Load existing invites ──────────────────────────────────────────────────

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const data = await api.getServerInvites(server.id);
      setInvites(data.invites ?? []);
    } catch {
      setStatus("Failed to load invites.");
    } finally {
      setLoading(false);
    }
  }, [api, server.id]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  // ── Create invite ──────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setStatus("");
    try {
      const invite = await api.createInvite(server.id, {
        code: customCode.trim() || undefined,
        permanent: isPermanent,
      });
      setInvites((prev) => [invite, ...prev]);
      setCustomCode("");
      setStatus("Invite created!");

      // Auto-share immediately
      const joinUrl = invite.joinUrl ?? buildJoinUrl(invite.code);
      await Share.share({
        message: `Join ${server.name} on OpenCom: ${joinUrl}`,
        url: joinUrl,
        title: `Invite to ${server.name}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create invite.";
      setStatus(msg);
    } finally {
      setCreating(false);
    }
  }, [api, server.id, server.name, customCode, isPermanent, creating]);

  // ── Share invite ───────────────────────────────────────────────────────────

  const handleShare = useCallback(
    async (invite: Invite) => {
      const joinUrl = invite.joinUrl ?? buildJoinUrl(invite.code);
      try {
        await Share.share({
          message: `Join ${server.name} on OpenCom: ${joinUrl}`,
          url: joinUrl,
          title: `Invite to ${server.name}`,
        });
      } catch {
        // Share cancelled or error
      }
    },
    [server.name],
  );

  // ── Delete invite ──────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    (invite: Invite) => {
      Alert.alert(
        "Delete Invite",
        `Delete invite code "${invite.code}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await api.deleteInvite(invite.code);
                setInvites((prev) => prev.filter((i) => i.code !== invite.code));
                setStatus("Invite deleted.");
              } catch {
                Alert.alert("Error", "Failed to delete invite.");
              }
            },
          },
        ],
      );
    },
    [api],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Invites — {server.name}
        </Text>
      </View>

      <FlatList
        data={invites}
        keyExtractor={(i) => i.code}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Create invite form */}
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Create Invite</Text>

              <Text style={styles.label}>Custom code (optional)</Text>
              <TextInput
                value={customCode}
                onChangeText={setCustomCode}
                style={styles.input}
                placeholder="Leave blank for random code"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={32}
                editable={!creating}
              />

              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <Text style={styles.switchLabel}>Permanent invite</Text>
                  <Text style={styles.switchHint}>
                    Permanent invites never expire
                  </Text>
                </View>
                <Switch
                  value={isPermanent}
                  onValueChange={setIsPermanent}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  thumbColor="#fff"
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.createBtn,
                  creating && styles.createBtnDisabled,
                  pressed && !creating && styles.createBtnPressed,
                ]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>🔗  Create Invite</Text>
                )}
              </Pressable>

              {!!status && <Text style={styles.statusText}>{status}</Text>}
            </View>

            {/* Section title */}
            {invites.length > 0 || loading ? (
              <Text style={styles.sectionTitle}>Active Invites</Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.brand} />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🔗</Text>
              <Text style={styles.emptyText}>No active invites</Text>
              <Text style={styles.emptyHint}>
                Create an invite above to let others join {server.name}.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <InviteCard invite={item} onShare={handleShare} onDelete={handleDelete} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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
  headerTitle: { ...typography.heading, color: colors.text, flex: 1 },

  // List
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  separator: { height: spacing.sm },

  // Form card
  formCard: {
    backgroundColor: colors.sidebar,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  formTitle: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  switchInfo: { flex: 1, gap: 2 },
  switchLabel: { ...typography.body, color: colors.text, fontWeight: "600" },
  switchHint: { ...typography.caption, color: colors.textDim },
  createBtn: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnPressed: { opacity: 0.85 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  statusText: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "center",
  },

  // Section title
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.xs,
  },

  // Invite card
  card: {
    backgroundColor: colors.sidebar,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    gap: spacing.sm,
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardInfo: { flex: 1, minWidth: 0, gap: 3 },
  cardCode: {
    ...typography.body,
    color: colors.text,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  cardMeta: { ...typography.caption, color: colors.textDim },
  cardActions: { flexDirection: "row", gap: spacing.sm, flexShrink: 0 },
  cardBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBtnShare: {
    borderColor: colors.brand,
    backgroundColor: "rgba(115,134,255,0.1)",
  },
  cardBtnDelete: {
    borderColor: colors.danger,
    backgroundColor: "rgba(239,95,118,0.1)",
  },
  cardBtnPressed: { opacity: 0.65 },
  cardBtnShareText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
  cardBtnDeleteText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  cardUrl: {
    ...typography.caption,
    color: colors.textDim,
    fontFamily: "monospace",
    backgroundColor: colors.input,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },

  // Empty state
  centered: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { ...typography.heading, color: colors.text },
  emptyHint: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "center",
  },
});
