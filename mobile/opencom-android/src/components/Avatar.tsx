import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, shadows } from "../theme";
import { resolveCoreImageUrl } from "../urls";

type AvatarProps = {
  username?: string | null;
  pfpUrl?: string | null;
  size?: number;
  status?: string | null;
  showStatus?: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  online: colors.success,
  idle: "#f0b429",
  dnd: colors.danger,
  offline: colors.textDim,
  invisible: colors.textDim,
};

function getInitial(username?: string | null): string {
  const cleaned = (username ?? "?").trim();
  return cleaned.charAt(0).toUpperCase();
}

function hashColor(seed?: string | null): string {
  let hash = 0;
  const s = seed ?? "?";
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export function Avatar({
  username,
  pfpUrl,
  size = 36,
  status,
  showStatus = false,
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const badgeSize = Math.max(10, Math.round(size * 0.28));
  const badgeOffset = Math.round(badgeSize * 0.1);
  const borderRadius = size / 2;
  const badgeColor = status ? (STATUS_COLORS[status] ?? STATUS_COLORS.offline) : STATUS_COLORS.offline;
  const resolvedPfpUrl = resolveCoreImageUrl(pfpUrl);

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedPfpUrl]);

  return (
    <View style={{ width: size, height: size }}>
      {resolvedPfpUrl && !imageFailed ? (
        <Image
          source={{ uri: resolvedPfpUrl }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius,
              borderWidth: 1,
            },
          ]}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: size,
              height: size,
              borderRadius,
              backgroundColor: hashColor(username),
              borderWidth: 1,
            },
          ]}
        >
          <Text
            style={[
              styles.initial,
              { fontSize: Math.max(10, Math.round(size * 0.42)) },
            ]}
            numberOfLines={1}
          >
            {getInitial(username)}
          </Text>
        </View>
      )}

      {showStatus && status && (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: badgeColor,
              bottom: badgeOffset,
              right: badgeOffset,
              borderWidth: Math.max(1, Math.round(badgeSize * 0.2)),
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.elev,
    borderColor: colors.border,
    ...shadows.card,
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    borderColor: colors.border,
    ...shadows.card,
  },
  initial: {
    color: "#fff",
    fontWeight: "700",
    includeFontPadding: false,
  },
  badge: {
    position: "absolute",
    borderColor: colors.background,
  },
});
