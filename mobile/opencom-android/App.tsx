import { useCallback, useEffect, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import {
  useCoreGateway,
  httpToCoreGatewayWs,
  type CoreGatewayController,
} from "./src/hooks/useGateway";
import { AppTabBar } from "./src/components/chrome";
import { Avatar } from "./src/components/Avatar";

import { AuthScreen } from "./src/screens/AuthScreen";
import { ServersScreen } from "./src/screens/ServersScreen";
import { ChannelScreen } from "./src/screens/ChannelScreen";
import { DmsScreen } from "./src/screens/DmsScreen";
import { DmChatScreen } from "./src/screens/DmChatScreen";
import { FriendsScreen } from "./src/screens/FriendsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { PinnedMessagesScreen } from "./src/screens/PinnedMessagesScreen";
import { CreateInviteScreen } from "./src/screens/CreateInviteScreen";
import { MembersScreen } from "./src/screens/MembersScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { VoiceRoomScreen } from "./src/screens/VoiceRoomScreen";

import { parseDeepLink } from "./src/deeplinks";
import {
  initNotificationsSafe,
  registerForPushNotificationsAsync,
} from "./src/notifications";
import { loadPushToken, loadTokens, savePushToken } from "./src/storage";

import type {
  Channel,
  CoreServer,
  DeepLinkTarget,
  DmThreadApi,
  Friend,
  Guild,
} from "./src/types";
import { ThemeProvider, colors, useTheme } from "./src/theme";

// ─── Navigator instances ──────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();
const MainStack = createNativeStackNavigator();

type IncomingCallPrompt = {
  callId: string;
  callerId: string;
  callerName: string;
  callerPfp?: string | null;
  threadId?: string;
};

// ─── Tab screen wrappers ──────────────────────────────────────────────────────

function TabServers({ navigation }: { navigation: any }) {
  const onSelectChannel = useCallback(
    (server: CoreServer, guild: Guild, channel: Channel) => {
      navigation.navigate(channel.type === "voice" ? "VoiceRoom" : "Channel", {
        server,
        guild,
        channel,
        ...(channel.type === "voice" ? { mode: "server" as const } : {}),
      });
    },
    [navigation],
  );

  const onViewInvites = useCallback(
    (server: CoreServer) => {
      navigation.navigate("CreateInvite", { server });
    },
    [navigation],
  );

  const onViewMembers = useCallback(
    (server: CoreServer, guild: Guild) => {
      navigation.navigate("Members", { server, guild });
    },
    [navigation],
  );

  return (
    <ServersScreen
      onSelectChannel={onSelectChannel}
      onViewInvites={onViewInvites}
      onViewMembers={onViewMembers}
    />
  );
}

function TabDms({ navigation }: { navigation: any }) {
  const onSelectDm = useCallback(
    (thread: DmThreadApi) => {
      navigation.navigate("DmChat", { thread });
    },
    [navigation],
  );

  return <DmsScreen onSelectDm={onSelectDm} />;
}

function TabFriends({ navigation }: { navigation: any }) {
  const { api } = useAuth();

  const onOpenDm = useCallback(
    async (friend: Friend) => {
      try {
        const { threadId } = await api.openDm(friend.id);
        navigation.navigate("DmChat", {
          thread: {
            id: threadId,
            participantId: friend.id,
            name: friend.username,
            pfp_url: friend.pfp_url ?? null,
            lastMessageAt: null,
            lastMessageContent: null,
          } satisfies DmThreadApi,
        });
      } catch {
        // FriendsScreen will show a status error if needed
      }
    },
    [api, navigation],
  );

  return <FriendsScreen onOpenDm={onOpenDm} />;
}

function TabProfile({ navigation }: { navigation: any }) {
  const { setTokens } = useAuth();

  const onLogout = useCallback(async () => {
    await setTokens(null);
  }, [setTokens]);

  const onOpenSettings = useCallback((tab?: string) => {
    navigation.navigate("Settings", tab ? { tab } : undefined);
  }, [navigation]);

  return <ProfileScreen onLogout={onLogout} onOpenSettings={onOpenSettings} />;
}

// ─── Tab navigator ────────────────────────────────────────────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: "transparent",
        },
      }}
    >
      <Tab.Screen
        name="Servers"
        component={TabServers}
        options={{
          title: "Servers",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="DMs"
        component={TabDms}
        options={{
          title: "Messages",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>💬</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={TabFriends}
        options={{
          title: "Friends",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>👥</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={TabProfile}
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>👤</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Stack screen wrappers ────────────────────────────────────────────────────

function ChannelScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { server, guild, channel } = route.params as {
    server: CoreServer;
    guild: Guild;
    channel: Channel;
  };

  const onViewPins = useCallback(() => {
    navigation.navigate("PinnedMessages", {
      mode: "channel",
      server,
      channel,
    });
  }, [navigation, server, channel]);

  const onViewMembers = useCallback(() => {
    navigation.navigate("Members", { server, guild });
  }, [navigation, server, guild]);

  const onJoinVoice = useCallback(
    (nextServer: CoreServer, nextGuild: Guild, nextChannel: Channel) => {
      navigation.navigate("VoiceRoom", {
        server: nextServer,
        guild: nextGuild,
        channel: nextChannel,
        mode: "server",
      });
    },
    [navigation],
  );

  return (
    <ChannelScreen
      server={server}
      guild={guild}
      channel={channel}
      onBack={() => navigation.goBack()}
      onViewPins={onViewPins}
      onViewMembers={onViewMembers}
      onJoinVoice={onJoinVoice}
    />
  );
}

function DmChatScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { api } = useAuth();
  const { thread } = route.params as { thread: DmThreadApi };

  const onViewPins = useCallback(() => {
    navigation.navigate("PinnedMessages", { mode: "dm", thread });
  }, [navigation, thread]);

  const onStartCall = useCallback(
    async (targetThread: DmThreadApi) => {
      try {
        const created = await api.createPrivateCall(targetThread.participantId);
        if (!created.success || !created.call_id) {
          throw new Error(created.message || "CALL_CREATE_FAILED");
        }

        const joined = await api.joinPrivateCall(created.call_id);
        if (
          !joined.success ||
          !joined.guildId ||
          !joined.channelId ||
          (!joined.mediaToken && !joined.membershipToken)
        ) {
          throw new Error("CALL_JOIN_FAILED");
        }

        navigation.navigate("VoiceRoom", {
          mode: "private",
          callId: created.call_id,
          participantName: targetThread.name,
          mediaToken: joined.mediaToken ?? null,
          mediaWsUrl: joined.mediaWsUrl ?? null,
          membershipToken: joined.membershipToken ?? null,
          nodeBaseUrl: joined.nodeBaseUrl ?? null,
          roomId: joined.roomId ?? null,
          guild: {
            id: joined.guildId,
            name: "Private Calls",
          },
          channel: {
            id: joined.channelId,
            guild_id: joined.guildId,
            name: "Private Call",
            type: "voice",
            position: 0,
            parent_id: null,
          } satisfies Channel,
        });
      } catch {
        Alert.alert("Call failed", "Could not start the voice call right now.");
      }
    },
    [api, navigation],
  );

  return (
    <DmChatScreen
      thread={thread}
      onBack={() => navigation.goBack()}
      onViewPins={onViewPins}
      onStartCall={onStartCall}
    />
  );
}

function PinnedMessagesScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { mode, server, channel, thread } = route.params;

  if (mode === "channel") {
    return (
      <PinnedMessagesScreen
        mode="channel"
        server={server}
        channel={channel}
        onBack={() => navigation.goBack()}
      />
    );
  }
  return (
    <PinnedMessagesScreen
      mode="dm"
      thread={thread}
      onBack={() => navigation.goBack()}
    />
  );
}

function CreateInviteScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { server } = route.params as { server: CoreServer };
  return (
    <CreateInviteScreen server={server} onBack={() => navigation.goBack()} />
  );
}

function MembersScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { server, guild } = route.params as {
    server: CoreServer;
    guild: Guild;
  };
  const { api, me } = useAuth();

  const onOpenDm = useCallback(
    async (userId: string, username: string) => {
      try {
        const { threadId } = await api.openDm(userId);
        navigation.navigate("DmChat", {
          thread: {
            id: threadId,
            participantId: userId,
            name: username,
            pfp_url: null,
            lastMessageAt: null,
            lastMessageContent: null,
          } satisfies DmThreadApi,
        });
      } catch {
        Alert.alert("Error", "Could not open DM with this user.");
      }
    },
    [api, navigation],
  );

  return (
    <MembersScreen
      server={server}
      guild={guild}
      myId={me?.id ?? ""}
      onBack={() => navigation.goBack()}
      onOpenDm={onOpenDm}
    />
  );
}

function SettingsScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { setTokens } = useAuth();
  const params = route?.params || {};

  const onLogout = useCallback(async () => {
    await setTokens(null);
  }, [setTokens]);

  return (
    <SettingsScreen
      onLogout={onLogout}
      initialTab={params.tab}
      initialGiftCode={params.giftCode}
    />
  );
}

function VoiceRoomScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const {
    server,
    guild,
    channel,
    mode,
    mediaToken,
    mediaWsUrl,
    membershipToken,
    nodeBaseUrl,
    roomId,
    callId,
    participantName,
  } = route.params as {
    server?: CoreServer;
    guild: Guild;
    channel: Channel;
    mode?: "server" | "private";
    mediaToken?: string | null;
    mediaWsUrl?: string | null;
    membershipToken?: string | null;
    nodeBaseUrl?: string | null;
    roomId?: string | null;
    callId?: string;
    participantName?: string | null;
  };

  return (
    <VoiceRoomScreen
      server={server}
      guild={guild}
      channel={channel}
      mode={mode}
      mediaToken={mediaToken}
      mediaWsUrl={mediaWsUrl}
      membershipToken={membershipToken}
      nodeBaseUrl={nodeBaseUrl}
      roomId={roomId}
      callId={callId}
      participantName={participantName}
      onBack={() => navigation.goBack()}
    />
  );
}

// ─── Main stack navigator ─────────────────────────────────────────────────────

function MainNavigator() {
  const { theme } = useTheme();
  return (
    <MainStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <MainStack.Screen name="Tabs" component={MainTabs} />
      <MainStack.Screen
        name="Channel"
        component={ChannelScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="DmChat"
        component={DmChatScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="PinnedMessages"
        component={PinnedMessagesScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="CreateInvite"
        component={CreateInviteScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="Members"
        component={MembersScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="Settings"
        component={SettingsScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="VoiceRoom"
        component={VoiceRoomScreenWrapper}
        options={{ presentation: "card" }}
      />
    </MainStack.Navigator>
  );
}

// ─── Gateway-wired app content ────────────────────────────────────────────────

function AppContent() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const {
    tokens,
    setTokens,
    me,
    setMe,
    servers,
    refreshServers,
    refreshMyProfile,
    api,
    coreApiUrl,
    selfStatus,
    selfCustomStatus,
    setSelfStatus,
    setSelfCustomStatus,
    updatePresence,
    dmThreads,
    upsertDmMessage,
    removeDmMessage,
    setDmThreads,
  } = useAuth();

  const [booting, setBooting] = useState(true);
  const [authStatus, setAuthStatus] = useState("");
  const [navigationReady, setNavigationReady] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallPrompt | null>(
    null,
  );
  const [answeringCall, setAnsweringCall] = useState(false);
  const [decliningCall, setDecliningCall] = useState(false);
  const navigationRef = useRef<any>(null);
  const pendingDeepLinkRef = useRef<DeepLinkTarget | null>(null);
  const coreGatewayRef = useRef<CoreGatewayController | null>(null);

  const getApiErrorCode = useCallback((error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error || "");
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === "string") return parsed.error;
    } catch {}
    return raw || "UNKNOWN_ERROR";
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const gatewayWsUrl = httpToCoreGatewayWs(coreApiUrl);

  const openFriendsScreen = useCallback(() => {
    if (!navigationRef.current?.navigate) return false;
    navigationRef.current.navigate("Tabs", { screen: "Friends" });
    return true;
  }, []);

  const openDmThreadById = useCallback(
    async (threadId: string) => {
      const normalizedThreadId = String(threadId || "").trim();
      if (!normalizedThreadId || !navigationRef.current?.navigate) return false;

      let thread =
        dmThreads.find((item) => item.id === normalizedThreadId) || null;

      if (!thread) {
        const data = await api.getDms().catch(() => null);
        const nextThreads = data?.dms ?? [];
        if (nextThreads.length) {
          setDmThreads(nextThreads);
          thread =
            nextThreads.find((item) => item.id === normalizedThreadId) || null;
        }
      }

      if (!thread) return false;

      navigationRef.current.navigate("DmChat", { thread });
      return true;
    },
    [api, dmThreads, setDmThreads],
  );

  const openServerChannelTarget = useCallback(
    async (target: Extract<DeepLinkTarget, { kind: "channel" }>) => {
      if (!navigationRef.current?.navigate) return false;
      const server = servers.find((item) => item.id === target.serverId);
      if (!server) return false;

      const state = await api.getGuildState(server, target.guildId).catch(() => null);
      if (!state?.guild) return false;

      const channel =
        state.channels.find((item) => item.id === target.channelId) ||
        state.channels.find((item) => item.type === "text") ||
        state.channels[0];
      if (!channel) return false;

      navigationRef.current.navigate(
        channel.type === "voice" ? "VoiceRoom" : "Channel",
        {
        server,
        guild: state.guild,
        channel,
        ...(channel.type === "voice" ? { mode: "server" as const } : {}),
        },
      );
      return true;
    },
    [api, servers],
  );

  const queueIncomingCall = useCallback((payload: IncomingCallPrompt) => {
    if (!payload.callId) return;
    setIncomingCall((current) => {
      if (current?.callId === payload.callId) {
        return { ...current, ...payload };
      }
      return payload;
    });
  }, []);

  const openPrivateCallRoom = useCallback(
    async (call: IncomingCallPrompt) => {
      if (!navigationRef.current?.navigate || !call.callId) return false;

      const joined = await api.joinPrivateCall(call.callId);
      if (
        !joined.success ||
        !joined.guildId ||
        !joined.channelId ||
        (!joined.mediaToken && !joined.membershipToken)
      ) {
        return false;
      }

      navigationRef.current.navigate("VoiceRoom", {
        mode: "private",
        callId: call.callId,
        participantName: call.callerName,
        mediaToken: joined.mediaToken ?? null,
        mediaWsUrl: joined.mediaWsUrl ?? null,
        membershipToken: joined.membershipToken ?? null,
        nodeBaseUrl: joined.nodeBaseUrl ?? null,
        roomId: joined.roomId ?? null,
        guild: {
          id: joined.guildId,
          name: "Private Calls",
        },
        channel: {
          id: joined.channelId,
          guild_id: joined.guildId,
          name: "Private Call",
          type: "voice",
          position: 0,
          parent_id: null,
        } satisfies Channel,
      });
      setIncomingCall(null);
      return true;
    },
    [api],
  );

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall || answeringCall) return;
    setAnsweringCall(true);
    try {
      const opened = await openPrivateCallRoom(incomingCall);
      if (!opened) {
        Alert.alert("Call unavailable", "Could not join this call right now.");
      }
    } finally {
      setAnsweringCall(false);
    }
  }, [answeringCall, incomingCall, openPrivateCallRoom]);

  const declineIncomingCall = useCallback(async () => {
    if (!incomingCall || decliningCall) return;
    setDecliningCall(true);
    try {
      await api.endPrivateCall(incomingCall.callId);
      setIncomingCall(null);
    } catch {
      Alert.alert("Call error", "Could not decline this call right now.");
    } finally {
      setDecliningCall(false);
    }
  }, [api, decliningCall, incomingCall]);

  const handleNotificationCallData = useCallback(
    async (data: Record<string, unknown>) => {
      const callId = String(data.callId || "").trim();
      if (!callId) return false;

      const threadId = String(data.threadId || "").trim();
      if (threadId) {
        await openDmThreadById(threadId).catch(() => false);
      }

      queueIncomingCall({
        callId,
        callerId: String(data.callerId || "").trim(),
        callerName: String(data.callerName || "Incoming Call").trim(),
        callerPfp: String(data.callerPfp || "").trim() || null,
        threadId: threadId || undefined,
      });
      return true;
    },
    [openDmThreadById, queueIncomingCall],
  );

  const sendSelfPresence = useCallback(() => {
    if (!tokens?.accessToken || !coreGatewayRef.current?.ready) return false;
    return coreGatewayRef.current.sendDispatch("SET_PRESENCE", {
      status: selfStatus,
      customStatus: selfCustomStatus ?? null,
    });
  }, [tokens?.accessToken, selfStatus, selfCustomStatus]);

  // ── Core gateway ─────────────────────────────────────────────────────────────
  // Handles real-time DMs, presence, and call events globally.
  const coreGateway = useCoreGateway({
    wsUrl: gatewayWsUrl,
    accessToken: tokens?.accessToken ?? null,
    enabled: !!tokens?.accessToken,
    onEvent: useCallback(
      (event) => {
        switch (event.type) {
          case "PRESENCE_SYNC_REQUEST":
            sendSelfPresence();
            break;

          case "SELF_STATUS":
            {
              const normalizedStatus =
                event.status === "idle" ||
                event.status === "dnd" ||
                event.status === "offline" ||
                event.status === "invisible"
                  ? event.status
                  : "online";
              setSelfStatus(normalizedStatus);
              setSelfCustomStatus(event.customStatus ?? null);
              if (me?.id) {
                updatePresence(me.id, normalizedStatus, event.customStatus);
              }
            }
            break;

          case "PRESENCE_UPDATE":
            updatePresence(event.userId, event.status, event.customStatus);
            break;

          case "DM_NEW_MESSAGE":
            upsertDmMessage(event.threadId, event.message);
            // If thread unknown, refresh thread list
            setDmThreads((prev) => {
              if (!prev.some((t) => t.id === event.threadId)) {
                api
                  .getDms()
                  .then((data) => setDmThreads(data.dms ?? []))
                  .catch(() => {});
              }
              return prev;
            });
            break;

          case "DM_MESSAGE_DELETED":
            removeDmMessage(event.threadId, event.messageId);
            break;

          case "CALL_INCOMING":
            queueIncomingCall({
              callId: event.callId,
              callerId: event.callerId,
              callerName: event.callerName,
              callerPfp: event.callerPfp ?? null,
            });
            break;

          case "CALL_ENDED":
            setIncomingCall((current) =>
              current?.callId === event.callId ? null : current,
            );
            break;

          case "FRIEND_REQUEST":
            break;

          case "FRIEND_ACCEPTED":
            api
              .getDms()
              .then((data) => setDmThreads(data.dms ?? []))
              .catch(() => {});
            break;

          default:
            break;
        }
      },
      [
        api,
        me?.id,
        queueIncomingCall,
        removeDmMessage,
        sendSelfPresence,
        setDmThreads,
        setSelfCustomStatus,
        setSelfStatus,
        updatePresence,
        upsertDmMessage,
      ],
    ),
  });
  coreGatewayRef.current = coreGateway;

  useEffect(() => {
    if (!coreGateway.ready) return;
    sendSelfPresence();
  }, [coreGateway.ready, sendSelfPresence]);

  // ── Auth helpers ──────────────────────────────────────────────────────────────

  const handleAuth = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      mode: "login" | "register",
    ) => {
      try {
        setAuthStatus(mode === "register" ? "Creating account..." : "Signing in...");
        if (mode === "register") {
          await api.register(email, username, password);
        }
        const login = await api.login(email, password);
        await setTokens({
          accessToken: login.accessToken,
          refreshToken: login.refreshToken,
        });
        setMe({ id: login.user.id, username: login.user.username });
        setAuthStatus("");
        await refreshServers();
        // Load full profile after sign in
        refreshMyProfile().catch(() => {});
      } catch (error: unknown) {
        const code = getApiErrorCode(error);
        if (code === "EMAIL_NOT_VERIFIED") {
          setAuthStatus("Check your email and verify your account before logging in.");
          return;
        }
        if (code === "SMTP_NOT_CONFIGURED") {
          setAuthStatus("SMTP is not configured on the API server.");
          return;
        }
        if (code === "SMTP_AUTH_FAILED") {
          setAuthStatus("SMTP authentication failed.");
          return;
        }
        if (code === "SMTP_CONNECTION_FAILED") {
          setAuthStatus("Could not connect to the SMTP server.");
          return;
        }
        if (code === "INVALID_CREDENTIALS") {
          setAuthStatus("Invalid email or password.");
          return;
        }
        setAuthStatus(code);
      }
    },
    [api, getApiErrorCode, setTokens, setMe, refreshServers, refreshMyProfile],
  );

  const handleForgotPassword = useCallback(
    async (email: string) => {
      const normalizedEmail = String(email || "").trim();
      if (!normalizedEmail) {
        setAuthStatus("Enter your email first.");
        return;
      }
      try {
        setAuthStatus("Sending reset link...");
        await api.forgotPassword(normalizedEmail);
        setAuthStatus("If the account exists, a password reset link has been sent.");
      } catch (error: unknown) {
        const code = getApiErrorCode(error);
        if (code === "SMTP_NOT_CONFIGURED") {
          setAuthStatus("SMTP is not configured on the API server.");
          return;
        }
        if (code === "SMTP_AUTH_FAILED") {
          setAuthStatus("SMTP authentication failed.");
          return;
        }
        if (code === "SMTP_CONNECTION_FAILED") {
          setAuthStatus("Could not connect to the SMTP server.");
          return;
        }
        setAuthStatus(code);
      }
    },
    [api, getApiErrorCode],
  );

  // ── Deep link handling ────────────────────────────────────────────────────────

  const applyDeepLinkTarget = useCallback(
    async (target: DeepLinkTarget) => {
      if (target.kind === "login") {
        await setTokens(null);
        setMe(null);
        setAuthStatus("You have been signed out.");
        return;
      }

      if (!tokens) {
        pendingDeepLinkRef.current = target;
        setAuthStatus("Sign in to continue.");
        return;
      }

      if (!navigationReady || !navigationRef.current?.navigate) {
        pendingDeepLinkRef.current = target;
        return;
      }

      if (target.kind === "join") {
        try {
          await api.joinInvite(target.code);
          await refreshServers();
          setAuthStatus("Invite accepted!");
          pendingDeepLinkRef.current = null;
        } catch {
          setAuthStatus("Failed to join via invite link.");
        }
        return;
      }

      if (target.kind === "gift") {
        navigationRef.current.navigate("Settings", {
          tab: "billing",
          giftCode: target.code,
        });
        pendingDeepLinkRef.current = null;
        return;
      }

      if (target.kind === "friends") {
        if (openFriendsScreen()) {
          pendingDeepLinkRef.current = null;
        }
        return;
      }

      if (target.kind === "dm") {
        if (await openDmThreadById(target.threadId)) {
          pendingDeepLinkRef.current = null;
        }
        return;
      }

      if (target.kind === "channel") {
        if (await openServerChannelTarget(target)) {
          pendingDeepLinkRef.current = null;
          return;
        }
      }

      if (target.kind === "server") {
        const server = servers.find((item) => item.id === target.serverId);
        if (server && navigationRef.current?.navigate) {
          navigationRef.current.navigate("Tabs", { screen: "Servers" });
          pendingDeepLinkRef.current = null;
          return;
        }
      }

      pendingDeepLinkRef.current = target;
    },
    [
      api,
      navigationReady,
      openDmThreadById,
      openFriendsScreen,
      openServerChannelTarget,
      refreshServers,
      servers,
      setTokens,
      setMe,
      tokens,
    ],
  );

  const handleIncomingUrl = useCallback(
    async (url: string) => {
      const target = parseDeepLink(url);
      if (!target) return;
      await applyDeepLinkTarget(target);
    },
    [applyDeepLinkTarget],
  );

  // ── Boot sequence ─────────────────────────────────────────────────────────────

  useEffect(() => {
    initNotificationsSafe();
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      // Restore session from storage
      const stored = await loadTokens();
      if (!alive) return;

      if (stored) {
        try {
          await setTokens(stored);
          await refreshServers();
          // Load full profile in the background
          refreshMyProfile().catch(() => {});
        } catch {
          await setTokens(null);
          setAuthStatus("Session expired. Please sign in again.");
        }
      }

      setBooting(false);

      // Handle cold-start deep link
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handleIncomingUrl(initialUrl);
      } else {
        const notificationResponse =
          await Notifications.getLastNotificationResponseAsync();
        const notificationData =
          notificationResponse?.notification.request.content.data ?? {};
        const notificationUrl = String(
          (notificationData.deepLink as string) ??
            (notificationData.url as string) ??
            "",
        );
        if (notificationUrl) await handleIncomingUrl(notificationUrl);
        await handleNotificationCallData(
          notificationData as Record<string, unknown>,
        );
      }
    })();

    // Warm deep links
    const linkSub = Linking.addEventListener(
      "url",
      (e) => void handleIncomingUrl(e.url),
    );

    // Notification tap → deep link
    const notifTapSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data ?? {};
        const url = String(
          (data.deepLink as string) ?? (data.url as string) ?? "",
        );
        if (url) void handleIncomingUrl(url);
        void handleNotificationCallData(data as Record<string, unknown>);
      },
    );

    // Notification received while foregrounded → refresh servers
    const notifReceiveSub = Notifications.addNotificationReceivedListener(
      () => {
        void refreshServers();
      },
    );

    return () => {
      alive = false;
      linkSub.remove();
      notifTapSub.remove();
      notifReceiveSub.remove();
    };
  }, [
    handleIncomingUrl,
    handleNotificationCallData,
    refreshServers,
    refreshMyProfile,
    setTokens,
  ]);

  // ── Pending deep link after sign in ───────────────────────────────────────────

  useEffect(() => {
    const pending = pendingDeepLinkRef.current;
    if (tokens?.accessToken && navigationReady && pending) {
      pendingDeepLinkRef.current = null;
      void applyDeepLinkTarget(pending);
    }
  }, [tokens?.accessToken, navigationReady, applyDeepLinkTarget]);

  // ── Push token registration ───────────────────────────────────────────────────

  useEffect(() => {
    if (!tokens?.accessToken) return;
    let alive = true;

    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!alive || !token) return;
        const existing = await loadPushToken();
        if (token !== existing) {
          await api.registerPushToken(token);
          await savePushToken(token);
        }
      } catch {
        // Non-fatal; push notifications are optional
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, tokens?.accessToken]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (booting) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
        }}
      >
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={{ color: colors.textDim, fontSize: 14 }}>
          Loading OpenCom…
        </Text>
      </View>
    );
  }

  if (!tokens) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <AuthScreen onLogin={handleAuth} onForgotPassword={handleForgotPassword} status={authStatus} />
      </View>
    );
  }

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => setNavigationReady(true)}
        theme={
          {
            dark: true,
            colors: {
              primary: colors.brand,
              background: colors.background,
              card: colors.sidebar,
              text: colors.text,
              border: colors.border,
              notification: colors.brand,
            },
            fonts: {
              regular: { fontFamily: "System", fontWeight: "400" },
              medium: { fontFamily: "System", fontWeight: "500" },
              bold: { fontFamily: "System", fontWeight: "700" },
              heavy: { fontFamily: "System", fontWeight: "900" },
            },
          } as any
        }
      >
        <StatusBar style="light" />
        <MainNavigator />
      </NavigationContainer>

      <Modal
        visible={!!incomingCall}
        transparent
        animationType="fade"
        onRequestClose={() => setIncomingCall(null)}
      >
        <View style={styles.callOverlay}>
          <View style={styles.callCard}>
            <Text style={styles.callEyebrow}>INCOMING CALL</Text>
            <Avatar
              username={incomingCall?.callerName || "Incoming Call"}
              pfpUrl={incomingCall?.callerPfp}
              size={68}
              showStatus={false}
            />
            <Text style={styles.callTitle}>
              {incomingCall?.callerName || "Incoming Call"}
            </Text>
            <Text style={styles.callHint}>
              Join the mobile voice room now, or decline the call.
            </Text>

            <View style={styles.callActions}>
              <Pressable
                style={[
                  styles.callActionSecondary,
                  decliningCall && styles.callActionDisabled,
                ]}
                onPress={declineIncomingCall}
                disabled={decliningCall}
              >
                <Text style={styles.callActionSecondaryText}>
                  {decliningCall ? "Declining..." : "Decline"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.callActionPrimary,
                  answeringCall && styles.callActionDisabled,
                ]}
                onPress={acceptIncomingCall}
                disabled={answeringCall}
              >
                <Text style={styles.callActionPrimaryText}>
                  {answeringCall ? "Joining..." : "Join"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  callOverlay: {
    flex: 1,
    backgroundColor: "rgba(7, 13, 25, 0.76)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  callCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.sidebar,
    borderWidth: 1,
    borderColor: colors.border,
  },
  callEyebrow: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
  },
  callTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  callHint: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  callActions: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  callActionPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.brand,
    paddingVertical: 14,
  },
  callActionPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  callActionSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
  },
  callActionSecondaryText: {
    color: colors.text,
    fontWeight: "700",
  },
  callActionDisabled: {
    opacity: 0.55,
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
