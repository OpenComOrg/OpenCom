import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createApiClient } from "../api";
import { resolveCoreApiUrl } from "../config";
import { saveTokens, clearTokens } from "../storage";
import { normalizeServerList } from "../urls";
import type {
  AuthTokens,
  CoreServer,
  DmMessageApi,
  DmThreadApi,
  MyProfile,
  UserStatus,
} from "../types";

type ApiClient = ReturnType<typeof createApiClient>;

export type PresenceMap = Record<
  string,
  { status: string; customStatus?: string | null }
>;

export type AuthContextValue = {
  api: ApiClient;
  coreApiUrl: string;

  // Auth tokens
  tokens: AuthTokens | null;
  setTokens: (tokens: AuthTokens | null) => Promise<void>;

  // Basic identity
  me: { id: string; username: string } | null;
  setMe: (me: { id: string; username: string } | null) => void;

  // Full profile
  myProfile: MyProfile | null;
  setMyProfile: (profile: MyProfile | null) => void;
  refreshMyProfile: () => Promise<void>;

  // Self status (set by user)
  selfStatus: UserStatus;
  setSelfStatus: (status: UserStatus) => void;
  selfCustomStatus: string | null;
  setSelfCustomStatus: (customStatus: string | null) => void;

  // Servers
  servers: CoreServer[];
  setServers: React.Dispatch<React.SetStateAction<CoreServer[]>>;
  refreshServers: () => Promise<void>;

  // Presence map: userId -> { status, customStatus }
  presenceByUserId: PresenceMap;
  updatePresence: (
    userId: string,
    status: string,
    customStatus?: string | null,
  ) => void;

  // DM threads (kept globally so screens can react to real-time updates)
  dmThreads: DmThreadApi[];
  setDmThreads: React.Dispatch<React.SetStateAction<DmThreadApi[]>>;
  upsertDmMessage: (threadId: string, message: DmMessageApi) => void;
  removeDmMessage: (threadId: string, messageId: string) => void;

  // DM messages cache: threadId -> messages array (newest-first from API)
  dmMessages: Record<string, DmMessageApi[]>;
  setDmMessages: React.Dispatch<
    React.SetStateAction<Record<string, DmMessageApi[]>>
  >;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUserStatus(value: string | null | undefined): UserStatus {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "idle" ||
    normalized === "dnd" ||
    normalized === "offline" ||
    normalized === "invisible"
  ) {
    return normalized;
  }
  return "online";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const coreApiUrl = useMemo(() => resolveCoreApiUrl(), []);
  const tokensRef = useRef<AuthTokens | null>(null);

  const [tokens, setTokensState] = useState<AuthTokens | null>(null);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [selfStatus, setSelfStatus] = useState<UserStatus>("online");
  const [selfCustomStatus, setSelfCustomStatus] = useState<string | null>(null);
  const [servers, setServers] = useState<CoreServer[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<PresenceMap>({});
  const [dmThreads, setDmThreads] = useState<DmThreadApi[]>([]);
  const [dmMessages, setDmMessages] = useState<Record<string, DmMessageApi[]>>(
    {},
  );

  const setTokens = useCallback(async (next: AuthTokens | null) => {
    tokensRef.current = next;
    setTokensState(next);
    if (next) {
      await saveTokens(next);
    } else {
      await clearTokens();
      setMe(null);
      setMyProfile(null);
      setSelfStatus("online");
      setSelfCustomStatus(null);
      setServers([]);
      setPresenceByUserId({});
      setDmThreads([]);
      setDmMessages({});
    }
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        coreApiUrl,
        getTokens: () => tokensRef.current,
        setTokens,
        updateServerMembershipToken: (serverId, membershipToken) => {
          setServers((current) =>
            current.map((s) =>
              s.id === serverId ? { ...s, membershipToken } : s,
            ),
          );
        },
      }),
    [coreApiUrl, setTokens],
  );

  const refreshServers = useCallback(async () => {
    const meData = await api.getMe();
    const [serversData, presenceData] = await Promise.all([
      api.getServers(),
      api.getPresence([meData.id]).catch(() => ({
        presence: {} as Record<
          string,
          { status: string; customStatus?: string | null }
        >,
      })),
    ]);
    setMe({ id: meData.id, username: meData.username });
    setServers(normalizeServerList(serversData.servers || []));
    const selfPresence = presenceData.presence?.[meData.id];
    if (selfPresence?.status) {
      const normalizedStatus = normalizeUserStatus(selfPresence.status);
      setSelfStatus(normalizedStatus);
      setSelfCustomStatus(selfPresence.customStatus ?? null);
      setPresenceByUserId((prev) => ({
        ...prev,
        [meData.id]: {
          status: normalizedStatus,
          customStatus: selfPresence.customStatus ?? null,
        },
      }));
    } else {
      setSelfCustomStatus(null);
    }
  }, [api]);

  const refreshMyProfile = useCallback(async () => {
    try {
      const profile = await api.getMyProfile();
      setMyProfile(profile);
    } catch {
      // non-fatal
    }
  }, [api]);

  const updatePresence = useCallback(
    (userId: string, status: string, customStatus?: string | null) => {
      setPresenceByUserId((prev) => ({
        ...prev,
        [userId]: { status, customStatus: customStatus ?? null },
      }));
    },
    [],
  );

  /** Insert or update a DM message in the cache and update thread preview */
  const upsertDmMessage = useCallback(
    (threadId: string, message: DmMessageApi) => {
      // Update messages cache
      setDmMessages((prev) => {
        const existing = prev[threadId] ?? [];
        const idx = existing.findIndex((m) => m.id === message.id);
        let next: DmMessageApi[];
        if (idx >= 0) {
          next = existing.map((m, i) => (i === idx ? message : m));
        } else {
          // Prepend (list is newest-first from API perspective, but we store
          // oldest-first for display). Actually store newest-first to match
          // API and let each screen reverse for display.
          next = [message, ...existing];
        }
        return { ...prev, [threadId]: next };
      });

      // Update thread list preview
      setDmThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === threadId);
        if (idx < 0) return prev;
        const updated = {
          ...prev[idx],
          lastMessageAt: message.createdAt,
          lastMessageContent: message.content,
        };
        const next = [...prev];
        next[idx] = updated;
        // Bubble to top
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
    },
    [],
  );

  /** Remove a DM message from the cache */
  const removeDmMessage = useCallback((threadId: string, messageId: string) => {
    setDmMessages((prev) => {
      const existing = prev[threadId];
      if (!existing) return prev;
      return {
        ...prev,
        [threadId]: existing.filter((m) => m.id !== messageId),
      };
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      api,
      coreApiUrl,
      tokens,
      setTokens,
      me,
      setMe,
      myProfile,
      setMyProfile,
      refreshMyProfile,
      selfStatus,
      setSelfStatus,
      selfCustomStatus,
      setSelfCustomStatus,
      servers,
      setServers,
      refreshServers,
      presenceByUserId,
      updatePresence,
      dmThreads,
      setDmThreads,
      upsertDmMessage,
      removeDmMessage,
      dmMessages,
      setDmMessages,
    }),
    [
      api,
      coreApiUrl,
      tokens,
      setTokens,
      me,
      myProfile,
      refreshMyProfile,
      selfStatus,
      selfCustomStatus,
      servers,
      refreshServers,
      presenceByUserId,
      updatePresence,
      dmThreads,
      upsertDmMessage,
      removeDmMessage,
      dmMessages,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
