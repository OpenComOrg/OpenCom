import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Directory, File, Paths } from "expo-file-system";

import { useAuth } from "../context/AuthContext";
import {
  formatBytes,
  getAttachmentDisplayName,
  isImageAttachment,
  sanitizeFileName,
} from "../attachments";
import { colors, radii, spacing, typography } from "../theme";
import { resolveCoreAttachmentUrl, resolveServerAttachmentUrl } from "../urls";

import type { CoreServer, MessageAttachment } from "../types";

type MessageAttachmentsProps =
  | {
      attachments?: MessageAttachment[] | null;
      scope: "core";
      server?: never;
    }
  | {
      attachments?: MessageAttachment[] | null;
      scope: "server";
      server: Pick<CoreServer, "baseUrl" | "membershipToken">;
    };

type ResolvedAttachment = {
  attachment: MessageAttachment;
  displayName: string;
  resolvedUrl: string | null;
  isImage: boolean;
  sizeLabel: string;
};

export function MessageAttachments(props: MessageAttachmentsProps) {
  const { attachments } = props;
  const { coreApiUrl, tokens } = useAuth();
  const [openingAttachmentId, setOpeningAttachmentId] = useState("");
  const [failedImageIds, setFailedImageIds] = useState<Record<string, boolean>>(
    {},
  );

  const authToken =
    props.scope === "server"
      ? props.server.membershipToken
      : tokens?.accessToken ?? "";
  const authHeaders = useMemo(
    () =>
      authToken
        ? {
            Authorization: `Bearer ${authToken}`,
          }
        : undefined,
    [authToken],
  );

  const resolvedAttachments = useMemo<ResolvedAttachment[]>(() => {
    const list = Array.isArray(attachments) ? attachments : [];
    return list.map((attachment) => {
      const displayName = getAttachmentDisplayName(attachment);
      const resolvedUrl =
        props.scope === "server"
          ? resolveServerAttachmentUrl(attachment.url, props.server.baseUrl)
          : resolveCoreAttachmentUrl(attachment.url);
      return {
        attachment,
        displayName,
        resolvedUrl,
        isImage:
          !failedImageIds[attachment.id] &&
          !!resolvedUrl &&
          isImageAttachment(attachment),
        sizeLabel: formatBytes(
          attachment.sizeBytes ?? attachment.size ?? undefined,
        ),
      };
    });
  }, [attachments, coreApiUrl, failedImageIds, props]);

  const openAttachment = async (item: ResolvedAttachment) => {
    if (!item.resolvedUrl) {
      Alert.alert(
        "Attachment unavailable",
        "This attachment link could not be resolved on mobile.",
      );
      return;
    }

    setOpeningAttachmentId(item.attachment.id);
    try {
      const downloadDirectory = new Directory(Paths.cache, "opencom-attachments");
      downloadDirectory.create({ idempotent: true, intermediates: true });

      const targetFile = new File(
        downloadDirectory,
        `${sanitizeFileName(item.attachment.id)}-${sanitizeFileName(item.displayName)}`,
      );
      const downloaded = await File.downloadFileAsync(
        item.resolvedUrl,
        targetFile,
        {
          headers: authHeaders,
          idempotent: true,
        },
      );

      const openUrl =
        Platform.OS === "android" && downloaded.contentUri
          ? downloaded.contentUri
          : downloaded.uri;

      try {
        await Linking.openURL(openUrl);
      } catch {
        Alert.alert(
          "Attachment saved",
          "The file was downloaded, but your device could not open it automatically.",
        );
      }
    } catch {
      Alert.alert(
        "Attachment error",
        "Could not download this attachment right now.",
      );
    } finally {
      setOpeningAttachmentId("");
    }
  };

  if (resolvedAttachments.length === 0) return null;

  return (
    <View style={styles.container}>
      {resolvedAttachments.map((item) => {
        const busy = openingAttachmentId === item.attachment.id;
        if (item.isImage && item.resolvedUrl) {
          return (
            <Pressable
              key={item.attachment.id}
              style={({ pressed }) => [
                styles.imageCard,
                pressed && styles.attachmentPressed,
              ]}
              onPress={() => void openAttachment(item)}
            >
              <Image
                source={
                  authHeaders
                    ? ({ uri: item.resolvedUrl, headers: authHeaders } as any)
                    : { uri: item.resolvedUrl }
                }
                style={styles.imagePreview}
                resizeMode="cover"
                onError={() =>
                  setFailedImageIds((current) => ({
                    ...current,
                    [item.attachment.id]: true,
                  }))
                }
              />
              <View style={styles.imageMeta}>
                <Text style={styles.imageName} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={styles.imageHint}>
                  {busy ? "Opening..." : item.sizeLabel || "Tap to open"}
                </Text>
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={item.attachment.id}
            style={({ pressed }) => [
              styles.fileCard,
              pressed && styles.attachmentPressed,
            ]}
            onPress={() => void openAttachment(item)}
          >
            <View style={styles.fileIconWrap}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Text style={styles.fileIcon}>📎</Text>
              )}
            </View>
            <View style={styles.fileCopy}>
              <Text style={styles.fileName} numberOfLines={1}>
                {item.displayName}
              </Text>
              <Text style={styles.fileHint} numberOfLines={1}>
                {busy ? "Opening on this device..." : item.sizeLabel || "Tap to open"}
              </Text>
            </View>
            <Text style={styles.fileAction}>Open</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  attachmentPressed: {
    opacity: 0.82,
  },
  imageCard: {
    overflow: "hidden",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
  },
  imagePreview: {
    width: "100%",
    height: 172,
    backgroundColor: colors.elev,
  },
  imageMeta: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  imageName: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  imageHint: {
    ...typography.caption,
    color: colors.textDim,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  fileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.elev,
  },
  fileIcon: {
    fontSize: 16,
  },
  fileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  fileName: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  fileHint: {
    ...typography.caption,
    color: colors.textDim,
  },
  fileAction: {
    ...typography.label,
    color: colors.brand,
    fontWeight: "700",
  },
});
