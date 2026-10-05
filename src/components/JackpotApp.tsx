"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CardFan, WhotCard, SuitMark, SUIT_LABELS } from "@/components/WhotCard";
import { MiniMusicPlayer } from "@/components/MiniMusicPlayer";
import { HowToPlayInteractive } from "@/components/HowToPlayInteractive";
import landingBackground from "@/assets/images/home-bg.jpg";
import mobileLandingBackground from "@/assets/images/mobile-bg.jpg";
import { type PlayerSlot, type Suit, type Team } from "@/lib/deck";
import { DEFAULT_PREFERENCES, isSfxMuted, readPreferences, writePreferences, type GamePreferences } from "@/lib/preferences";
import { playGameSound, type GameSound } from "@/lib/sound";
import {
  type GameSnapshot,
  type RoundResult,
  type ScoreBoard,
  applyRoundScore,
  chooseAiPassCard,
  emptyScores,
  findFourOfAKind,
  getPartner,
  passCard,
  resolveJackpot,
  resolveSuspect,
  rotatePlayersForViewer,
  SIGNAL_DECISION_WINDOW_MS,
  SUSPECT_ATTEMPTS_PER_TEAM,
} from "@/lib/game";
import {
  createPlayerId,
  createRoomSession,
  findRoom,
  leaveRoomSession,
  MAX_PLAYER_NAME_LENGTH,
  normalizePlayerName,
  saveRoom,
  type LocalChatMessage,
  type LocalRoom,
  type LocalSession,
  readSession,
  updateRoomForPlayer,
  writeSession,
} from "@/lib/session";

import { GAME_SIGNALS, getSignalMeta, type SignalCategory } from "@/lib/signals";

export type Screen = "home" | "create" | "join" | "lobby" | "teams" | "signal" | "table" | "result" | "howto";

const signalLibrary = GAME_SIGNALS;

export const JACKPOT_LETTERS = ["J", "A", "C", "K", "P", "O", "T"] as const;
export const WINNING_SCORE = JACKPOT_LETTERS.length;

const quickReactions = [
  { id: "laugh", symbol: "😂", label: "Laugh" },
  { id: "cry", symbol: "😭", label: "Cry" },
  { id: "eyes", symbol: "👀", label: "I saw that!" },
  { id: "fire", symbol: "🔥", label: "Fire" },
  { id: "shock", symbol: "😱", label: "Shock" },
  { id: "clap", symbol: "👏", label: "Clap" },
] as const;

type TableToastKind = "info" | "success" | "warning" | "error" | "game";
type TableToast = { id: string; kind: TableToastKind; title: string; message: string };
type PassFlight = { id: string; fromX: number; fromY: number; dx: number; dy: number; midX: number; midY: number };
type ReactionEvent = NonNullable<GameSnapshot["publicReactions"]>[number];

const SEAT_CLASS_BY_COUNT: Record<number, readonly string[]> = {
  4: ["seat-you", "seat-w", "seat-n", "seat-e"],
  6: ["seat-you", "seat-sw", "seat-nw", "seat-n", "seat-ne", "seat-se"],
  8: [
  "seat-you",
  "seat-sw",
  "seat-w",
  "seat-nw",
  "seat-n",
  "seat-ne",
  "seat-e",
  "seat-se",
  ],
};

const VIEWER_ID = "player-0";

export function JackpotApp() {
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const privateRoom = true;
  const [room, setRoom] = useState<LocalRoom | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [profileDraft, setProfileDraft] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [preferences, setPreferences] = useState<GamePreferences>(DEFAULT_PREFERENCES);
  const [maxPlayersChoice, setMaxPlayersChoice] = useState<4 | 6 | 8>(4);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [joining, setJoining] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [selectedSignal, setSelectedSignal] = useState(signalLibrary[1].id);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [scores, setScores] = useState<ScoreBoard>(() => emptyScores());
  const [round, setRound] = useState(1);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [localSuspectAttempts, setLocalSuspectAttempts] = useState<Record<Team, number>>({ Alpha: SUSPECT_ATTEMPTS_PER_TEAM, Bravo: SUSPECT_ATTEMPTS_PER_TEAM, Charlie: SUSPECT_ATTEMPTS_PER_TEAM, Delta: SUSPECT_ATTEMPTS_PER_TEAM });
  const [status, setStatus] = useState("");
  const [teamDraft, setTeamDraft] = useState<Record<string, "Alpha" | "Bravo">>({});
  const [teamSeconds, setTeamSeconds] = useState(20);
  const [strategySeconds, setStrategySeconds] = useState(60);
  const [teamChat, setTeamChat] = useState<LocalRoom["chat"]>([]);
  const [teamChatDraft, setTeamChatDraft] = useState("");
  const [teamSignalAgreements, setTeamSignalAgreements] = useState<Record<string, boolean>>({});
  const [teamSignalLocked, setTeamSignalLocked] = useState(false);
  const [otherTeamLocked, setOtherTeamLocked] = useState(false);
  const [allTeamsLocked, setAllTeamsLocked] = useState(false);
  const [teamMates, setTeamMates] = useState<Array<{ id: string; nickname: string }>>([]);
  const [teamActionBusy, setTeamActionBusy] = useState(false);
  const autoJoinAttempted = useRef<string | null>(null);

  const [signalFlash, setSignalFlash] = useState(false);
  const [signalClock, setSignalClock] = useState(0);
  const [signalMenuOpen, setSignalMenuOpen] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [tableToasts, setTableToasts] = useState<TableToast[]>([]);
  const [passFlight, setPassFlight] = useState<PassFlight | null>(null);
  const [reactionBursts, setReactionBursts] = useState<ReactionEvent[]>([]);
  const [signalBursts, setSignalBursts] = useState<
    Array<{
      id: string;
      playerId: string;
      playerName: string;
      signalId: string;
      symbol: string;
      label: string;
      actionText: string;
    }>
  >([]);
  const [busy, setBusy] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const lastPassEventId = useRef("");
  const seenPassIds = useRef<Set<string>>(new Set());
  const hasInitializedPassTracking = useRef<boolean>(false);
  const lastReactionEventId = useRef("");
  const sharedRoomRevision = useRef(0);
  const roomRecoveryAttempted = useRef("");
  const lastSignalEventId = useRef("");
  const lastGameNoticeId = useRef("");
  const toastTimers = useRef(new Map<string, number>());
  const chatFeedRef = useRef<HTMLDivElement>(null);
  const teamChatRef = useRef<HTMLDivElement>(null);
  const [signalCategoryFilter, setSignalCategoryFilter] = useState<SignalCategory | "All">("All");
  const [localSignalConfirmed, setLocalSignalConfirmed] = useState(false);
  const [tableLaunchCountdown, setTableLaunchCountdown] = useState<number | null>(null);
  const hasLaunchedTableCountdown = useRef(false);
  const [suspectModalOpen, setSuspectModalOpen] = useState(false);
  const [suspectRevealing, setSuspectRevealing] = useState(false);
  const [jackpotModalOpen, setJackpotModalOpen] = useState(false);
  const [jackpotCelebrating, setJackpotCelebrating] = useState(false);
  const [roundTransitionOpen, setRoundTransitionOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [matchInterruption, setMatchInterruption] = useState<LocalRoom["matchInterruption"]>(null);
  const [autoReturnCountdown, setAutoReturnCountdown] = useState<number | null>(null);
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(60);
  const [matchWonTeam, setMatchWonTeam] = useState<Team | null>(null);
  const [matchStats, setMatchStats] = useState({
    roundsPlayed: 1,
    jackpotsCalled: 0,
    suspectsCaught: 0,
    falseCalls: 0,
  });

  const formatStrategyClock = (totalSeconds: number) => {
    const m = Math.floor(Math.max(0, totalSeconds) / 60);
    const s = Math.max(0, totalSeconds) % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatMessageTime = (timestamp?: number) => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const playCue = useCallback((sound: GameSound) => {
    if (!isSfxMuted()) playGameSound(sound, preferences.soundVolume || 0.65);
  }, [preferences.soundVolume]);

  const showTableToast = useCallback((kind: TableToastKind, title: string, message: string) => {
    if (kind === "success") playCue("success");
    else if (kind === "warning" || kind === "error") playCue("alert");
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTableToasts((current) => [...current, { id, kind, title, message }].slice(-4));
    const timer = window.setTimeout(() => {
      setTableToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimers.current.delete(id);
    }, kind === "success" || kind === "error" ? 5200 : 3600);
    toastTimers.current.set(id, timer);
  }, [playCue]);

  const animateCardPass = useCallback((event: NonNullable<GameSnapshot["lastPassEvent"]>) => {
    if (!preferences.animationsEnabled) return;
    window.requestAnimationFrame(() => {
      const table = tableRef.current;
      if (!table) return;
      const seats = Array.from(table.querySelectorAll<HTMLElement>(".table-seat"));
      const from = seats.find((seat) => seat.dataset.seatId === event.fromPlayerId);
      const to = seats.find((seat) => seat.dataset.seatId === event.toPlayerId);
      if (!from || !to) return;
      const tableRect = table.getBoundingClientRect();
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const fromX = fromRect.left + fromRect.width / 2 - tableRect.left;
      const fromY = fromRect.top + fromRect.height / 2 - tableRect.top;
      const toX = toRect.left + toRect.width / 2 - tableRect.left;
      const toY = toRect.top + toRect.height / 2 - tableRect.top;
      const dx = toX - fromX;
      const dy = toY - fromY;

      // Arc outward towards table rim so card passes circularly along the table perimeter
      const cx = tableRect.width / 2;
      const cy = tableRect.height / 2;
      const mx = (fromX + toX) / 2;
      const my = (fromY + toY) / 2;
      const vx = mx - cx;
      const vy = my - cy;
      const dist = Math.hypot(vx, vy) || 1;
      const offset = 48; // outward bow distance in pixels
      const arcX = mx + (vx / dist) * offset;
      const arcY = my + (vy / dist) * offset;
      const midX = arcX - fromX;
      const midY = arcY - fromY;

      setPassFlight({ id: `${event.id}-${Date.now()}`, fromX, fromY, dx, dy, midX, midY });
      window.setTimeout(() => setPassFlight(null), 750);
    });
  }, [preferences.animationsEnabled]);

  const notifyCardPass = useCallback((event: NonNullable<GameSnapshot["lastPassEvent"]>) => {
    playCue("pass");
    animateCardPass(event);
  }, [animateCardPass, playCue]);

  const notifySignal = useCallback((signal: NonNullable<GameSnapshot["publicSignals"]>[number]) => {
    playCue("signal");
    const meta = signalLibrary.find((item) => item.id === signal.signalId) ?? {
      id: signal.signalId,
      label: "Signal",
      symbol: "👋",
      category: "Gesture",
      description: "",
      stealthLevel: "Moderate",
      actionText: "threw a signal",
    };

    if (preferences.animationsEnabled) {
      const burst = {
        id: signal.id,
        playerId: signal.playerId,
        playerName: signal.playerName,
        signalId: signal.signalId,
        symbol: meta.symbol,
        label: meta.label,
        actionText: meta.actionText,
      };
      setSignalBursts((current) => [...current.filter((entry) => entry.playerId !== signal.playerId), burst]);
      const timerKey = `signal-${signal.id}`;
      const timer = window.setTimeout(() => {
        setSignalBursts((current) => current.filter((entry) => entry.id !== signal.id));
        toastTimers.current.delete(timerKey);
      }, 4500);
      toastTimers.current.set(timerKey, timer);
    }
    setStatus(`${signal.playerName}: ${meta.symbol} ${meta.label}`);
  }, [playCue, preferences.animationsEnabled]);

  const displayReaction = useCallback((reaction: ReactionEvent) => {
    playCue("reaction");
    if (preferences.animationsEnabled) {
      setReactionBursts((current) => [...current.filter((entry) => entry.playerId !== reaction.playerId), reaction].slice(-8));
      const timerKey = `reaction-${reaction.id}`;
      const timer = window.setTimeout(() => {
        setReactionBursts((current) => current.filter((entry) => entry.id !== reaction.id));
        toastTimers.current.delete(timerKey);
      }, 2400);
      toastTimers.current.set(timerKey, timer);
    }
  }, [playCue, preferences.animationsEnabled]);

  useEffect(() => () => {
    for (const timer of toastTimers.current.values()) window.clearTimeout(timer);
  }, []);

  const isPlayerInRoom = Boolean(
    room && session?.playerId && room.players.some((player) => player.id === session.playerId)
  );

  const screen: Screen = pathname === "/how-to"
    ? "howto"
    : pathname === "/create"
      ? "create"
      : pathname === "/join" || pathname.startsWith("/join/")
        ? "join"
      : pathname.endsWith("/signal")
        ? "signal"
        : pathname.endsWith("/teams")
          ? "teams"
        : pathname.endsWith("/table")
          ? "table"
          : pathname.endsWith("/result")
            ? "result"
            : pathname.startsWith("/room/")
              ? !session?.playerId || (!isPlayerInRoom && !nickname.trim() && !profileDraft.trim())
                ? "join"
                : room?.teamPhase === "assignment" || room?.teamPhase === "confirmation"
                  ? "teams"
                  : "lobby"
              : "home";

  const navigate = useCallback((destination: Screen, destinationRoomCode = roomCode) => {
    const roomPath = destinationRoomCode
      ? `/room/${encodeURIComponent(destinationRoomCode)}`
      : "/room/unknown";
    const paths: Record<Screen, string> = {
      home: "/",
      create: "/create",
      join: destinationRoomCode ? `/join/${encodeURIComponent(destinationRoomCode)}` : "/join",
      lobby: roomPath,
      signal: `${roomPath}/signal`,
      teams: roomPath,
      table: `${roomPath}/table`,
      result: `${roomPath}/result`,
      howto: "/how-to",
    };
    router.push(paths[destination]);
  }, [roomCode, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedSession = readSession();
      const guestName = savedSession?.nickname ?? window.localStorage.getItem("jackpot:guest-name:v1") ?? "";
      setProfileDraft(guestName);
      setNickname(guestName);
      setPreferences(readPreferences());

      // Fetch persistent database profile (tied to httpOnly cookie jackpot_player_id)
      void fetch("/api/profile")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { profile?: { playerId: string; nickname: string } } | null) => {
          if (data?.profile?.nickname) {
            const dbNick = normalizePlayerName(data.profile.nickname);
            setNickname((current) => current || dbNick);
            setProfileDraft((current) => current || dbNick);
            setSession((current) => {
              if (!current) {
                const newSession: LocalSession = {
                  playerId: data.profile!.playerId,
                  nickname: dbNick,
                  roomCode: "",
                  updatedAt: Date.now(),
                };
                writeSession(newSession);
                return newSession;
              }
              return current;
            });
          }
        })
        .catch(() => undefined);

      const routeCode = pathname.startsWith("/room/")
        ? decodeURIComponent(pathname.split("/")[2] ?? "")
        : "";
      const savedRoom = routeCode ? findRoom(routeCode) : null;

      const savedSignal = window.localStorage.getItem("jackpot:signal:v1");
      if (savedSignal && signalLibrary.some((signal) => signal.id === savedSignal)) setSelectedSignal(savedSignal);
      if (savedSession) {
        setSession(savedSession);
        setNickname(normalizePlayerName(savedSession.nickname));
        if (routeCode) {
          setRoomCode(routeCode);
        }
      } else if (routeCode) {
        setRoomCode(routeCode);
      }
      if (savedRoom) {
        setRoom(savedRoom);
        setRoomCode(savedRoom.code);
        setGame(savedRoom.game);
        setScores(savedRoom.scores);
        setRound(savedRoom.round);
        setResult(savedRoom.result);
        const currentPlayer = savedSession ? savedRoom.players.find((player) => player.id === savedSession.playerId) : null;
        if (currentPlayer) setNickname(normalizePlayerName(currentPlayer.nickname));
        // Register rooms created before the shared lobby API was added.
        if (savedSession?.playerId === savedRoom.hostPlayerId && savedRoom.status === "lobby") {
          void fetch("/api/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room: savedRoom }),
          }).catch(() => undefined);
        } else if (savedSession && savedRoom.players.some((player) => player.id === savedSession.playerId)) {
          // Reclaim a legacy seat once after server auth was introduced; fresh seats
          // already carry a room-scoped HttpOnly cookie and this is idempotent.
          void fetch(`/api/rooms/${encodeURIComponent(savedRoom.code)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: savedSession.playerId, nickname: savedSession.nickname }),
          }).catch(() => undefined);
        }
      }
      const joinPathCode = pathname.startsWith("/join/")
        ? decodeURIComponent(pathname.split("/")[2] ?? "")
        : "";
      const searchCode = typeof window !== "undefined"
        ? (new URLSearchParams(window.location.search).get("code") ?? "")
        : "";
      const effectiveCode = routeCode || joinPathCode || searchCode;
      if (effectiveCode) {
        setJoinCode(effectiveCode.toUpperCase());
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!hydrated || session) return;
    try {
      const cleanName = nickname.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
      if (cleanName) window.localStorage.setItem("jackpot:guest-name:v1", cleanName);
      else window.localStorage.removeItem("jackpot:guest-name:v1");
    } catch {
      // Keep name entry usable when browser storage is unavailable.
    }
  }, [hydrated, nickname, session]);

  useEffect(() => {
    if (!hydrated || !roomCode) return;
    const onStorage = () => {
      const latestRoom = findRoom(roomCode);
      if (!latestRoom) return;
      setRoom(latestRoom);
      setGame(latestRoom.game);
      setScores(latestRoom.scores);
      setRound(latestRoom.round);
      setResult(latestRoom.result);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated, roomCode]);

  type SyncedSharedRoom = {
    id: string;
    code: string;
    isPrivate: boolean;
    maxPlayers: 4 | 6 | 8;
    status: LocalRoom["status"];
    hostPlayerId: string;
    players: LocalRoom["players"];
    chat: LocalRoom["chat"];
    teams?: LocalRoom["teams"];
    teamAcceptances?: LocalRoom["teamAcceptances"];
    teamNotice?: string;
    teamPhase?: LocalRoom["teamPhase"];
    confirmationEndsAt?: number;
    strategyEndsAt?: number;
    gameSnapshot?: GameSnapshot | null;
    scores?: ScoreBoard;
    suspectAttemptsRemaining?: LocalRoom["suspectAttemptsRemaining"];
    round?: number;
    result?: RoundResult | null;
    gameAuthoritative?: boolean;
    matchInterruption?: LocalRoom["matchInterruption"];
    updatedAt: number;
  };

  const applySharedRoom = useCallback((shared: SyncedSharedRoom) => {
    if (!shared || shared.updatedAt <= sharedRoomRevision.current) return;
    sharedRoomRevision.current = shared.updatedAt;
    const cached = findRoom(roomCode);
    const isSharedOnlineRoom = Boolean(roomCode || shared.code || pathname.startsWith("/room/") || pathname.startsWith("/join/"));
    const cachedGame = cached?.game && Array.isArray(cached.game.players) && cached.game.players.length === shared.players.length ? cached.game : null;
    const resolvedGame = shared.gameSnapshot !== undefined ? shared.gameSnapshot : (shared.status === "table" ? cachedGame : null);
    const syncedRoom: LocalRoom = {
      id: shared.id,
      code: shared.code,
      isPrivate: shared.isPrivate,
      maxPlayers: shared.maxPlayers,
      status: shared.status,
      hostPlayerId: shared.hostPlayerId,
      players: shared.players,
      chat: shared.chat,
      teams: shared.teams,
      teamAcceptances: shared.teamAcceptances,
      teamNotice: shared.teamNotice,
      teamPhase: shared.teamPhase,
      confirmationEndsAt: shared.confirmationEndsAt,
      strategyEndsAt: shared.strategyEndsAt,
      game: resolvedGame,
      gameAuthoritative: isSharedOnlineRoom ? true : Boolean(shared.gameAuthoritative ?? cached?.gameAuthoritative),
      scores: shared.scores ?? cached?.scores ?? emptyScores(),
      suspectAttemptsRemaining: shared.suspectAttemptsRemaining ?? cached?.suspectAttemptsRemaining,
      round: shared.round ?? cached?.round ?? 1,
      result: shared.result ?? cached?.result ?? null,
      matchInterruption: shared.matchInterruption,
      updatedAt: shared.updatedAt,
    };
    saveRoom(syncedRoom);
    setRoom(syncedRoom);
    if (shared.matchInterruption !== undefined) {
      setMatchInterruption(shared.matchInterruption ?? null);
    }
    if (shared.gameSnapshot !== undefined) {
      const snapshot = shared.gameSnapshot;
      const passEvents = snapshot?.passEvents ?? (snapshot?.lastPassEvent ? [snapshot.lastPassEvent] : []);
      if (!hasInitializedPassTracking.current) {
        hasInitializedPassTracking.current = true;
        for (const e of passEvents) {
          seenPassIds.current.add(e.id);
        }
        if (passEvents.length > 0) {
          lastPassEventId.current = passEvents[passEvents.length - 1].id;
        }
      } else {
        const previousPassIndex = passEvents.findIndex((event) => event.id === lastPassEventId.current);
        const newEvents = previousPassIndex >= 0 ? passEvents.slice(previousPassIndex + 1) : passEvents.slice(-1);
        for (const event of newEvents) {
          if (!seenPassIds.current.has(event.id)) {
            seenPassIds.current.add(event.id);
            lastPassEventId.current = event.id;
            if (Date.now() - event.createdAt < 5000) notifyCardPass(event);
          }
        }
      }
      const signalEvents = snapshot?.publicSignals ?? [];
      const previousSignalIndex = signalEvents.findIndex((event) => event.id === lastSignalEventId.current);
      for (const event of previousSignalIndex >= 0 ? signalEvents.slice(previousSignalIndex + 1) : signalEvents.slice(-1)) {
        lastSignalEventId.current = event.id;
        if (Date.now() - event.createdAt < 5000) notifySignal(event);
      }
      const gameNotices = snapshot?.publicNotices ?? [];
      const previousNoticeIndex = gameNotices.findIndex((event) => event.id === lastGameNoticeId.current);
      for (const event of previousNoticeIndex >= 0 ? gameNotices.slice(previousNoticeIndex + 1) : gameNotices.slice(-1)) {
        lastGameNoticeId.current = event.id;
        if (Date.now() - event.createdAt < 10_000) showTableToast(event.kind, event.title, event.message);
      }
      const reactionEvents = snapshot?.publicReactions ?? [];
      const previousReactionIndex = reactionEvents.findIndex((event) => event.id === lastReactionEventId.current);
      for (const event of previousReactionIndex >= 0 ? reactionEvents.slice(previousReactionIndex + 1) : reactionEvents.slice(-1)) {
        lastReactionEventId.current = event.id;
        if (Date.now() - event.createdAt < 4000) displayReaction(event);
      }
      setGame(snapshot);
    } else if (resolvedGame) {
      setGame(resolvedGame);
    } else if (shared.status === "strategy" || shared.status === "lobby") {
      setGame(null);
    }
    if (shared.scores) {
      setScores(shared.scores);
      const winningTeam = (["Alpha", "Bravo"] as const).find((t) => (shared.scores?.[t] ?? 0) >= WINNING_SCORE);
      setMatchWonTeam(winningTeam ?? null);
    }
    if (shared.round !== undefined) setRound(shared.round);
    if (shared.result !== undefined) {
      setResult(shared.result);
      if (shared.result && shared.result.kind !== "suspect" && cached?.result?.title !== shared.result.title) {
        showTableToast(shared.result.valid ? "success" : "warning", shared.result.title, shared.result.detail);
      }
    }
    if (pathname.startsWith("/room/")) {
      if (shared.status === "lobby" && (pathname.endsWith("/table") || pathname.endsWith("/signal") || pathname.endsWith("/result"))) {
        router.replace(`/room/${encodeURIComponent(roomCode)}`);
      } else if (shared.teamPhase === "strategy" && !pathname.endsWith("/signal")) {
        if (!pathname.endsWith("/table") || !hasLaunchedTableCountdown.current) {
          router.replace(`/room/${encodeURIComponent(roomCode)}/signal`);
        }
      } else if ((shared.teamPhase === "game" || shared.status === "table") && !pathname.endsWith("/table")) {
        if (screen === "signal" && tableLaunchCountdown !== null && tableLaunchCountdown > 0) {
          // Allow the 3... 2... 1... countdown animation to complete smoothly before navigating
        } else {
          router.replace(`/room/${encodeURIComponent(roomCode)}/table`);
        }
      } else if (shared.status === "result" && !pathname.endsWith("/result")) {
        router.replace(`/room/${encodeURIComponent(roomCode)}/result`);
      } else if (shared.teamPhase === "strategy" && pathname.endsWith("/result")) {
        router.replace(`/room/${encodeURIComponent(roomCode)}/signal`);
      }
    }
  }, [roomCode, pathname, router, screen, tableLaunchCountdown, showTableToast, notifyCardPass, notifySignal, displayReaction]);

  // Real-time EventSource connection with instant push + lightweight adaptive polling
  useEffect(() => {
    if (!hydrated || !roomCode || !pathname.startsWith("/room/") || !session?.playerId) return;
    let active = true;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(`/api/rooms/${encodeURIComponent(roomCode)}/events?playerId=${encodeURIComponent(session.playerId)}`);
      eventSource.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.room) {
            applySharedRoom(payload.room);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // EventSource fallback
    }

    const syncLobby = async () => {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}?playerId=${encodeURIComponent(session.playerId)}&since=${sharedRoomRevision.current}`, { cache: "no-store" });
        if (response.status === 404) {
          const cachedRoom = findRoom(roomCode);
          if (cachedRoom?.hostPlayerId === session.playerId && roomRecoveryAttempted.current !== roomCode) {
            roomRecoveryAttempted.current = roomCode;
            await fetch("/api/rooms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ room: cachedRoom }),
            });
          }
          return;
        }
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.unmodified) return;
        if (payload.room) {
          applySharedRoom(payload.room);
        }
      } catch {
        // network blip
      }
    };

    void syncLobby();
    const pollInterval = screen === "table" ? 600 : 1500;
    const timer = window.setInterval(syncLobby, pollInterval);
    return () => {
      active = false;
      if (eventSource) eventSource.close();
      window.clearInterval(timer);
    };
  }, [hydrated, roomCode, screen, pathname, session?.playerId, applySharedRoom]);

  useEffect(() => {
    if (hydrated) writePreferences(preferences);
  }, [hydrated, preferences]);

  useEffect(() => {
    if (!hydrated || !session) return;
    const activeRoomCode = pathname.startsWith("/room/") ? (roomCode || session.roomCode) : "";
    const nextSession = { ...session, nickname, roomCode: activeRoomCode, updatedAt: Date.now() };
    writeSession(nextSession);
    window.localStorage.setItem("jackpot:signal:v1", selectedSignal);
    const currentRoom = nextSession.roomCode ? findRoom(nextSession.roomCode) : null;
    const member = currentRoom?.players.find((player) => player.id === nextSession.playerId);
    if (currentRoom && member && member.nickname !== nickname) {
      updateRoomForPlayer(currentRoom, nextSession.playerId, nickname);
    }
  }, [hydrated, nickname, roomCode, selectedSignal, session, pathname]);

  const selectedSignalMeta = getSignalMeta(selectedSignal);
  const currentTeamDraft = Object.keys(teamDraft).length ? teamDraft : room?.teams ?? {};


  // Lobby roster contains only browser sessions that actually joined this saved room.
  // The solo practice table fills remaining seats with bots only after the match begins.
  const lobbyPlayers = useMemo(
    () => room?.players.map((player) => ({
      id: player.id,
      name: player.nickname,
      isAdmin: player.isAdmin,
      isReady: player.isReady,
    })) ?? [],
    [room],
  );

  const viewerPlayerId = session?.playerId ?? VIEWER_ID;
  const seated = useMemo(() => {
    if (!game) return [];
    return rotatePlayersForViewer(game.players, viewerPlayerId);
  }, [game, viewerPlayerId]);
  const partner = seated.find((player) => player.team === seated[0]?.team && player.id !== seated[0]?.id) ?? null;
  const you = seated[0];
  const viewerTeam = room?.teams?.[session?.playerId ?? ""] ?? "Alpha";
  const partnerPlayer = room?.players.find(
    (p) => room.teams?.[p.id] === viewerTeam && p.id !== session?.playerId
  );
  const partnerName = partnerPlayer?.nickname ?? teamMates.find((m) => m.id !== session?.playerId)?.nickname ?? "Michael";
  const filteredSignals = useMemo(() => {
    if (signalCategoryFilter === "All") return signalLibrary;
    return signalLibrary.filter((s) => s.category === signalCategoryFilter);
  }, [signalCategoryFilter]);
  const scoreTeams: Team[] = room?.gameAuthoritative ? ["Alpha", "Bravo"] : Object.keys(scores) as Team[];
  const activePlayer = game?.players.find((player) => player.id === game.activePlayerId);
  const activePlayerIndex = game?.players.findIndex((player) => player.id === game.activePlayerId) ?? -1;
  const passReceiver = game && activePlayerIndex >= 0 ? game.players[(activePlayerIndex + 1) % game.players.length] : null;
  const isYourPass = game?.activePlayerId === viewerPlayerId;
  const yourFour = you ? findFourOfAKind(you.hand) : null;
  const prevYourFour = useRef<Suit | null>(null);

  useEffect(() => {
    if (yourFour && !prevYourFour.current) {
      playCue("success");
      showTableToast(
        "success",
        "JACKPOT READY!",
        `You have four ${SUIT_LABELS[yourFour]}s! Flash your secret signal to your partner!`,
      );
    }
    prevYourFour.current = yourFour;
  }, [yourFour, playCue, showTableToast]);

  useEffect(() => {
    if (selectedCardId && you && !you.hand.some((c) => c.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [selectedCardId, you]);

  const suspectAttemptsLeft = you
    ? room?.gameAuthoritative
      ? room.suspectAttemptsRemaining?.[you.team as "Alpha" | "Bravo"] ?? SUSPECT_ATTEMPTS_PER_TEAM
      : localSuspectAttempts[you.team] ?? SUSPECT_ATTEMPTS_PER_TEAM
    : SUSPECT_ATTEMPTS_PER_TEAM;
  const latestPublicSignal = game?.publicSignals?.at(-1);
  const latestGameNotice = game?.publicNotices?.at(-1);
  const signalSecondsRemaining = latestPublicSignal?.expiresAt
    ? Math.max(0, Math.ceil((latestPublicSignal.expiresAt - (signalClock || latestPublicSignal.createdAt)) / 1000))
    : 0;
  const signalWindowActive = signalSecondsRemaining > 0 && latestGameNotice?.relatedSignalId !== latestPublicSignal?.id;
  const latestSignalMeta = latestPublicSignal
    ? signalLibrary.find((signal) => signal.id === latestPublicSignal.signalId)
    : undefined;

  useEffect(() => {
    const expiresAt = latestPublicSignal?.expiresAt;
    if (!expiresAt || !signalWindowActive) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setSignalClock(now);
      if (now >= expiresAt) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [latestPublicSignal?.id, latestPublicSignal?.expiresAt, signalWindowActive]);

  useEffect(() => {
    if (screen === "lobby" && chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [room?.chat?.length, screen]);

  useEffect(() => {
    if (screen === "signal" && teamChatRef.current) {
      teamChatRef.current.scrollTop = teamChatRef.current.scrollHeight;
    }
  }, [teamChat.length, screen]);

  const canLaunchTable = Boolean(
    allTeamsLocked ||
    room?.teamPhase === "game" ||
    room?.status === "table" ||
    (strategySeconds === 0 && room?.teamPhase === "strategy")
  );

  useEffect(() => {
    if (screen === "signal" && canLaunchTable && tableLaunchCountdown === null && !hasLaunchedTableCountdown.current) {
      hasLaunchedTableCountdown.current = true;
      setTableLaunchCountdown(3);
    }
  }, [screen, canLaunchTable, tableLaunchCountdown]);

  useEffect(() => {
    if (screen !== "signal") {
      setLocalSignalConfirmed(false);
      setTableLaunchCountdown(null);
      hasLaunchedTableCountdown.current = false;
      setTeamSignalLocked(false);
      setOtherTeamLocked(false);
      setAllTeamsLocked(false);
    }
  }, [screen]);

  useEffect(() => {
    if (screen !== "signal") return;
    if (room?.strategyEndsAt) {
      const updateClock = () => {
        setStrategySeconds(Math.max(0, Math.ceil((room.strategyEndsAt! - Date.now()) / 1000)));
      };
      updateClock();
      const timer = window.setInterval(updateClock, 500);
      return () => window.clearInterval(timer);
    } else {
      const timer = window.setInterval(() => {
        setStrategySeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => window.clearInterval(timer);
    }
  }, [screen, room?.strategyEndsAt]);

  useEffect(() => {
    if (screen === "signal" && strategySeconds === 0 && tableLaunchCountdown === null && !hasLaunchedTableCountdown.current) {
      hasLaunchedTableCountdown.current = true;
      setTableLaunchCountdown(3);
    }
  }, [screen, strategySeconds, tableLaunchCountdown]);

  useEffect(() => {
    if (tableLaunchCountdown === null) return;
    if (tableLaunchCountdown > 0) {
      const timer = window.setTimeout(() => {
        setTableLaunchCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => window.clearTimeout(timer);
    }
    if (tableLaunchCountdown === 0) {
      const timer = window.setTimeout(() => {
        navigate("table");
      }, 800);
      return () => window.clearTimeout(timer);
    }
  }, [tableLaunchCountdown, navigate]);

  const sendLobbyMessage = (overrideText?: string) => {
    const text = (overrideText ?? chatDraft).trim();
    if (!room || !session || !text || text.length > 280) return;
    const now = Date.now();
    const nextRoom = {
      ...room,
      chat: [...room.chat, {
        id: `message-${now}-${Math.random().toString(36).slice(2, 8)}`,
        playerId: session.playerId,
        nickname,
        text,
        createdAt: now,
      }].slice(-100),
    };
    saveRoom(nextRoom);
    setRoom(nextRoom);
    if (!overrideText) setChatDraft("");
    void fetch(`/api/rooms/${encodeURIComponent(room.code)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: session.playerId, text }),
    }).catch(() => setStatus("Message saved locally; shared chat is temporarily offline."));
  };

  const saveProfileName = async () => {
    const cleanName = normalizePlayerName(profileDraft);
    if (!cleanName) return;
    setSettingsStatus("Saving display name…");
    const activePlayerId = session?.playerId || createPlayerId();
    void fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: activePlayerId, nickname: cleanName }),
    }).catch(() => undefined);

    if (!session) {
      const nextSession: LocalSession = {
        playerId: activePlayerId,
        nickname: cleanName,
        roomCode: roomCode || "",
        updatedAt: Date.now(),
      };
      writeSession(nextSession);
      setSession(nextSession);
      setNickname(cleanName);
      setProfileDraft(cleanName);
      setSettingsStatus("Display name saved to profile.");
      return;
    }
    try {
      if (roomCode) {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename", playerId: session.playerId, nickname: cleanName }),
        });
        if (!response.ok && response.status !== 404) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error ?? "Could not update your name in this room.");
        }
      }
      const nextSession = { ...session, nickname: cleanName, updatedAt: Date.now() };
      writeSession(nextSession);
      setSession(nextSession);
      setNickname(cleanName);
      setProfileDraft(cleanName);
      const savedRoom = roomCode ? findRoom(roomCode) : null;
      if (savedRoom?.players.some((player) => player.id === session.playerId)) {
        const updated = updateRoomForPlayer(savedRoom, session.playerId, cleanName);
        setRoom(updated);
      }
      setSettingsStatus("Display name updated.");
    } catch (error) {
      setSettingsStatus(error instanceof Error ? error.message : "Could not save your display name.");
    }
  };

  const leaveRoom = () => {
    if (!room || !session) {
      navigate("home");
      return;
    }
    if (room.status !== "lobby" && !window.confirm("Leave this match? Your current round will end.")) return;
    const currentCode = room.code;
    const currentId = session.playerId;

    // Immediately remove from database on server
    try {
      void fetch(`/api/rooms/${encodeURIComponent(currentCode)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", playerId: currentId }),
        keepalive: true,
      });
    } catch {
      // offline fallback
    }

    const nextSession = leaveRoomSession(currentCode, currentId);
    setSession(nextSession);
    setRoom(null);
    setGame(null);
    setResult(null);
    setRoomCode("");
    navigate("home", "");
  };
  const getInviteLink = (code: string) => {
    if (typeof window === "undefined") return `jackpot.ng/join/${code}`;
    return `${window.location.origin}/join/${code}`;
  };

  const handleCopyLink = async (code: string) => {
    const link = getInviteLink(code);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const input = document.createElement("input");
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopyFeedback(true);
      window.setTimeout(() => setCopyFeedback(false), 2400);
    } catch {
      // fallback
    }
  };

  const handleNativeShare = async (code: string) => {
    const link = getInviteLink(code);
    const shareData = {
      title: "Play Jackpot!",
      text: `Join my Jackpot room ${code}. Tap to play!`,
      url: link,
    };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          void handleCopyLink(code);
        }
      }
    } else {
      void handleCopyLink(code);
    }
  };

  const createRoom = async () => {
    const cleanNick = normalizePlayerName(nickname) || "Host";
    const created = createRoomSession(cleanNick, privateRoom, maxPlayersChoice);
    setSession(created.session);
    setRoom(created.room);
    setRoomCode(created.room.code);
    setNickname(cleanNick);
    setSessionError("");
    setCreatedInviteCode(created.room.code);
    void fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: created.session.playerId, nickname: cleanNick }),
    }).catch(() => undefined);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: created.room }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        setStatus(payload.error ?? "Room sharing could not start. You can still play locally.");
      }
    } catch {
      setStatus("Room saved on this browser, but the shared room service is offline.");
    }
  };

  const joinRoom = async (overrideCode?: string) => {
    const code = (overrideCode ?? joinCode).trim().toUpperCase();
    const cleanNickname = normalizePlayerName(nickname || profileDraft || session?.nickname || "");
    if (!code) {
      setSessionError("Please enter a room code.");
      return;
    }
    if (!cleanNickname) {
      setSessionError("Please enter your nickname.");
      return;
    }
    if (joining) return;
    setJoining(true);
    setSessionError("");
    try {
      const previousSession = readSession();
      const playerId = session?.playerId || previousSession?.playerId || createPlayerId();
      const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, nickname: cleanNickname }),
      });
      const payload = await response.json() as { room?: SyncedSharedRoom; error?: string };
      if (!response.ok || !payload.room) {
        setSessionError(payload.error ?? "This room could not be joined. Check the code and try again.");
        return;
      }
      const shared = payload.room;
      const cached = findRoom(code);
      const joinedRoom: LocalRoom = {
        id: shared.id,
        code: shared.code,
        isPrivate: shared.isPrivate,
        maxPlayers: shared.maxPlayers,
        status: shared.status,
        hostPlayerId: shared.hostPlayerId,
        players: shared.players,
        chat: shared.chat,
        teams: shared.teams,
        teamAcceptances: shared.teamAcceptances,
        teamNotice: shared.teamNotice,
        teamPhase: shared.teamPhase,
        confirmationEndsAt: shared.confirmationEndsAt,
        strategyEndsAt: shared.strategyEndsAt,
        game: cached?.game ?? null,
        scores: cached?.scores ?? emptyScores(),
        round: cached?.round ?? 1,
        result: cached?.result ?? null,
        updatedAt: shared.updatedAt,
      };
      const joinedPlayer = shared.players.find((player) => player.id === playerId);
      if (!joinedPlayer) {
        setSessionError("The room did not confirm your seat. Please try again.");
        return;
      }
      const nextSession: LocalSession = {
        playerId,
        nickname: joinedPlayer.nickname,
        roomCode: shared.code,
        updatedAt: Date.now(),
      };

      // Reset any old room state before applying new room
      setGame(null);
      setScores(emptyScores());
      setRound(1);
      setResult(null);
      setTeamDraft({});
      setTeamChat([]);
      setTeamMates([]);
      setTeamSignalAgreements({});
      setTeamSignalLocked(false);
      setOtherTeamLocked(false);
      setAllTeamsLocked(false);
      setTableLaunchCountdown(null);
      sharedRoomRevision.current = 0;

      saveRoom(joinedRoom);
      writeSession(nextSession);
      setSession(nextSession);
      setRoom(joinedRoom);
      setRoomCode(shared.code);
      setNickname(joinedPlayer.nickname);

      void fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, nickname: joinedPlayer.nickname }),
      }).catch(() => undefined);

      applySharedRoom(shared);
      navigate("lobby", shared.code);
    } catch {
      setSessionError("Could not reach the room. Make sure the host's Jackpot app is running, then retry.");
    } finally {
      setJoining(false);
    }
  };

  // Auto-join room when navigating to /room/[code] or /join/[code] with an existing profile
  useEffect(() => {
    if (!hydrated) return;
    const targetCode = (
      pathname.startsWith("/room/")
        ? decodeURIComponent(pathname.split("/")[2] ?? "")
        : pathname.startsWith("/join/")
          ? decodeURIComponent(pathname.split("/")[2] ?? "")
          : ""
    ).trim().toUpperCase();

    if (!targetCode) return;

    // Reset old room state when route code changes
    if (roomCode && roomCode !== targetCode) {
      setRoomCode(targetCode);
      setRoom(null);
      setGame(null);
      setScores(emptyScores());
      setRound(1);
      setResult(null);
      setTeamDraft({});
      setTeamChat([]);
      setTeamMates([]);
      setTeamSignalAgreements({});
      setTeamSignalLocked(false);
      setOtherTeamLocked(false);
      setAllTeamsLocked(false);
      setTableLaunchCountdown(null);
      sharedRoomRevision.current = 0;
    }

    // Check if player is already seated in this room
    const isSeated = Boolean(
      room &&
      room.code === targetCode &&
      session?.playerId &&
      room.players.some((p) => p.id === session.playerId)
    );

    if (isSeated) {
      autoJoinAttempted.current = targetCode;
      return;
    }

    if (autoJoinAttempted.current === targetCode || joining) return;

    const effectiveNickname = (nickname || profileDraft || session?.nickname || "").trim();
    if (!effectiveNickname) return;

    autoJoinAttempted.current = targetCode;
    void joinRoom(targetCode);
  }, [hydrated, pathname, roomCode, room, session?.playerId, nickname, profileDraft, session?.nickname, joining]);

  useEffect(() => {
    if (!room?.confirmationEndsAt || room.teamPhase !== "confirmation") return;
    const update = () => setTeamSeconds(Math.max(0, Math.ceil((room.confirmationEndsAt! - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [room?.confirmationEndsAt, room?.teamPhase]);

  const privateRoomCode = room?.code;
  const activePlayerId = session?.playerId;
  useEffect(() => {
    if (screen !== "signal" || !privateRoomCode || !activePlayerId) return;
    let active = true;
    const refreshPrivateRoom = async () => {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(privateRoomCode)}/private?playerId=${encodeURIComponent(activePlayerId)}`, { cache: "no-store" });
        const payload = await response.json() as {
          privateRoom?: {
            signal?: string;
            selectedBy?: string;
            agreements?: Record<string, boolean>;
            locked?: boolean;
            otherTeamLocked?: boolean;
            allTeamsLocked?: boolean;
            teammates?: Array<{ id: string; nickname: string }>;
            chat?: LocalRoom["chat"];
            endsAt?: number;
            phase?: LocalRoom["teamPhase"];
            status?: LocalRoom["status"];
          };
        };
        if (!active || !payload.privateRoom) return;
        if (payload.privateRoom.signal && signalLibrary.some((signal) => signal.id === payload.privateRoom?.signal)) setSelectedSignal(payload.privateRoom.signal);
        setTeamSignalAgreements(payload.privateRoom.agreements ?? {});
        setTeamSignalLocked(Boolean(payload.privateRoom.locked));
        setOtherTeamLocked(Boolean(payload.privateRoom.otherTeamLocked));
        setAllTeamsLocked(Boolean(payload.privateRoom.allTeamsLocked));
        setTeamMates(payload.privateRoom.teammates ?? []);
        if (payload.privateRoom.chat) {
          setTeamChat((prev) => {
            const incoming = payload.privateRoom?.chat ?? [];
            if (incoming.length > prev.length) {
              const latest = incoming[incoming.length - 1];
              if (latest && latest.playerId !== activePlayerId) {
                playCue("reaction");
              }
              return incoming;
            }
            return incoming.length >= prev.length ? incoming : prev;
          });
        }
        if (payload.privateRoom.endsAt) setStrategySeconds(Math.max(0, Math.ceil((payload.privateRoom.endsAt - Date.now()) / 1000)));
      } catch { /* reconnect on the next poll */ }
    };
    void refreshPrivateRoom();
    const timer = window.setInterval(refreshPrivateRoom, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, privateRoomCode, activePlayerId, playCue]);

  const updateTeamPrivate = async (payload: { signal?: string; agree?: boolean; text?: string }) => {
    if (!room || !session) return;
    const response = await fetch(`/api/rooms/${encodeURIComponent(room.code)}/private`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: session.playerId, ...payload }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setStatus(result.error ?? "That team update could not be sent.");
  };

  const sendPrivateChatMessage = (overrideText?: string) => {
    const text = (overrideText ?? teamChatDraft).trim();
    if (!room || !session || !text || strategySeconds === 0) return;
    const now = Date.now();
    const optimisticMsg: LocalChatMessage = {
      id: `team-msg-${now}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: session.playerId,
      nickname,
      text,
      createdAt: now,
    };
    setTeamChat((prev) => [...prev, optimisticMsg]);
    void updateTeamPrivate({ text });
    if (!overrideText) setTeamChatDraft("");
  };

  const confirmSecretSignal = () => {
    setLocalSignalConfirmed(true);
    void updateTeamPrivate({ signal: selectedSignal, agree: true });
  };

  const teamAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!room || !session || teamActionBusy) return;
    setTeamActionBusy(true);
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(room.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: session.playerId, action, ...extra }),
      });
      const payload = await response.json() as { error?: string; room?: SyncedSharedRoom };
      if (!response.ok) {
        setStatus(payload.error ?? "That team action could not be completed.");
      } else {
        if (payload.room) {
          applySharedRoom(payload.room);
        }
        if (action === "assign-teams" && (payload.room?.teamPhase === "assignment" || room.teamPhase === "assignment")) {
          navigate("teams", room.code);
        } else if (action === "respond" && extra.accept === false) {
          setStatus("Team assignment rejected. The host can adjust teams.");
        }
      }
    } catch {
      setStatus("Room connection lost. Reconnecting to the lobby…");
    } finally {
      setTeamActionBusy(false);
    }
  };


  const triggerTableAutoReaction = useCallback((targetPlayerIds: string[], reactionId: string) => {
    if (!game) return;
    const newBursts: ReactionEvent[] = targetPlayerIds.map((pid, idx) => {
      const p = game.players.find((item) => item.id === pid);
      return {
        id: `auto-react-${Date.now()}-${idx}`,
        playerId: pid,
        playerName: p?.name ?? "Player",
        reactionId,
        createdAt: Date.now() + idx * 100,
      };
    });
    setReactionBursts((prev) => [...prev, ...newBursts].slice(-25));
    playCue("reaction");
  }, [game, playCue]);

  const finishRound = (outcome: RoundResult) => {
    const nextScores = applyRoundScore(scores, outcome);
    setResult(outcome);
    setScores(nextScores);
    setBusy(false);
    setMatchStats((prev) => ({ ...prev, roundsPlayed: prev.roundsPlayed + 1 }));

    showTableToast(outcome.valid ? "success" : "warning", outcome.title, outcome.detail);

    if (room) {
      const updatedRoom = { ...room, status: "result" as const, game, scores: nextScores, result: outcome };
      saveRoom(updatedRoom);
      setRoom(updatedRoom);
    }

    // Check if either team has spelled all 7 letters of JACKPOT
    const winningTeam = (["Alpha", "Bravo"] as const).find((t) => nextScores[t] >= WINNING_SCORE);
    if (winningTeam) {
      setMatchWonTeam(winningTeam);
      playCue("jackpot");
    } else {
      setRoundTransitionOpen(true);
    }
  };

  const tryPass = (fromId: string, cardId: string) => {
    if (!game || busy) return;
    try {
      const next = passCard(game, fromId, cardId);
      setGame(next);
      if (next.lastPassEvent) {
        seenPassIds.current.add(next.lastPassEvent.id);
        lastPassEventId.current = next.lastPassEvent.id;
        notifyCardPass(next.lastPassEvent);
      }
      if (room) {
        const updatedRoom = { ...room, game: next };
        saveRoom(updatedRoom);
        setRoom(updatedRoom);
      }
      setSelectedCardId(null);
      setStatus(next.log[0] ?? "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Pass failed.");
    }
  };

  const requestServerGameAction = async (type: "pass" | "jackpot" | "suspect" | "signal" | "fake-signal" | "reaction" | "restart" | "next-round" | "rematch", cardId?: string, reactionId?: string) => {
    if (!room || !session || busy) return;
    setBusy(true);
    try {
      const sendRequest = () => fetch(`/api/rooms/${encodeURIComponent(room.code)}/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: session.playerId, type, ...(cardId ? { cardId } : {}), ...(reactionId ? { reactionId } : {}) }),
      });

      let response = await sendRequest();
      let payload = await response.json() as { error?: string; notice?: string; suspectAttemptsRemaining?: LocalRoom["suspectAttemptsRemaining"]; room?: SyncedSharedRoom };
      
      // Auto-retry once if a concurrency conflict was encountered
      if (response.status === 409 && payload.error?.toLowerCase().includes("room changed")) {
        await new Promise((r) => setTimeout(r, 60));
        response = await sendRequest();
        payload = await response.json();
      }

      if (!response.ok) {
        const message = payload.error ?? "That action is no longer available.";
        setStatus(message);
        showTableToast("error", "Action failed", message);
      } else {
        setStatus(payload.notice || (type === "pass" ? "Card passed." : type.includes("signal") ? "Signal flashed." : `${type.toUpperCase()} called.`));
        if (payload.room) {
          applySharedRoom(payload.room);
        }
      }
      if (payload.suspectAttemptsRemaining && room) {
        const updatedRoom = { ...room, suspectAttemptsRemaining: payload.suspectAttemptsRemaining };
        saveRoom(updatedRoom);
        setRoom(updatedRoom);
      }
      if (type === "pass") setSelectedCardId(null);
    } catch {
      setStatus("Connection interrupted. Reconnecting to the table…");
      showTableToast("error", "Connection interrupted", "Reconnecting to the table…");
    } finally {
      setBusy(false);
    }
  };

  const onPassSelected = () => {
    if (!game || !selectedCardId || !isYourPass) return;
    if (room?.gameAuthoritative) {
      void requestServerGameAction("pass", selectedCardId);
      return;
    }
    tryPass(viewerPlayerId, selectedCardId);
  };

  const executeJackpot = () => {
    if (!game || busy) return;
    setJackpotModalOpen(false);
    setJackpotCelebrating(true);
    playCue("suspense");

    window.setTimeout(() => {
      if (room?.gameAuthoritative) {
        void requestServerGameAction("jackpot");
        setJackpotCelebrating(false);
      } else {
        const outcome = resolveJackpot(game, viewerPlayerId);
        if (outcome.valid) {
          playCue("jackpot");
          setMatchStats((prev) => ({ ...prev, jackpotsCalled: prev.jackpotsCalled + 1 }));
          if (partner) triggerTableAutoReaction([partner.id], "fire");
          const opponents = game.players.filter((p) => p.team !== you?.team).map((p) => p.id);
          triggerTableAutoReaction(opponents, "shock");
          finishRound(outcome);
        } else {
          playCue("false_call");
          setMatchStats((prev) => ({ ...prev, falseCalls: prev.falseCalls + 1 }));
          const opponents = game.players.filter((p) => p.team !== you?.team).map((p) => p.id);
          triggerTableAutoReaction(opponents, "laugh");
          finishRound(outcome);
        }
        window.setTimeout(() => setJackpotCelebrating(false), 800);
      }
    }, 500);
  };

  const onJackpot = () => {
    if (!game || busy) return;
    setJackpotModalOpen(true);
  };

  const executeSuspect = () => {
    if (!game || busy) return;
    setSuspectModalOpen(false);
    setSuspectRevealing(true);
    playCue("suspense");

    window.setTimeout(() => {
      setSuspectRevealing(false);
      if (room?.gameAuthoritative) {
        void requestServerGameAction("suspect");
      } else {
        const caller = game.players.find((player) => player.id === viewerPlayerId);
        const callerTeam = caller?.team ?? "Alpha";
        const remaining = localSuspectAttempts[callerTeam];
        if (remaining <= 0) {
          setStatus("Your team has used all three SUSPECT calls this round.");
          return;
        }
        const outcome = resolveSuspect(game, viewerPlayerId);
        setLocalSuspectAttempts((current) => ({ ...current, [callerTeam]: remaining - 1 }));

        if (outcome.valid) {
          playCue("caught");
          setMatchStats((prev) => ({ ...prev, suspectsCaught: prev.suspectsCaught + 1 }));
          const allOther = game.players.filter((p) => p.id !== viewerPlayerId).map((p) => p.id);
          triggerTableAutoReaction(allOther, "eyes");
          finishRound(outcome);
        } else {
          playCue("false_call");
          setMatchStats((prev) => ({ ...prev, falseCalls: prev.falseCalls + 1 }));
          const opponents = game.players.filter((p) => p.team !== callerTeam).map((p) => p.id);
          triggerTableAutoReaction(opponents, "laugh");
          setStatus(`FALSE SUSPECT — ${remaining - 1} team calls remain.`);
          showTableToast("warning", "False Call", `No opponent had four of a kind. ${remaining - 1} calls left.`);
        }
      }
    }, 1000);
  };

  const onSuspect = () => {
    if (!game || busy) return;
    const currentTeam = (you?.team ?? "Alpha") as "Alpha" | "Bravo";
    const remaining = room?.suspectAttemptsRemaining?.[currentTeam] ?? localSuspectAttempts[currentTeam] ?? 0;
    if (remaining <= 0) {
      showTableToast("warning", "No calls left", "Your team has used all 3 SUSPECT calls for this round.");
      return;
    }
    setSuspectModalOpen(true);
  };

  const handleNextRound = async () => {
    setRoundTransitionOpen(false);
    setResult(null);
    if (room?.gameAuthoritative) {
      await requestServerGameAction("next-round");
    } else {
      setRound((r) => r + 1);
      setStrategySeconds(60);
      navigate("signal");
    }
  };

  const handleRematch = async () => {
    setMatchWonTeam(null);
    setRoundTransitionOpen(false);
    setResult(null);
    setScores(emptyScores());
    setRound(1);
    setMatchStats({ roundsPlayed: 1, jackpotsCalled: 0, suspectsCaught: 0, falseCalls: 0 });
    if (room?.gameAuthoritative) {
      await requestServerGameAction("rematch");
    } else {
      setStrategySeconds(60);
      navigate("signal");
    }
  };

  const handleExitHome = useCallback(() => {
    const currentCode = roomCode;
    const currentPid = session?.playerId;
    setGame(null);
    setResult(null);
    setRoom(null);
    setRoomCode("");
    if (session) {
      writeSession({ ...session, roomCode: "" });
    }
    if (currentCode && currentPid) {
      void fetch(`/api/rooms/${encodeURIComponent(currentCode)}?playerId=${encodeURIComponent(currentPid)}&deliberate=true`, {
        method: "DELETE",
      }).catch(() => {});
    }
    router.push("/");
  }, [roomCode, router, session]);

  const handleReturnToLobby = useCallback(async () => {
    const code = roomCode || session?.roomCode;
    const pid = session?.playerId;
    if (!code || !pid) {
      router.replace("/");
      return;
    }
    try {
      await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return-to-lobby", playerId: pid }),
      });
    } catch { /* offline fallback */ }
    setMatchInterruption(null);
    setAutoReturnCountdown(null);
    router.replace(`/room/${encodeURIComponent(code)}`);
  }, [roomCode, router, session]);

  useEffect(() => {
    if (!matchInterruption) {
      setAutoReturnCountdown(null);
      return;
    }

    if (matchInterruption.type === "disconnected") {
      const updateGraceClock = () => {
        if (matchInterruption.deadline) {
          const remaining = Math.max(0, Math.ceil((matchInterruption.deadline - Date.now()) / 1000));
          setReconnectCountdown(remaining);
        }
      };
      updateGraceClock();
      const timer = window.setInterval(updateGraceClock, 500);
      return () => window.clearInterval(timer);
    }

    if (matchInterruption.type === "deliberate_exit" || matchInterruption.type === "aborted") {
      setAutoReturnCountdown((prev) => (prev === null ? 10 : prev));
      const timer = window.setInterval(() => {
        setAutoReturnCountdown((prev) => {
          if (prev === null || prev <= 1) {
            handleReturnToLobby();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => window.clearInterval(timer);
    }
  }, [matchInterruption, handleReturnToLobby]);

  // Play sound effect whenever entering the result screen
  useEffect(() => {
    if (screen !== "result" || !result) return;
    if (result.valid) {
      playCue("jackpot");
    } else {
      playCue("false_call");
    }
  }, [screen, result, playCue]);

  const handleShareResult = async () => {
    const winner = matchWonTeam ?? "Alpha";
    const alphaScore = scores.Alpha || 0;
    const bravoScore = scores.Bravo || 0;
    const text = `♛ Team ${winner} won JACKPOT (${alphaScore}-${bravoScore}) after ${round} rounds on Jackpot.ng! 🔥 Play with friends:`;
    const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://jackpot.ng";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Jackpot Match Result", text, url: shareUrl });
        return;
      } catch { /* fallback to copy */ }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      showTableToast("success", "Result Copied", "Match result copied to clipboard!");
    }
  };

  const onSignal = () => {
    setSignalMenuOpen(false);
    if (room?.gameAuthoritative) {
      playCue("signal");
      void requestServerGameAction("signal");
    } else if (game) {
      const actor = game.players.find((player) => player.id === viewerPlayerId);
      const createdAt = Date.now();
      const event = { id: `signal-${createdAt}`, playerId: viewerPlayerId, playerName: actor?.name ?? nickname, signalId: selectedSignal, createdAt, expiresAt: createdAt + SIGNAL_DECISION_WINDOW_MS };
      const nextGame = { ...game, publicSignals: [...(game.publicSignals ?? []), event].slice(-20), log: [`${event.playerName} flashed a ${signalLibrary.find((signal) => signal.id === selectedSignal)?.label ?? "team"} signal.`, ...game.log].slice(0, 40) };
      setGame(nextGame);
      if (room) setRoom({ ...room, game: nextGame });
      notifySignal(event);
    }
    setStatus(`You flashed your team signal to ${partner?.name ?? "partner"}.`);

    if (!game || !partner || room?.gameAuthoritative) return;

    // Partner AI: if they already hold four-of-a-kind, they call JACKPOT for the team.
    if (findFourOfAKind(partner.hand)) {
      setBusy(true);
      window.setTimeout(() => {
        finishRound(resolveJackpot(game, partner.id));
      }, 700);
    }
  };

  const onFakeSignal = () => {
    if (!game || busy) return;
    setSignalMenuOpen(false);
    if (room?.gameAuthoritative) {
      playCue("signal");
      void requestServerGameAction("fake-signal");
    } else {
      const actual = selectedSignal;
      const choices = signalLibrary.filter((signal) => signal.id !== actual);
      const decoy = choices[Math.floor(Math.random() * choices.length)];
      const actor = game.players.find((player) => player.id === viewerPlayerId);
      const createdAt = Date.now();
      const event = { id: `signal-${createdAt}`, playerId: viewerPlayerId, playerName: actor?.name ?? nickname, signalId: decoy.id, createdAt, expiresAt: createdAt + SIGNAL_DECISION_WINDOW_MS };
      const nextGame = { ...game, publicSignals: [...(game.publicSignals ?? []), event].slice(-20), log: [`${event.playerName} flashed a ${decoy.label} signal.`, ...game.log].slice(0, 40) };
      setGame(nextGame);
      if (room) setRoom({ ...room, game: nextGame });
      notifySignal(event);
      setStatus("Fake signal flashed — bluff them into calling SUSPECT.");
    }
  };

  const sendReaction = (reactionId: string) => {
    setReactionMenuOpen(false);
    if (!game || busy) return;
    if (room?.gameAuthoritative) {
      playCue("reaction");
      void requestServerGameAction("reaction", undefined, reactionId);
      return;
    }
    const actor = game.players.find((player) => player.id === viewerPlayerId);
    const reactionEvent: ReactionEvent = {
      id: `reaction-${Date.now()}`,
      playerId: viewerPlayerId,
      playerName: actor?.name ?? nickname,
      reactionId,
      createdAt: Date.now(),
    };
    const nextGame = { ...game, publicReactions: [...(game.publicReactions ?? []), reactionEvent].slice(-20) };
    setGame(nextGame);
    if (room) setRoom({ ...room, game: nextGame });
    displayReaction(reactionEvent);
  };

  const handleReactionClick = (clickEvent: MouseEvent<HTMLButtonElement>) => {
    const reactionId = clickEvent.currentTarget.dataset.reactionId;
    if (reactionId) sendReaction(reactionId);
  };

  const runAiTurn = useEffectEvent((snapshot: GameSnapshot) => {
    if (snapshot.activePlayerId === viewerPlayerId) return;

    const actor = snapshot.players.find((player) => player.id === snapshot.activePlayerId);
    if (!actor) return;

    setBusy(true);

    const ownFour = findFourOfAKind(actor.hand);
    const mate = getPartner(snapshot.players, actor.id);
    const mateFour = mate ? findFourOfAKind(mate.hand) : null;

    // Partner flashes the agreed secret signal to you when they hold four-of-a-kind!
    if (ownFour && actor.id === partner?.id && Math.random() < 0.7) {
      const createdAt = Date.now();
      const event = {
        id: `signal-${createdAt}`,
        playerId: actor.id,
        playerName: actor.name,
        signalId: selectedSignal,
        createdAt,
        expiresAt: createdAt + SIGNAL_DECISION_WINDOW_MS,
      };
      const nextGame = {
        ...snapshot,
        publicSignals: [...(snapshot.publicSignals ?? []), event].slice(-20),
        log: [`${actor.name} flashed the team signal.`, ...snapshot.log].slice(0, 40),
      };
      setGame(nextGame);
      notifySignal(event);
    }

    if ((ownFour || mateFour) && Math.random() < 0.35) {
      window.setTimeout(() => {
        finishRound(resolveJackpot(snapshot, actor.id));
      }, 650);
      return;
    }

    // Rare SUSPECT from a non-Alpha bot when four-of-a-kind exists elsewhere.
    if (actor.team !== "Alpha" && Math.random() < 0.08) {
      const outcome = resolveSuspect(snapshot, actor.id);
      if (outcome.valid) {
        window.setTimeout(() => finishRound(outcome), 650);
        return;
      }
    }

    window.setTimeout(() => {
      try {
        const choice = chooseAiPassCard(actor.hand);
        const next = passCard(snapshot, actor.id, choice.id);
        setGame(next);
        if (next.lastPassEvent) {
          seenPassIds.current.add(next.lastPassEvent.id);
          lastPassEventId.current = next.lastPassEvent.id;
          notifyCardPass(next.lastPassEvent);
        }
        setStatus(next.log[0] ?? "");
        setBusy(false);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "AI pass failed.");
        setBusy(false);
      }
    }, 550);
  });

  useEffect(() => {
    if (screen !== "table" || !game || busy || room?.gameAuthoritative) return;
    if (game.activePlayerId === viewerPlayerId) return;
    const snapshot = game;
    const timer = window.setTimeout(() => runAiTurn(snapshot), 0);
    return () => window.clearTimeout(timer);
  }, [screen, game, busy, room?.gameAuthoritative, viewerPlayerId]);

  if (!hydrated) {
    return (
      <main className="app-shell">
        <div className="scene-frame session-loading" aria-live="polite">Loading your game session...</div>
      </main>
    );
  }

  const isFullWidthScreen = screen !== "table";

  return (
    <main className={`app-shell ${isFullWidthScreen ? "full-width" : ""} ${screen === "table" ? "table-mode" : ""} ${preferences.animationsEnabled ? "" : "motion-reduced"}`}>
      <div className={`scene-frame ${isFullWidthScreen ? "full-width-frame" : ""} ${screen === "table" ? "table-frame" : ""}`}>
        {screen === "home" && (
          <section className="hero-screen lobby-home jackpot-home" style={{ "--landing-bg-desktop": `url("${landingBackground.src}")`, "--landing-bg-mobile": `url("${mobileLandingBackground.src}")` } as React.CSSProperties}>
            <header className="jackpot-nav">
              <div className="jackpot-wordmark">
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>PLAY · PASS · WIN</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <details className="profile-menu">
                  <summary aria-label={`Open player profile for ${nickname || "Player"}`}>
                    <span className="profile-avatar">{(nickname.trim()[0] || "M").toUpperCase()}</span>
                    <span className="profile-name">{nickname || "Player"}</span>
                    <svg className="profile-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="profile-popover">
                    <span className="mini-tag">GUEST PROFILE</span>
                    <label htmlFor="home-player-name">Display name</label>
                    <input
                      id="home-player-name"
                      value={profileDraft}
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      onChange={(event) => setProfileDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveProfileName();
                      }}
                    />
                    <small>{profileDraft.length}/{MAX_PLAYER_NAME_LENGTH} characters</small>
                    <p>Your guest name is saved on this browser.</p>
                    <button
                      type="button"
                      className="profile-save-button"
                      onClick={() => void saveProfileName()}
                      disabled={!profileDraft.trim()}
                    >
                      Save name
                    </button>
                    {settingsStatus ? <small role="status">{settingsStatus}</small> : null}
                  </div>
                </details>
              </div>
            </header>
            <div className="jackpot-landing-v2">
              <div className="landing-center-flow">
                {/* 3D Title with side crowns */}
                <div className="landing-title-row">
                  <span className="crown-flank crown-left" aria-hidden="true">
                    <svg width="40" height="34" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5m14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                    </svg>
                  </span>
                  <h1 className="landing-game-title">JACKPOT</h1>
                  <span className="crown-flank crown-right" aria-hidden="true">
                    <svg width="40" height="34" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5m14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                    </svg>
                  </span>
                </div>
                <div className="hero-mantra-v2">PLAY • PASS • WIN</div>

                {/* Subtitle */}
                <h2 className="landing-tagline-v2">
                  The game you grew up playing.
                  <span>Now online.</span>
                </h2>

                {/* Rules description parchment pill with clean vector SVG icons */}
                <div className="rules-parchment-pill">
                  <span className="parchment-text">A Nigerian team card game: pass cards, share a secret signal,</span>
                  <div className="parchment-chips">
                    <span className="rule-chip">
                      <span className="chip-svg-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="13" height="17" rx="2" />
                          <path d="M8 2h11a2 2 0 0 1 2 2v13" />
                        </svg>
                      </span>
                      pass cards
                    </span>
                    <span className="rule-chip">
                      <span className="chip-svg-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                      </span>
                      secret signal
                    </span>
                    <span className="rule-chip">
                      <span className="chip-svg-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm1 14h18v2H3v-2z" />
                        </svg>
                      </span>
                      call JACKPOT
                    </span>
                  </div>
                </div>

                {/* Player Profile / Name field */}
                <div className="landing-user-bar single-name">
                  <label className="name-field-card" htmlFor="landing-player-name">
                    <div className="name-field-header">
                      <span className="field-label">YOUR NICKNAME</span>
                      <span className="edit-pill-badge" aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        Tap to edit
                      </span>
                    </div>

                    <div className="name-input-well">
                      <input
                        id="landing-player-name"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                        maxLength={MAX_PLAYER_NAME_LENGTH}
                        placeholder="Enter your nickname..."
                        autoComplete="nickname"
                      />
                      <span className="input-pencil-icon" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </span>
                    </div>

                    <span className="name-field-hint">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      Displayed on cards and table during the match
                    </span>
                  </label>
                </div>

                {/* Wood Plank Game Buttons */}
                <div className="landing-wood-actions">
                  <button
                    type="button"
                    className="wood-btn wood-create"
                    onClick={() => navigate("create")}
                    disabled={!nickname.trim()}
                  >
                    <span className="wood-btn-badge" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="9" r="4" />
                        <path d="M12 13v7" />
                        <path d="M9 17h6" />
                      </svg>
                    </span>
                    <span className="wood-btn-text">CREATE A ROOM</span>
                  </button>
                  <button
                    type="button"
                    className="wood-btn wood-join"
                    onClick={() => navigate("join")}
                    disabled={!nickname.trim()}
                  >
                    <span className="wood-btn-text">JOIN A ROOM</span>
                    <span className="wood-btn-badge" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </span>
                  </button>
                </div>
              </div>

              {/* Floating Quick-Menu Menu on Right */}
              <div className="floating-card-menu">
                <button type="button" className="quick-menu-item" onClick={() => navigate("howto")}>
                  <span className="menu-svg-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </span>
                  Game Info
                </button>
                <button type="button" className="quick-menu-item" onClick={() => navigate("howto")}>
                  <span className="menu-svg-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </span>
                  Tutorials
                </button>
              </div>
            </div>

            <footer className="jackpot-footer">
              <div>
                <span>♟</span> 4–8 Players <i /> <span>◎</span> Online Multiplayer
              </div>
              <button type="button" onClick={() => navigate("howto")}>
                Same cards. Different stories.
              </button>
            </footer>
          </section>
        )}

        {screen === "howto" && (
          <section
            className="hero-screen lobby-home jackpot-home jackpot-subpage howto-subpage"
            style={{
              "--landing-bg-desktop": `url("${landingBackground.src}")`,
              "--landing-bg-mobile": `url("${mobileLandingBackground.src}")`,
            } as React.CSSProperties}
          >
            <header className="jackpot-nav">
              <div
                className="jackpot-wordmark"
                onClick={() => navigate("home")}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>RULES &amp; STRATEGY</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <button
                  type="button"
                  className="ghost-btn jackpot-back-btn"
                  onClick={() => navigate("home")}
                  aria-label="Back to Menu"
                >
                  <span className="back-btn-text">← Back to Menu</span>
                  <span className="back-btn-mobile-text">← Menu</span>
                </button>
              </div>
            </header>

            <div className="jackpot-subpage-content howto-subpage-content">
              <HowToPlayInteractive
                onBack={() => navigate("home")}
                onCreateRoom={() => navigate("create")}
                onJoinRoom={() => navigate("join")}
              />
            </div>
          </section>
        )}

        {screen === "create" && (
          <section
            className="hero-screen lobby-home jackpot-home jackpot-subpage"
            style={{
              "--landing-bg-desktop": `url("${landingBackground.src}")`,
              "--landing-bg-mobile": `url("${mobileLandingBackground.src}")`,
            } as React.CSSProperties}
          >
            <header className="jackpot-nav">
              <div
                className="jackpot-wordmark"
                onClick={() => navigate("home")}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>PLAY · PASS · WIN</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <details className="profile-menu">
                  <summary aria-label={`Open player profile for ${nickname || "Player"}`}>
                    <span className="profile-avatar">{(nickname.trim()[0] || "M").toUpperCase()}</span>
                    <span className="profile-name">{nickname || "Player"}</span>
                    <svg className="profile-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="profile-popover">
                    <span className="mini-tag">GUEST PROFILE</span>
                    <label htmlFor="create-profile-player-name">Display name</label>
                    <input
                      id="create-profile-player-name"
                      value={profileDraft}
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      onChange={(event) => setProfileDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveProfileName();
                      }}
                    />
                    <button type="button" className="ghost-btn" onClick={() => void saveProfileName()}>
                      Update Name
                    </button>
                  </div>
                </details>
              </div>
            </header>

            <div className="jackpot-subpage-content">
              {createdInviteCode ? (
                <div className="room-action-card room-created-card">
                  <div className="card-badge-header">
                    <span className="card-pill-tag">ROOM READY</span>
                    <h2 className="card-title">Room Created!</h2>
                  </div>

                  <div className="room-code-display-box">
                    <span className="room-code-prefix">ROOM</span>
                    <strong className="room-code-val">{createdInviteCode}</strong>
                    <span className="room-code-capacity">
                      {maxPlayersChoice} PLAYERS · PRIVATE ROOM
                    </span>
                  </div>

                  <div className="invite-friends-section">
                    <div className="invite-header-line">
                      <span className="invite-title">Invite your friends</span>
                      <span className="invite-subtitle">Send this direct link to anyone you want in this match</span>
                    </div>

                    <div className="invite-link-preview-bar" title={getInviteLink(createdInviteCode)}>
                      <span className="invite-link-text">{getInviteLink(createdInviteCode)}</span>
                    </div>

                    <div className="invite-buttons-row">
                      <button
                        type="button"
                        className={`game-card-btn copy-btn ${copyFeedback ? "copied" : ""}`}
                        onClick={() => void handleCopyLink(createdInviteCode)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>{copyFeedback ? "✓ Link Copied!" : "Copy Link"}</span>
                      </button>

                      <button
                        type="button"
                        className="game-card-btn share-btn"
                        onClick={() => void handleNativeShare(createdInviteCode)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                        <span>Share</span>
                      </button>
                    </div>
                  </div>

                  <div className="card-action-footer">
                    <button
                      type="button"
                      className="game-primary-btn enter-lobby-btn"
                      onClick={() => navigate("lobby", createdInviteCode)}
                    >
                      ENTER LOBBY →
                    </button>
                    <button
                      type="button"
                      className="game-ghost-btn"
                      onClick={() => setCreatedInviteCode(null)}
                    >
                      Configure New Room
                    </button>
                  </div>
                </div>
              ) : (
                <div className="room-action-card">
                  <div className="card-badge-header">
                    <span className="card-pill-tag">NEW TABLE</span>
                    <h2 className="card-title">Create Room</h2>
                  </div>

                  {/* Player Nickname Well */}
                  <div className="name-field-card config-name-card">
                    <div className="name-field-header">
                      <span className="field-label">YOUR NICKNAME</span>
                      <span className="edit-pill-badge" aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        Host Name
                      </span>
                    </div>

                    <div className="name-input-well">
                      <input
                        id="create-player-nickname"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                        maxLength={MAX_PLAYER_NAME_LENGTH}
                        placeholder="Enter your nickname..."
                        autoComplete="nickname"
                      />
                      <span className="input-pencil-icon" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </span>
                    </div>

                    <span className="name-field-hint">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      This name will be displayed at the game table and in lobby chat.
                    </span>
                  </div>

                  {/* Choose Player Count */}
                  <div className="config-group">
                    <label className="config-group-label">Choose Player Count</label>
                    <div className="player-count-chips">
                      {([4, 6, 8] as const).map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={`player-chip ${maxPlayersChoice === count ? "active" : ""}`}
                          onClick={() => setMaxPlayersChoice(count)}
                        >
                          <span className="chip-count">{count}</span>
                          <span className="chip-unit">Players</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {sessionError ? <p className="form-error" role="alert">{sessionError}</p> : null}

                  <div className="card-action-footer">
                    <button
                      type="button"
                      className="game-primary-btn create-submit-btn"
                      onClick={createRoom}
                      disabled={!nickname.trim()}
                    >
                      CREATE ROOM
                    </button>
                    <button
                      type="button"
                      className="game-ghost-btn"
                      onClick={() => navigate("home")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <footer className="jackpot-footer">
              <div>
                <span>♟</span> 4–8 Players <i /> <span>◎</span> Online Multiplayer
              </div>
              <button type="button" onClick={() => navigate("howto")}>
                Same cards. Different stories.
              </button>
            </footer>
          </section>
        )}

        {screen === "join" && (
          <section
            className="hero-screen lobby-home jackpot-home jackpot-subpage"
            style={{
              "--landing-bg-desktop": `url("${landingBackground.src}")`,
              "--landing-bg-mobile": `url("${mobileLandingBackground.src}")`,
            } as React.CSSProperties}
          >
            <header className="jackpot-nav">
              <div
                className="jackpot-wordmark"
                onClick={() => navigate("home")}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>PLAY · PASS · WIN</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <details className="profile-menu">
                  <summary aria-label={`Open player profile for ${nickname || "Player"}`}>
                    <span className="profile-avatar">{(nickname.trim()[0] || "M").toUpperCase()}</span>
                    <span className="profile-name">{nickname || "Player"}</span>
                    <svg className="profile-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="profile-popover">
                    <span className="mini-tag">GUEST PROFILE</span>
                    <label htmlFor="join-profile-player-name">Display name</label>
                    <input
                      id="join-profile-player-name"
                      value={profileDraft}
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      onChange={(event) => setProfileDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveProfileName();
                      }}
                    />
                    <button type="button" className="ghost-btn" onClick={() => void saveProfileName()}>
                      Update Name
                    </button>
                  </div>
                </details>
              </div>
            </header>

            <div className="jackpot-subpage-content">
              <div className="room-action-card">
                <div className="card-badge-header">
                  <span className="card-pill-tag">QUICK JOIN</span>
                  <h2 className="card-title">Join Match</h2>
                </div>

                  <div className="name-field-card config-name-card">
                    <div className="name-field-header">
                      <span className="field-label">ROOM CODE</span>
                      <span className="edit-pill-badge" aria-hidden="true">
                        {pathname.startsWith("/join/") ? "From Link" : "From Host"}
                      </span>
                    </div>

                    <div className="name-input-well">
                      <input
                        id="join-room-code-input"
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                        maxLength={12}
                        placeholder="e.g. JKP-482"
                        autoCapitalize="characters"
                        autoFocus={!joinCode}
                      />
                      <span className="input-pencil-icon" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      </span>
                    </div>

                    <span className="name-field-hint">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      Enter the room code (e.g. JKP-482) provided by the host.
                    </span>
                  </div>

                {/* Nickname input well */}
                <div className="name-field-card config-name-card">
                  <div className="name-field-header">
                    <span className="field-label">YOUR NICKNAME</span>
                    <span className="edit-pill-badge" aria-hidden="true">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      Player Name
                    </span>
                  </div>

                  <div className="name-input-well">
                    <input
                      id="join-player-nickname"
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      placeholder="Enter your nickname..."
                      autoComplete="nickname"
                      autoFocus={Boolean(joinCode && !nickname)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && joinCode.trim() && nickname.trim() && !joining) {
                          void joinRoom();
                        }
                      }}
                    />
                    <span className="input-pencil-icon" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </span>
                  </div>

                  <span className="name-field-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    Tap → enter name → join. No registration or password required.
                  </span>
                </div>

                {sessionError ? <p className="form-error" role="alert">{sessionError}</p> : null}

                <div className="card-action-footer">
                  <button
                    type="button"
                    className="game-primary-btn join-submit-btn"
                    onClick={() => void joinRoom()}
                    disabled={!joinCode.trim() || !nickname.trim() || joining}
                  >
                    {joining ? "ENTERING ROOM…" : "JOIN MATCH"}
                  </button>
                  <button
                    type="button"
                    className="game-ghost-btn"
                    onClick={() => navigate("create")}
                  >
                    Create a Room Instead
                  </button>
                </div>
              </div>
            </div>

            <footer className="jackpot-footer">
              <div>
                <span>♟</span> 4–8 Players <i /> <span>◎</span> Online Multiplayer
              </div>
              <button type="button" onClick={() => navigate("howto")}>
                Same cards. Different stories.
              </button>
            </footer>
          </section>
        )}

        {screen === "lobby" && (
          <section
            className="hero-screen lobby-home jackpot-home jackpot-subpage jackpot-lobby-screen"
            style={{
              "--landing-bg-desktop": `url("${landingBackground.src}")`,
              "--landing-bg-mobile": `url("${mobileLandingBackground.src}")`,
            } as React.CSSProperties}
          >
            <header className="jackpot-nav">
              <div
                className="jackpot-wordmark"
                onClick={() => navigate("home")}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>PLAY · PASS · WIN</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <details className="profile-menu">
                  <summary aria-label={`Open player profile for ${nickname || "Player"}`}>
                    <span className="profile-avatar">{(nickname.trim()[0] || "M").toUpperCase()}</span>
                    <span className="profile-name">{nickname || "Player"}</span>
                    <svg className="profile-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="profile-popover">
                    <span className="mini-tag">GUEST PROFILE</span>
                    <label htmlFor="lobby-profile-player-name">Display name</label>
                    <input
                      id="lobby-profile-player-name"
                      value={profileDraft}
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      onChange={(event) => setProfileDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveProfileName();
                      }}
                    />
                    <button type="button" className="ghost-btn" onClick={() => void saveProfileName()}>
                      Update Name
                    </button>
                  </div>
                </details>
              </div>
            </header>

            {!room ? (
              <div className="jackpot-subpage-content">
                <div className="room-action-card">
                  <div className="card-badge-header">
                    <span className="card-pill-tag">ROOM UNAVAILABLE</span>
                    <h2 className="card-title">Room Not Found</h2>
                  </div>
                  <p className="room-unavailable-text">
                    This match is no longer available in this browser session. Join with a valid room code or create a new room.
                  </p>
                  <div className="card-action-footer">
                    <button type="button" className="game-primary-btn" onClick={() => navigate("join")}>
                      Join a Room
                    </button>
                    <button type="button" className="game-ghost-btn" onClick={() => navigate("home")}>
                      Return Home
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="lobby-flow-content">
                {/* Top Banner / Plaque */}
                <div className="lobby-top-banner">
                  <div className="lobby-code-badge-group">
                    <span className="lobby-mini-badge">MATCH WAITING ROOM</span>
                    <div className="lobby-room-code-tag">
                      <span className="code-label">ROOM</span>
                      <strong className="code-value">{room.code}</strong>
                    </div>
                  </div>

                  <div className="lobby-status-pill">
                    <span className="lobby-status-dot" />
                    <span className="lobby-status-text">
                      {lobbyPlayers.length} / {room.maxPlayers ?? 4} PLAYERS JOINED ·{" "}
                      {lobbyPlayers.length < (room.maxPlayers ?? 4)
                        ? `Waiting for ${Math.max(0, (room.maxPlayers ?? 4) - lobbyPlayers.length)} more`
                        : "Table is Full · Ready to Assign Teams"}
                    </span>
                  </div>

                  <div className="lobby-invite-actions">
                    <button
                      type="button"
                      className={`lobby-copy-btn ${copyFeedback ? "copied" : ""}`}
                      onClick={() => void handleCopyLink(room.code)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>{copyFeedback ? "✓ Link Copied!" : "Copy Link"}</span>
                    </button>
                    <button
                      type="button"
                      className="lobby-share-btn"
                      onClick={() => void handleNativeShare(room.code)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      <span>Share</span>
                    </button>
                  </div>
                </div>

                {/* Main Split Grid: Left Seats, Right Chat */}
                <div className="lobby-main-grid">
                  {/* Left Column: Seats */}
                  <div className="lobby-seats-panel">
                    <div className="panel-inner-header">
                      <span className="panel-inner-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        Table Seats ({lobbyPlayers.length}/{room.maxPlayers ?? 4})
                      </span>
                    </div>

                    <div className="lobby-seat-cards-grid">
                      {Array.from({ length: room.maxPlayers ?? 4 }).map((_, slotIndex) => {
                        const player = lobbyPlayers[slotIndex];
                        if (player) {
                          const isViewer = player.id === session?.playerId;
                          return (
                            <div key={player.id} className={`lobby-seat-card occupied ${isViewer ? "is-viewer" : ""}`}>
                              <div className="seat-avatar-wrap">
                                <span className="seat-avatar">{player.name.slice(0, 1).toUpperCase()}</span>
                                {player.isAdmin ? <span className="seat-crown-badge" title="Host">👑</span> : null}
                              </div>
                              <div className="seat-info">
                                <strong className="seat-player-name" title={player.name}>
                                  {player.name} {isViewer ? <span className="you-tag">(You)</span> : null}
                                </strong>
                                <span className="seat-role-label">{player.isAdmin ? "Host · Admin" : "Player"}</span>
                              </div>
                              <span className="seat-status-chip ready">✓ READY</span>
                            </div>
                          );
                        }
                        return (
                          <div key={`open-slot-${slotIndex}`} className="lobby-seat-card open">
                            <div className="seat-avatar-wrap open-slot">
                              <span className="open-plus">+</span>
                            </div>
                            <div className="seat-info">
                              <span className="open-seat-title">Open Seat {slotIndex + 1}</span>
                              <span className="open-seat-hint">Waiting for friend...</span>
                            </div>
                            <span className="seat-status-chip waiting">WAITING</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Chat Bubbles */}
                  <div className="lobby-chat-panel">
                    <div className="panel-inner-header">
                      <span className="panel-inner-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        Lobby Chat
                      </span>
                      <span className="chat-subtitle">Room Messages</span>
                    </div>

                    <div className="lobby-chat-feed" ref={chatFeedRef} aria-live="polite">
                      {(room.chat ?? []).length === 0 ? (
                        <div className="chat-empty-state">
                          <p>Welcome to the lobby! Say hi to your fellow players while waiting for the match to begin.</p>
                        </div>
                      ) : (
                        (room.chat ?? []).slice(-50).map((msg) => {
                          if (msg.system) {
                            return (
                              <div key={msg.id} className="chat-bubble-system">
                                <span>{msg.text}</span>
                              </div>
                            );
                          }
                          const isMe = msg.playerId === session?.playerId;
                          return (
                            <div key={msg.id} className={`chat-bubble-row ${isMe ? "outgoing" : "incoming"}`}>
                              {!isMe && (
                                <span className="chat-avatar-disc" aria-hidden="true">
                                  {msg.nickname.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                              <div className="chat-bubble-content">
                                {!isMe && <span className="chat-author-name">{msg.nickname}</span>}
                                <div className={`chat-bubble ${isMe ? "outgoing-bubble" : "incoming-bubble"}`}>
                                  <p>{msg.text}</p>
                                  {msg.createdAt ? (
                                    <span className="chat-bubble-timestamp">{formatMessageTime(msg.createdAt)}</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Quick Lobby Chat Suggestions */}
                    <div className="lobby-quick-chips">
                      {[
                        "👋 Ready to play!",
                        "⚔️ Let's do this!",
                        "👑 Host, start when ready!",
                        "🤝 Good luck everyone!",
                      ].map((phrase) => (
                        <button
                          type="button"
                          key={phrase}
                          className="lobby-quick-chip"
                          onClick={() => sendLobbyMessage(phrase)}
                        >
                          {phrase}
                        </button>
                      ))}
                    </div>

                    <form className="lobby-chat-input-bar" onSubmit={(event) => { event.preventDefault(); sendLobbyMessage(); }}>
                      <div className="name-input-well chat-input-well">
                        <input
                          value={chatDraft}
                          onChange={(event) => setChatDraft(event.target.value)}
                          maxLength={280}
                          placeholder="Type a message to the room..."
                          aria-label="Lobby chat message"
                        />
                        {chatDraft.length > 0 && (
                          <span className="chat-char-counter">{chatDraft.length}/280</span>
                        )}
                      </div>
                      <button
                        className="chat-send-btn"
                        type="submit"
                        disabled={!chatDraft.trim()}
                        aria-label="Send message"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                        <span>Send</span>
                      </button>
                    </form>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="lobby-action-dock">
                  {room.hostPlayerId === session?.playerId ? (
                    <button
                      type="button"
                      className="game-primary-btn lobby-primary-action-btn"
                      disabled={lobbyPlayers.length < 4 || lobbyPlayers.length % 2 !== 0 || teamActionBusy}
                      onClick={() => void teamAction("begin-assignment")}
                    >
                      {teamActionBusy
                        ? "PREPARING TEAMS…"
                        : lobbyPlayers.length < 4
                          ? `WAITING FOR PLAYERS (${lobbyPlayers.length}/4 MIN)`
                          : lobbyPlayers.length % 2 !== 0
                            ? `NEED EVEN PLAYERS (${lobbyPlayers.length} JOINED)`
                            : "ASSIGN TEAMS →"}
                    </button>
                  ) : (
                    <div className="lobby-waiting-host-notice">
                      <span className="pulse-dot" />
                      <span>Waiting for room host to assign teams...</span>
                    </div>
                  )}

                  <div className="lobby-dock-secondary-row">
                    <button
                      type="button"
                      className="game-card-btn copy-btn"
                      onClick={() => void handleCopyLink(room.code)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>{copyFeedback ? "✓ Link Copied!" : "Invite Friends"}</span>
                    </button>
                    <button type="button" className="game-ghost-btn leave-btn" onClick={leaveRoom}>
                      Leave Room
                    </button>
                  </div>
                </div>

                {status ? <p className="form-error lobby-status-msg" role="status">{status}</p> : null}
              </div>
            )}

            <footer className="jackpot-footer">
              <div>
                <span>♟</span> 4–8 Players <i /> <span>◎</span> Online Multiplayer
              </div>
              <button type="button" onClick={() => navigate("howto")}>
                Same cards. Different stories.
              </button>
            </footer>
          </section>
        )}

        {screen === "teams" && room && session && (
          <section
            className="hero-screen lobby-home jackpot-home jackpot-subpage team-modal-screen"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-modal-title"
            style={{
              "--landing-bg-desktop": `url("${landingBackground.src}")`,
              "--landing-bg-mobile": `url("${mobileLandingBackground.src}")`,
            } as React.CSSProperties}
          >
            <header className="jackpot-nav">
              <div
                className="jackpot-wordmark"
                onClick={handleExitHome}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>PLAY · PASS · WIN</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <details className="profile-menu">
                  <summary aria-label={`Open player profile for ${nickname || "Player"}`}>
                    <span className="profile-avatar">{(nickname.trim()[0] || "M").toUpperCase()}</span>
                    <span className="profile-name">{nickname || "Player"}</span>
                    <svg className="profile-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="profile-popover">
                    <span className="mini-tag">GUEST PROFILE</span>
                    <label htmlFor="teams-profile-player-name">Display name</label>
                    <input
                      id="teams-profile-player-name"
                      value={profileDraft}
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      onChange={(event) => setProfileDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveProfileName();
                      }}
                    />
                    <button type="button" className="ghost-btn" onClick={() => void saveProfileName()}>
                      Update Name
                    </button>
                  </div>
                </details>
              </div>
            </header>

            <div className="jackpot-subpage-content">
              <div className="room-action-card team-modal-card">
                <div className="card-badge-header">
                  <span className="card-pill-tag">
                    {room.teamPhase === "confirmation" ? "TEAM CONFIRMATION" : "TEAM ASSIGNMENT"}
                  </span>
                  <h2 id="team-modal-title" className="card-title">
                    {room.teamPhase === "confirmation" ? "Confirm Your Team" : "Choose the Two Teams"}
                  </h2>
                  <span className="team-modal-subtitle">
                    {room.teamPhase === "confirmation"
                      ? `${Object.values(room.teamAcceptances ?? {}).filter(Boolean).length} of ${room.players.length} players accepted`
                      : "Tap a player card to swap them between Team Alpha and Team Bravo"}
                  </span>
                </div>

                {room.teamPhase === "assignment" && (
                  <div className="team-assignment-flow">
                    {room.teamNotice ? (
                      <div className="form-error" role="status">
                        {room.teamNotice}
                      </div>
                    ) : null}

                    <div className="team-split-grid">
                      {(["Alpha", "Bravo"] as const).map((team) => {
                        const teamMembers = room.players.filter((p) => currentTeamDraft[p.id] === team);
                        const isAlpha = team === "Alpha";
                        return (
                          <div key={team} className={`team-plaque ${isAlpha ? "alpha-plaque" : "bravo-plaque"}`}>
                            <div className="team-plaque-header">
                              <span className="team-symbol">{isAlpha ? "🔥" : "🛡️"}</span>
                              <strong>TEAM {team.toUpperCase()}</strong>
                              <span className="team-count-badge">
                                {teamMembers.length} / {Math.ceil(room.players.length / 2)}
                              </span>
                            </div>

                            <div className="team-players-list">
                              {teamMembers.map((player) => (
                                <button
                                  type="button"
                                  key={player.id}
                                  className="team-player-card"
                                  disabled={room.hostPlayerId !== session.playerId}
                                  onClick={() =>
                                    setTeamDraft((current) => ({
                                      ...current,
                                      [player.id]: isAlpha ? "Bravo" : "Alpha",
                                    }))
                                  }
                                >
                                  <span className="team-player-avatar">{player.nickname.slice(0, 1).toUpperCase()}</span>
                                  <div className="team-player-meta">
                                    <strong className="player-meta-name">{player.nickname}</strong>
                                    {player.isAdmin ? <small className="player-meta-badge">HOST</small> : null}
                                  </div>
                                  {room.hostPlayerId === session.playerId ? (
                                    <span className="swap-hint-icon" title="Swap team">⇄</span>
                                  ) : null}
                                </button>
                              ))}
                              {teamMembers.length === 0 ? (
                                <div className="empty-team-placeholder">No players assigned yet</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Unassigned players if any */}
                    {room.players.filter((player) => !currentTeamDraft[player.id]).length > 0 ? (
                      <div className="unassigned-players-box">
                        <span className="unassigned-title">Unassigned Players</span>
                        <div className="unassigned-chips">
                          {room.players.filter((player) => !currentTeamDraft[player.id]).map((player) => (
                            <button
                              type="button"
                              key={player.id}
                              className="unassigned-chip"
                              onClick={() =>
                                setTeamDraft((current) => ({
                                  ...current,
                                  [player.id]:
                                    room.players.filter((entry) => current[entry.id] === "Alpha").length <
                                    room.players.length / 2
                                      ? "Alpha"
                                      : "Bravo",
                                }))
                              }
                            >
                              <span>{player.nickname}</span>
                              <small>+ Assign</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {room.hostPlayerId === session.playerId ? (
                      <div className="card-action-footer">
                        <button
                          type="button"
                          className="game-primary-btn"
                          disabled={
                            teamActionBusy ||
                            room.players.some((p) => !currentTeamDraft[p.id]) ||
                            room.players.filter((p) => currentTeamDraft[p.id] === "Alpha").length !==
                              room.players.length / 2
                          }
                          onClick={() => void teamAction("assign-teams", { assignments: currentTeamDraft })}
                        >
                          {teamActionBusy ? "CONFIRMING TEAMS…" : "CONFIRM TEAMS →"}
                        </button>
                        <button
                          type="button"
                          className="game-ghost-btn"
                          disabled={teamActionBusy}
                          onClick={() => void teamAction("assign-teams", { shuffle: true })}
                        >
                          Shuffle Randomly
                        </button>
                      </div>
                    ) : (
                      <div className="lobby-waiting-host-notice">
                        <span className="pulse-dot" />
                        <span>The host is arranging teams. Hang tight...</span>
                      </div>
                    )}
                  </div>
                )}

                {room.teamPhase === "confirmation" && (
                  <div className="team-confirmation-flow">
                    <div className="team-countdown-pill">
                      <span>CONFIRM WITHIN</span>
                      <strong className="countdown-val">{teamSeconds}s</strong>
                    </div>

                    <div className="team-split-grid">
                      {(["Alpha", "Bravo"] as const).map((team) => {
                        const teamMembers = room.players.filter((p) => room.teams?.[p.id] === team);
                        const isAlpha = team === "Alpha";
                        return (
                          <div key={team} className={`team-plaque ${isAlpha ? "alpha-plaque" : "bravo-plaque"}`}>
                            <div className="team-plaque-header">
                              <span className="team-symbol">{isAlpha ? "🔥" : "🛡️"}</span>
                              <strong>TEAM {team.toUpperCase()}</strong>
                            </div>
                            <div className="team-players-list">
                              {teamMembers.map((player) => {
                                const accepted = room.teamAcceptances?.[player.id];
                                return (
                                  <div key={player.id} className="team-confirm-player-row">
                                    <div className="confirm-player-name">
                                      <span className="team-player-avatar">{player.nickname.slice(0, 1).toUpperCase()}</span>
                                      <strong>{player.nickname} {player.id === session.playerId ? "(You)" : ""}</strong>
                                    </div>
                                    <span className={`confirm-status-tag ${accepted ? "accepted" : "waiting"}`}>
                                      {accepted ? "✓ ACCEPTED" : "WAITING"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!room.teamAcceptances?.[session.playerId] ? (
                      <div className="card-action-footer">
                        <button
                          type="button"
                          className="game-primary-btn"
                          onClick={() => void teamAction("respond", { accept: true })}
                        >
                          ACCEPT THIS TEAM →
                        </button>
                        <button
                          type="button"
                          className="game-ghost-btn"
                          onClick={() => void teamAction("respond", { accept: false })}
                        >
                          Reject Teams
                        </button>
                      </div>
                    ) : (
                      <div className="lobby-waiting-host-notice accepted-notice">
                        <span className="pulse-dot green" />
                        <span>You accepted this team! Waiting for all players to confirm...</span>
                      </div>
                    )}
                  </div>
                )}

                {status ? <p className="form-error" role="status">{status}</p> : null}
              </div>
            </div>

            <footer className="jackpot-footer">
              <div>
                <span>♟</span> 4–8 Players <i /> <span>◎</span> Online Multiplayer
              </div>
              <button type="button" onClick={() => navigate("howto")}>
                Same cards. Different stories.
              </button>
            </footer>
          </section>
        )}

        {screen === "signal" && (
          <section
            className="hero-screen lobby-home jackpot-home jackpot-subpage secret-team-screen"
            style={{
              "--landing-bg-desktop": `url("${landingBackground.src}")`,
              "--landing-bg-mobile": `url("${mobileLandingBackground.src}")`,
            } as React.CSSProperties}
          >
            <header className="jackpot-nav">
              <div
                className="jackpot-wordmark"
                onClick={handleExitHome}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>PLAY · PASS · WIN</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <details className="profile-menu">
                  <summary aria-label={`Open player profile for ${nickname || "Player"}`}>
                    <span className="profile-avatar">{(nickname.trim()[0] || "M").toUpperCase()}</span>
                    <span className="profile-name">{nickname || "Player"}</span>
                    <svg className="profile-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="profile-popover">
                    <span className="mini-tag">GUEST PROFILE</span>
                    <label htmlFor="secret-profile-name">Display name</label>
                    <input
                      id="secret-profile-name"
                      value={profileDraft}
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      onChange={(event) => setProfileDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveProfileName();
                      }}
                    />
                    <button type="button" className="ghost-btn" onClick={() => void saveProfileName()}>
                      Update Name
                    </button>
                  </div>
                </details>
              </div>
            </header>

            <div className="jackpot-subpage-content secret-subpage-content">
              <div className="secret-room-container">
                {/* Top Secret Banner / Plaque */}
                <div className="secret-top-banner">
                  <div className="secret-title-lock-group">
                    <div className="secret-tag-row">
                      <span className="secret-lock-pill">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        PRIVATE TEAM ROOM
                      </span>
                      <span className={`secret-team-badge ${viewerTeam === "Alpha" ? "alpha-badge" : "bravo-badge"}`}>
                        TEAM {viewerTeam.toUpperCase()}
                      </span>
                      <span className="secret-round-badge">ROUND {round}</span>
                    </div>
                    <h2 className="secret-partner-headline">
                      {round > 1 ? `Round ${round} Secret Signal Strategy` : `You and ${partnerName} only`}
                    </h2>
                    <span className="secret-confidential-note">
                      {round > 1
                        ? "🛡️ Opponents may know your previous signal! Choose a fresh signal or keep your strategy · Opponents cannot see this room"
                        : "🔒 Encrypted channel · Opponents cannot see this room, read your chat, or view your signal"}
                    </span>
                  </div>

                  <div className="secret-timer-pill" aria-label={`Strategy timer: ${strategySeconds} seconds remaining`}>
                    <span className="timer-clock-icon">⏱</span>
                    <strong className="timer-clock-val">{formatStrategyClock(strategySeconds)}</strong>
                  </div>
                </div>

                {/* Match Race Standings: J-A-C-K-P-O-T Letters Tracked Across Rounds */}
                {(scores.Alpha > 0 || scores.Bravo > 0 || round > 1) && (
                  <div className="secret-score-strip">
                    <div className="secret-strip-header">
                      <div className="secret-strip-title-group">
                        <span className="secret-strip-title">MATCH RACE TO SPELL JACKPOT</span>
                        <span className="secret-strip-subtitle">7 Letters to Win · Standings Persist Across All Rounds</span>
                      </div>
                      <span className="secret-strip-round-pill">ROUND {round}</span>
                    </div>
                    <div className="secret-strip-teams">
                      {(["Alpha", "Bravo"] as const).map((team) => {
                        const count = Math.min(7, Math.max(0, scores[team] ?? 0));
                        const isYourTeam = team === viewerTeam;
                        return (
                          <div key={team} className={`secret-team-track ${team.toLowerCase()}-track ${isYourTeam ? "is-your-team" : ""}`}>
                            <div className="secret-team-meta">
                              <span className="secret-team-disc" />
                              <strong className="secret-team-name">
                                TEAM {team.toUpperCase()}{isYourTeam ? " (YOU)" : ""}
                              </strong>
                              <span className="secret-team-score-fraction">{count}/7</span>
                            </div>
                            <div className="secret-letters-list" aria-label={`Team ${team} has ${count} of 7 letters`}>
                              {JACKPOT_LETTERS.map((letter, idx) => {
                                const earned = idx < count;
                                return (
                                  <span
                                    key={letter}
                                    className={`secret-letter-token ${earned ? "token-earned" : "token-empty"}`}
                                  >
                                    {letter}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2-Column Main Layout: Left = Strategy Chat & Live Preview; Right = Signal Chooser & Confirmation */}
                <div className="secret-main-grid">
                  {/* Left Column: Chat & Preview */}
                  <div className="secret-left-column">
                    {/* Discuss your strategy Card */}
                    <div className="secret-card secret-chat-card">
                      <div className="secret-card-header">
                        <div className="secret-header-title">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span>Discuss your strategy</span>
                        </div>
                        <span className="secret-header-subtitle">Private with {partnerName}</span>
                      </div>

                      {/* Chat Messages Feed */}
                      <div className="secret-chat-feed" ref={teamChatRef} aria-live="polite">
                        {teamChat.length === 0 ? (
                          <div className="secret-chat-empty">
                            <span className="empty-whisper-icon">🤫</span>
                            <p>Private team strategy channel. Coordinate when to flash your signal or how to mislead the opposing team!</p>
                          </div>
                        ) : (
                          teamChat.map((msg) => {
                            const isMe = msg.playerId === session?.playerId;
                            return (
                              <div key={msg.id} className={`chat-bubble-row ${isMe ? "outgoing" : "incoming"}`}>
                                {!isMe && (
                                  <span className="chat-avatar-disc" aria-hidden="true">
                                    {msg.nickname.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                                <div className="chat-bubble-content">
                                  {!isMe && <span className="chat-author-name">{msg.nickname}</span>}
                                  <div className={`chat-bubble ${isMe ? "outgoing-bubble" : "incoming-bubble"}`}>
                                    <p>{msg.text}</p>
                                    {msg.createdAt ? (
                                      <span className="chat-bubble-timestamp">{formatMessageTime(msg.createdAt)}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Quick Strategy Suggestion Chips */}
                      <div className="strategy-quick-chips">
                        {[
                          "Flash right after a pass",
                          "I'll flash on 4 of a kind",
                          "Watch my eyes after cards",
                          "Pass circles / stars to me",
                          "Fake signal if suspected",
                          "Ready to call Jackpot!",
                        ].map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion}
                            className="strategy-chip"
                            onClick={() => sendPrivateChatMessage(suggestion)}
                            disabled={strategySeconds === 0}
                          >
                            + {suggestion}
                          </button>
                        ))}
                      </div>

                      {/* Chat Input */}
                      <form
                        className="secret-chat-input-bar"
                        onSubmit={(event) => {
                          event.preventDefault();
                          sendPrivateChatMessage();
                        }}
                      >
                        <div className="name-input-well chat-input-well">
                          <input
                            value={teamChatDraft}
                            onChange={(event) => setTeamChatDraft(event.target.value)}
                            maxLength={280}
                            placeholder={`Message ${partnerName}...`}
                            aria-label="Private message to partner"
                          />
                          {teamChatDraft.length > 0 && (
                            <span className="chat-char-counter">{teamChatDraft.length}/280</span>
                          )}
                        </div>
                        <button
                          type="submit"
                          className="chat-send-btn"
                          disabled={!teamChatDraft.trim() || strategySeconds === 0}
                          aria-label="Send private message"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                          <span>Send</span>
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right Column: Choose Your Signal */}
                  <div className="secret-right-column">
                    <div className="secret-card signal-chooser-card">
                      <div className="secret-card-header">
                        <div className="secret-header-title">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          <span>Choose your signal</span>
                        </div>
                        <span className="secret-header-subtitle">Select a secret cue to flash at the table</span>
                      </div>

                      {/* Category Filter Chips */}
                      <div className="signal-filter-chips">
                        {(["All", "Gesture", "Facial", "Subtle"] as const).map((cat) => (
                          <button
                            type="button"
                            key={cat}
                            className={`filter-chip ${signalCategoryFilter === cat ? "active" : ""}`}
                            onClick={() => setSignalCategoryFilter(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Signals Grid */}
                      <div className="secret-signals-grid">
                        {filteredSignals.map((signal) => {
                          const isSelected = selectedSignal === signal.id;
                          return (
                            <button
                              type="button"
                              key={signal.id}
                              className={`secret-signal-card ${isSelected ? "selected" : ""}`}
                              onClick={() => {
                                playCue("card_click");
                                setSelectedSignal(signal.id);
                                if (!localSignalConfirmed) {
                                  void updateTeamPrivate({ signal: signal.id });
                                }
                              }}
                              disabled={tableLaunchCountdown !== null}
                            >
                              <div className="signal-card-top">
                                <span className="signal-card-symbol">{signal.symbol}</span>
                                <span className={`stealth-micro-tag ${signal.stealthLevel.toLowerCase()}`}>
                                  {signal.stealthLevel}
                                </span>
                              </div>
                              <strong className="signal-card-name">{signal.label}</strong>
                              <span className="signal-card-sub">{signal.description}</span>
                              {isSelected && <span className="selected-check-badge">✓ Selected</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Independent Confirmation Footer */}
                      <div className="secret-confirmation-dock">
                        {(() => {
                          const isConfirmed = localSignalConfirmed || Boolean(session?.playerId && teamSignalAgreements[session.playerId]);
                          return (
                            <>
                              <div className="confirmation-status-line">
                                {allTeamsLocked ? (
                                  <span className="locked-pill">🔒 ALL TEAMS LOCKED · ENTERING TABLE</span>
                                ) : teamSignalLocked ? (
                                  <span className="waiting-pill locked-wait">
                                    <span className="pulse-dot green" />
                                    🔒 Signal Locked ✓ Waiting for other team...
                                  </span>
                                ) : isConfirmed ? (
                                  <span className="waiting-pill">
                                    <span className="pulse-dot green" />
                                    Signal selected ✓ Waiting for {partnerName}...
                                  </span>
                                ) : (
                                  <span className="prompt-pill">
                                    Selected: <strong>{selectedSignalMeta.label}</strong> · Confirm when ready
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                className={`game-primary-btn confirm-signal-btn ${isConfirmed || teamSignalLocked ? "confirmed" : ""}`}
                                disabled={isConfirmed || teamSignalLocked || tableLaunchCountdown !== null || strategySeconds === 0}
                                onClick={confirmSecretSignal}
                              >
                                {allTeamsLocked
                                  ? "All Teams Ready! ✓"
                                  : teamSignalLocked
                                    ? "Waiting for other team..."
                                    : isConfirmed
                                      ? "Signal selected ✓"
                                      : `CONFIRM SIGNAL: ${selectedSignalMeta.label.toUpperCase()} ✓`}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dramatic 3... 2... 1... TABLE! Countdown Overlay */}
                {tableLaunchCountdown !== null && (
                  <div className="table-launch-overlay" role="dialog" aria-modal="true">
                    <div className="launch-box">
                      <div className="launch-pulse-ring" />
                      <span className="launch-lock-icon">🔒</span>
                      <h2 className="launch-title">ALL TEAMS READY!</h2>
                      <p className="launch-subtitle">All players confirmed! Entering the match...</p>
                      <div className="launch-countdown-circle">
                        <span className="launch-number">
                          {tableLaunchCountdown > 0 ? tableLaunchCountdown : "TABLE!"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="jackpot-footer">
              <div>
                <span>♟</span> 4–8 Players <i /> <span>◎</span> Online Multiplayer
              </div>
              <button type="button" onClick={() => navigate("howto")}>
                Same cards. Different stories.
              </button>
            </footer>
          </section>
        )}

        {screen === "table" && (!game || !you) && (
          <section className="hero-screen lobby-home jackpot-home jackpot-subpage" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
            <div className="launch-box" style={{ background: "rgba(20, 14, 10, 0.95)", border: "1px solid rgba(245, 166, 35, 0.35)", borderRadius: "20px", padding: "40px", textAlign: "center", maxWidth: "420px" }}>
              <div className="launch-pulse-ring" />
              <span className="launch-lock-icon" style={{ fontSize: "2.5rem" }}>🎴</span>
              <h2 className="launch-title" style={{ color: "#f5a623", margin: "16px 0 8px" }}>ENTERING TABLE</h2>
              <p className="launch-subtitle" style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.95rem" }}>Synchronizing match seats and dealing cards...</p>
            </div>
          </section>
        )}

        {screen === "table" && game && you && (
          <section className={`table-screen ${signalFlash ? "signal-flash" : ""} ${signalWindowActive ? "has-signal-pressure" : ""}`}>
            {/* Topbar with JACKPOT Raceboard */}
            <header className="table-topbar">
              <div className="table-topbar-row-header">
                <div className="table-topbar-left">
                  <button
                    type="button"
                    className="ghost-btn table-end-session-btn"
                    onClick={() => setExitConfirmOpen(true)}
                    title="End game session and return to main menu"
                    aria-label="End game session"
                  >
                    <span className="end-session-icon" aria-hidden="true">🚪</span>
                    <span className="end-session-label">End Session</span>
                  </button>
                  <div className="table-user-badge">
                    <span className={`viewer-dot ${you.team.toLowerCase()}`} />
                    <span className="viewer-name-val">{nickname || you.name}</span>
                    <span className={`viewer-team-tag ${you.team.toLowerCase()}`}>{you.team}</span>
                  </div>
                </div>

                <div className="mobile-round-indicator">
                  <span className="mobile-round-tag">ROUND {round}</span>
                </div>

                {/* Topbar Right Tools */}
                <div className="table-topbar-right">
                  <MiniMusicPlayer />
                  <div className="reaction-dropdown-anchor">
                    <button
                      type="button"
                      className={`table-react-toggle ${reactionMenuOpen ? "active" : ""}`}
                      aria-expanded={reactionMenuOpen}
                      onClick={() => setReactionMenuOpen((o) => !o)}
                    >
                      <span>😊</span>
                      <span>React</span>
                    </button>
                    {reactionMenuOpen && (
                      <div className="reaction-picker-bubble" role="group" aria-label="Quick reactions">
                        {quickReactions.map((reaction) => (
                          <button
                            key={reaction.id}
                            type="button"
                            className="quick-react-btn"
                            data-reaction-id={reaction.id}
                            aria-label={reaction.label}
                            title={reaction.label}
                            onClick={handleReactionClick}
                          >
                            <span className="react-emoji">{reaction.symbol}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* JACKPOT Race Board */}
              <div className="table-race-board">
                {/* Team Alpha */}
                <div className={`race-team-col alpha ${you.team === "Alpha" ? "is-your-team" : ""}`}>
                  <div className="race-team-header">
                    <span className="race-team-dot alpha" />
                    <span className="race-team-name">Alpha</span>
                    <span className="race-team-score-num">{scores.Alpha || 0}/7</span>
                  </div>
                  <div className="race-letters-row" aria-label={`Team Alpha score ${scores.Alpha || 0} of 7`}>
                    {JACKPOT_LETTERS.map((letter, idx) => {
                      const isEarned = (scores.Alpha || 0) > idx;
                      return (
                        <span
                          key={`alpha-letter-${letter}-${idx}`}
                          className={`jackpot-letter-pill ${isEarned ? "earned" : "unearned"}`}
                        >
                          {letter}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Round Badge Center (Desktop) */}
                <div className="race-center-pill">
                  <span className="race-round-number">ROUND {round}</span>
                  <span className="race-target-sub">FIRST TO SPELL JACKPOT</span>
                </div>

                {/* Team Bravo */}
                <div className={`race-team-col bravo ${you.team === "Bravo" ? "is-your-team" : ""}`}>
                  <div className="race-team-header">
                    <span className="race-team-dot bravo" />
                    <span className="race-team-name">Bravo</span>
                    <span className="race-team-score-num">{scores.Bravo || 0}/7</span>
                  </div>
                  <div className="race-letters-row" aria-label={`Team Bravo score ${scores.Bravo || 0} of 7`}>
                    {JACKPOT_LETTERS.map((letter, idx) => {
                      const isEarned = (scores.Bravo || 0) > idx;
                      return (
                        <span
                          key={`bravo-letter-${letter}-${idx}`}
                          className={`jackpot-letter-pill ${isEarned ? "earned" : "unearned"}`}
                        >
                          {letter}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </header>

            {/* Table Arena */}
            <div className="table-layout">
              <div ref={tableRef} className="whot-table" data-player-count={seated.length} aria-label="Jackpot table">
                {/* Physical Card Flight Layer */}
                {passFlight ? (
                  <div className="pass-flight-layer" aria-hidden>
                    <div
                      key={passFlight.id}
                      className="pass-flight"
                      style={{
                        left: passFlight.fromX,
                        top: passFlight.fromY,
                        "--pass-dx": `${passFlight.dx}px`,
                        "--pass-dy": `${passFlight.dy}px`,
                        "--pass-mid-x": `${passFlight.midX}px`,
                        "--pass-mid-y": `${passFlight.midY}px`,
                      } as CSSProperties}
                      onAnimationEnd={() => setPassFlight(null)}
                    >
                      <WhotCard faceDown compact />
                    </div>
                  </div>
                ) : null}

                {/* Center Table Void with Turn Info */}
                <div className="table-center-void">
                  <div className="table-crown" aria-hidden>♛</div>
                  <span className="void-mark">JACKPOT TABLE</span>

                  {/* Turn Callout */}
                  <div className={`center-turn-indicator ${isYourPass ? "turn-you" : ""}`}>
                    {isYourPass ? (
                      <span className="turn-text highlight">
                        YOUR TURN ↗ Pass to {passReceiver?.name ?? "next player"}
                      </span>
                    ) : (
                      <span className="turn-text">
                        {activePlayer?.name ?? "Player"} passing → {passReceiver?.name ?? "next player"}
                      </span>
                    )}
                  </div>

                  {/* Private 4-of-a-kind alert for viewer only */}
                  {yourFour ? (
                    <div className="center-jackpot-ready-pill" role="status">
                      <span className="ready-sparkle">⚡</span>
                      <strong>JACKPOT READY!</strong>
                      <span>You have four {yourFour}s. Flash your signal!</span>
                    </div>
                  ) : null}
                </div>

                {/* Seated Players */}
                {seated.map((player, visualIndex) => {
                  const playerSignal = signalBursts.find((entry) => entry.playerId === player.id) ?? null;

                  return (
                    <TableSeat
                      key={player.id}
                      player={player}
                      visualIndex={visualIndex}
                      playerCount={seated.length}
                      isActive={player.id === game.activePlayerId}
                      isYou={player.id === viewerPlayerId}
                      isTeammate={player.id !== viewerPlayerId && player.team === you?.team}
                      peek={false}
                      selectedCardId={selectedCardId}
                      canSelect={!busy}
                      onSelectCard={(id) => {
                        playCue("card_click");
                        setSelectedCardId((prev) => (prev === id ? null : id));
                      }}
                      reaction={reactionBursts.filter((entry) => entry.playerId === player.id).at(-1)}
                      hasFourOfAKind={player.id === viewerPlayerId && Boolean(yourFour)}
                      activeSignal={playerSignal}
                    />
                  );
                })}

                {/* Bottom Action Dock */}
                <div className="table-action-dock">
                  {/* PASS CARD */}
                  <button
                    type="button"
                    className={`dock-action-btn pass ${isYourPass && selectedCardId ? "ready-to-pass" : ""}`}
                    disabled={!isYourPass || !selectedCardId || busy}
                    onClick={onPassSelected}
                  >
                    <div className="dock-btn-icon-wrap">↗</div>
                    <div className="dock-btn-label-group">
                      <strong>PASS CARD</strong>
                      <small>{isYourPass ? (selectedCardId ? "Ready to pass card" : "Pick card from hand") : "Wait for your turn"}</small>
                    </div>
                  </button>

                  {/* JACKPOT */}
                  <button
                    type="button"
                    className="dock-action-btn jackpot"
                    disabled={busy}
                    onClick={onJackpot}
                  >
                    <div className="dock-btn-icon-wrap crown">♛</div>
                    <div className="dock-btn-label-group">
                      <strong>JACKPOT!</strong>
                      <small>Teammate has 4 of a kind</small>
                    </div>
                  </button>

                  {/* SIGNAL */}
                  <div className="signal-dropdown-group">
                    <button
                      type="button"
                      className="dock-action-btn signal"
                      disabled={busy}
                      aria-expanded={signalMenuOpen}
                      onClick={() => setSignalMenuOpen((open) => !open)}
                    >
                      <div className="dock-btn-icon-wrap">{selectedSignalMeta.symbol}</div>
                      <div className="dock-btn-label-group">
                        <strong>SIGNAL ▾</strong>
                        <small>{selectedSignalMeta.label}</small>
                      </div>
                    </button>
                    {signalMenuOpen && (
                      <div className="signal-dock-menu">
                        <button type="button" onClick={onSignal} className="signal-menu-item">
                          <span>{selectedSignalMeta.symbol}</span>
                          <div className="menu-text">
                            <strong>Flash Signal</strong>
                            <small>{selectedSignalMeta.label}</small>
                          </div>
                        </button>
                        <button type="button" onClick={onFakeSignal} className="signal-menu-item decoy">
                          <span>🎭</span>
                          <div className="menu-text">
                            <strong>Fake Signal</strong>
                            <small>Bluff decoy gesture</small>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SUSPECT */}
                  <button
                    type="button"
                    className="dock-action-btn suspect"
                    disabled={busy || suspectAttemptsLeft <= 0}
                    onClick={onSuspect}
                  >
                    <div className="dock-btn-icon-wrap">!</div>
                    <div className="dock-btn-label-group">
                      <strong>SUSPECT ({suspectAttemptsLeft})</strong>
                      <small>Catch opponent 4 of a kind</small>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Suspect Confirmation Modal */}
            {suspectModalOpen && (
              <div
                className="table-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="suspect-modal-title"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSuspectModalOpen(false);
                }}
              >
                <div className="table-modal-card suspect-modal">
                  <div className="modal-badge-row">
                    <span className="modal-micro-tag danger">INTERCEPTION CALL</span>
                    <span className="modal-attempts-counter">{suspectAttemptsLeft} of 3 left</span>
                  </div>

                  <div className="modal-header-icon danger">
                    <span className="header-icon-symbol">🚨</span>
                  </div>

                  <h3 id="suspect-modal-title">CALL SUSPECT ON OPPONENTS?</h3>
                  <p className="modal-lead-text">
                    Do you believe an opponent is holding <strong>four matching cards</strong> right now?
                  </p>

                  <div className="modal-rules-grid">
                    <div className="modal-rule-card success">
                      <div className="rule-card-header">
                        <span className="rule-card-icon">✓</span>
                        <strong>IF CORRECT</strong>
                      </div>
                      <p className="rule-card-desc">
                        <strong>CAUGHT!</strong> Your team earns <strong>+1 letter</strong> towards JACKPOT.
                      </p>
                    </div>

                    <div className="modal-rule-card penalty">
                      <div className="rule-card-header">
                        <span className="rule-card-icon">✗</span>
                        <strong>IF WRONG</strong>
                      </div>
                      <p className="rule-card-desc">
                        <strong>FALSE ALARM!</strong> You lose 1 attempt ({suspectAttemptsLeft} remaining).
                      </p>
                    </div>
                  </div>

                  <div className="modal-actions-row">
                    <button
                      type="button"
                      className="table-modal-btn confirm-suspect-btn"
                      onClick={executeSuspect}
                    >
                      <span className="btn-icon">🚨</span>
                      <span>CALL IT NOW!</span>
                    </button>
                    <button
                      type="button"
                      className="table-modal-btn cancel-btn"
                      onClick={() => setSuspectModalOpen(false)}
                    >
                      Never mind
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Suspect 1-Second Suspense Reveal */}
            {suspectRevealing && (
              <div className="table-suspense-overlay" aria-live="assertive">
                <div className="suspense-card">
                  <div className="suspense-radar-ring" />
                  <span className="suspense-icon">🔍</span>
                  <span className="suspense-eyebrow">RADAR SCAN</span>
                  <h3>VERIFYING OPPONENT HANDS...</h3>
                  <p>Searching table for four of a kind</p>
                </div>
              </div>
            )}

            {/* Jackpot Confirmation Modal */}
            {jackpotModalOpen && (
              <div
                className="table-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="jackpot-modal-title"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setJackpotModalOpen(false);
                }}
              >
                <div className="table-modal-card jackpot-modal">
                  <div className="modal-badge-row">
                    <span className="modal-micro-tag gold">VICTORY DECLARATION</span>
                  </div>

                  <div className="modal-header-icon gold">
                    <span className="header-icon-symbol">♛</span>
                  </div>

                  <h3 id="jackpot-modal-title">CALL JACKPOT FOR YOUR TEAM?</h3>
                  <p className="modal-lead-text">
                    Are you confident your teammate has collected <strong>four of a kind</strong>?
                  </p>

                  <div className="modal-rules-grid single">
                    <div className="modal-rule-card gold">
                      <div className="rule-card-header">
                        <span className="rule-card-icon">♛</span>
                        <strong>ROUND VICTORY STAKES</strong>
                      </div>
                      <p className="rule-card-desc">
                        If your teammate holds all 4 matching cards, your team wins the round and earns <strong>+1 letter</strong> towards winning the match!
                      </p>
                    </div>
                  </div>

                  <div className="modal-actions-row">
                    <button
                      type="button"
                      className="table-modal-btn confirm-jackpot-btn"
                      onClick={executeJackpot}
                    >
                      <span className="btn-icon">♛</span>
                      <span>CALL JACKPOT!</span>
                    </button>
                    <button
                      type="button"
                      className="table-modal-btn cancel-btn"
                      onClick={() => setJackpotModalOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Jackpot Celebration Overlay */}
            {jackpotCelebrating && (
              <div className="jackpot-celebration-overlay" aria-live="assertive">
                <div className="celebration-burst-card">
                  <div className="celebration-crown">♛</div>
                  <h2 className="celebration-title">JACKPOT! 🎉</h2>
                  <p className="celebration-sub">Checking table sets...</p>
                </div>
              </div>
            )}

            {/* In-Table Round Transition Modal */}
            {roundTransitionOpen && result && (
              <div className="table-modal-backdrop" role="dialog" aria-modal="true">
                <div className="table-modal-card round-transition-modal">
                  <span className="modal-round-tag">ROUND {round} RESOLVED</span>
                  <h3 className={`outcome-headline ${result.valid ? "success" : "penalty"}`}>{result.title}</h3>
                  <p className="outcome-detail">{result.detail}</p>

                  {/* Live Letter Race Standings */}
                  <div className="transition-race-display">
                    <div className="transition-race-team alpha">
                      <span className="t-team-name">Team Alpha</span>
                      <div className="t-letters-row">
                        {JACKPOT_LETTERS.map((l, i) => (
                          <span key={`t-alpha-${l}-${i}`} className={`t-letter ${scores.Alpha > i ? "earned" : "unearned"}`}>{l}</span>
                        ))}
                      </div>
                      <span className="t-score">{scores.Alpha}/7</span>
                    </div>

                    <div className="transition-vs">VS</div>

                    <div className="transition-race-team bravo">
                      <span className="t-team-name">Team Bravo</span>
                      <div className="t-letters-row">
                        {JACKPOT_LETTERS.map((l, i) => (
                          <span key={`t-bravo-${l}-${i}`} className={`t-letter ${scores.Bravo > i ? "earned" : "unearned"}`}>{l}</span>
                        ))}
                      </div>
                      <span className="t-score">{scores.Bravo}/7</span>
                    </div>
                  </div>

                  <p className="race-goal-reminder">First team to spell <strong>J · A · C · K · P · O · T</strong> wins the match!</p>

                  <div className="modal-actions-row">
                    <button
                      type="button"
                      className="table-modal-btn next-round-btn"
                      disabled={room?.gameAuthoritative && room.hostPlayerId !== session?.playerId}
                      onClick={handleNextRound}
                    >
                      {room?.gameAuthoritative
                        ? room.hostPlayerId === session?.playerId
                          ? `DEAL ROUND ${round + 1} →`
                          : `WAITING FOR HOST TO DEAL ROUND ${round + 1}...`
                        : `DEAL ROUND ${round + 1} →`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* End Game Session Confirmation Modal */}
            {exitConfirmOpen && (
              <div
                className="table-modal-backdrop exit-session-backdrop"
                role="dialog"
                aria-modal="true"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setExitConfirmOpen(false);
                }}
              >
                <div className="table-modal-card exit-session-card">
                  <div className="exit-session-badge">🚪</div>
                  <span className="modal-category-tag">END GAME SESSION</span>
                  <h3 className="exit-session-title">Leave Match &amp; Go Home?</h3>
                  <p className="exit-session-desc">
                    Leaving now will disconnect your player session from this room. You will return to the main menu without being redirected back into the match.
                  </p>
                  <div className="exit-actions-row">
                    <button
                      type="button"
                      className="table-modal-btn exit-danger-btn"
                      onClick={() => {
                        setExitConfirmOpen(false);
                        handleExitHome();
                      }}
                    >
                      <span>🚪 End Session &amp; Exit</span>
                    </button>
                    <button
                      type="button"
                      className="table-modal-btn cancel-btn"
                      onClick={() => setExitConfirmOpen(false)}
                    >
                      Keep Playing
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Match Interruption / Disconnection Modals */}
            {matchInterruption?.type === "disconnected" && (
              <div className="table-modal-backdrop match-paused-backdrop" role="dialog" aria-modal="true">
                <div className="table-modal-card match-paused-card">
                  <div className="paused-badge">⏳</div>
                  <span className="modal-category-tag">MATCH PAUSED</span>
                  <h3 className="paused-title">Waiting for {matchInterruption.playerName}...</h3>
                  <p className="paused-desc">
                    <strong>{matchInterruption.playerName}</strong> lost connection. The match is paused for 60 seconds to allow them to reconnect.
                  </p>
                  <div className="reconnect-countdown-circle">
                    <span className="reconnect-countdown-num">{reconnectCountdown}s</span>
                  </div>
                  <p className="paused-subtext">The table will unfreeze automatically once they reconnect.</p>
                </div>
              </div>
            )}

            {(matchInterruption?.type === "deliberate_exit" || matchInterruption?.type === "aborted") && (
              <div className="table-modal-backdrop match-interrupted-backdrop" role="dialog" aria-modal="true">
                <div className="table-modal-card match-interrupted-card">
                  <div className="interrupted-badge">⚠️</div>
                  <span className="modal-category-tag">MATCH INTERRUPTED</span>
                  <h3 className="interrupted-title">
                    {matchInterruption.type === "deliberate_exit" ? "Player Left The Match" : "Player Connection Lost"}
                  </h3>
                  <p className="interrupted-desc">
                    {matchInterruption.message}
                  </p>
                  <div className="exit-actions-row">
                    <button
                      type="button"
                      className="table-modal-btn return-lobby-btn"
                      onClick={handleReturnToLobby}
                    >
                      <span>🚪 Return to Lobby</span>
                    </button>
                    <button
                      type="button"
                      className="table-modal-btn cancel-btn"
                      onClick={handleExitHome}
                    >
                      Exit to Home
                    </button>
                  </div>
                  <span className="auto-return-hint">
                    Auto-returning to room lobby in {autoReturnCountdown ?? 10}s...
                  </span>
                </div>
              </div>
            )}

            {/* Match Victory Modal (Full J A C K P O T Spelled) */}
            {matchWonTeam && (
              <div className="table-modal-backdrop match-victory-backdrop" role="dialog" aria-modal="true">
                <div className="confetti-burst" aria-hidden="true">
                  {Array.from({ length: 48 }, (_, index) => (
                    <i
                      key={index}
                      style={{
                        left: `${(index * 23) % 100}%`,
                        animationDelay: `${(index % 12) * 0.06}s`,
                        backgroundColor: ["#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#fef08a"][index % 5],
                      }}
                    />
                  ))}
                </div>
                <div className="table-modal-card match-victory-card">
                  <div className="victory-crown-badge">♛</div>
                  <span className="victory-over-tag">CHAMPIONSHIP VICTORY</span>
                  <h2 className="victory-team-title">TEAM {matchWonTeam.toUpperCase()} WINS!</h2>
                  <p className="victory-spelled-text">Successfully spelled the full word:</p>
                  
                  <div className="full-jackpot-spelled-banner">
                    {JACKPOT_LETTERS.map((char) => (
                      <span key={char} className="victory-letter-box">{char}</span>
                    ))}
                  </div>

                  {/* Match Statistics */}
                  <div className="victory-stats-grid">
                    <div className="v-stat-card">
                      <span className="v-stat-num">{round}</span>
                      <span className="v-stat-lbl">Rounds Played</span>
                    </div>
                    <div className="v-stat-card">
                      <span className="v-stat-num">{matchStats.jackpotsCalled}</span>
                      <span className="v-stat-lbl">Jackpots Scored</span>
                    </div>
                    <div className="v-stat-card">
                      <span className="v-stat-num">{matchStats.suspectsCaught}</span>
                      <span className="v-stat-lbl">Suspects Caught</span>
                    </div>
                    <div className="v-stat-card">
                      <span className="v-stat-num">{matchStats.falseCalls}</span>
                      <span className="v-stat-lbl">False Calls</span>
                    </div>
                  </div>

                  <div className="modal-actions-row split">
                    <button
                      type="button"
                      className="table-modal-btn rematch-btn"
                      onClick={handleRematch}
                    >
                      REMATCH SAME TEAMS ↻
                    </button>
                    <button
                      type="button"
                      className="table-modal-btn share-btn"
                      onClick={handleShareResult}
                    >
                      SHARE RESULT ↗
                    </button>
                    <button
                      type="button"
                      className="table-modal-btn exit-btn"
                      onClick={handleExitHome}
                    >
                      Exit Home
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {screen === "result" && result && (
          <section className="result-screen">
            <header className="jackpot-nav">
              <div
                className="jackpot-wordmark"
                onClick={handleExitHome}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
              >
                <span className="wordmark-crown">♛</span>
                <strong>JACKPOT</strong>
                <small>ROUND {round} RESOLUTION</small>
              </div>
              <div className="jackpot-nav-tools">
                <MiniMusicPlayer />
                <button
                  type="button"
                  className="ghost-btn jackpot-back-btn"
                  onClick={handleExitHome}
                  aria-label="Exit Home"
                >
                  <span className="back-btn-text">← Exit Home</span>
                  <span className="back-btn-mobile-text">← Exit</span>
                </button>
              </div>
            </header>

            <div className="result-container-wrap">
              {result.valid ? (
                <div className="confetti-burst" aria-hidden="true">
                  {Array.from({ length: 48 }, (_, index) => (
                    <i
                      key={index}
                      style={{
                        left: `${(index * 23) % 100}%`,
                        animationDelay: `${(index % 12) * 0.06}s`,
                        backgroundColor: ["#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#fef08a", "#a855f7"][index % 6],
                      }}
                    />
                  ))}
                </div>
              ) : null}

              <div className={`result-card-luxury ${result.valid ? "outcome-win" : "outcome-miss"}`}>
                <div className="result-card-glow-edge" />

                {/* Outcome Header Pill & Hero Icon */}
                <div className="result-header-row">
                  <div className={`result-emblem-badge ${result.valid ? "emblem-gold" : "emblem-ruby"}`}>
                    <span className="result-emblem-icon">{result.valid ? "🏆" : "🚨"}</span>
                  </div>
                  <div className="result-tag-cluster">
                    <span className={`result-status-pill ${result.valid ? "status-win" : "status-miss"}`}>
                      {result.valid ? "✦ JACKPOT SCORED ✦" : "⚠ FALSE CALL / BLUFF BUSTED"}
                    </span>
                    <span className="result-round-pill">ROUND {round} RESOLVED</span>
                  </div>
                </div>

                <div className="result-narrative">
                  <h2 className="result-headline">{result.title}</h2>
                  <p className="result-description">{result.detail}</p>
                </div>

                {/* Match Race Tracker: J-A-C-K-P-O-T Progress for each team */}
                <div className="result-race-board">
                  <div className="result-race-header">
                    <span className="race-header-title">🏁 MATCH RACE STANDINGS</span>
                    <span className="race-header-subtitle">Spell J-A-C-K-P-O-T (7 Letters) to Win</span>
                  </div>
                  <div className="result-race-tracks">
                    {scoreTeams.map((team) => {
                      const count = Math.min(7, Math.max(0, scores[team] ?? 0));
                      const isLeader = count === Math.max(...scoreTeams.map((t) => scores[t] ?? 0));
                      return (
                        <div key={team} className={`result-team-track ${isLeader && count > 0 ? "leader-track" : ""}`}>
                          <div className="team-track-info">
                            <span className="team-track-name">{team}</span>
                            <span className="team-track-score-badge">{count}/7</span>
                          </div>
                          <div className="team-track-letters" aria-label={`${team} has ${count} letters`}>
                            {JACKPOT_LETTERS.map((letter, idx) => {
                              const active = idx < count;
                              return (
                                <span
                                  key={letter}
                                  className={`result-letter-token ${active ? "active-letter" : "empty-letter"}`}
                                  title={`${team} Letter ${letter} ${active ? "Earned" : "Remaining"}`}
                                >
                                  {letter}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action Buttons Panel */}
                <div className="result-action-panel">
                  {room?.gameAuthoritative && room.hostPlayerId !== session?.playerId ? (
                    <div className="result-waiting-host-box">
                      <span className="result-pulse-dot" />
                      <span>Waiting for room host to initiate the next round…</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="result-primary-btn"
                      onClick={() => {
                        const hasWinner = Boolean(matchWonTeam || scores.Alpha >= WINNING_SCORE || scores.Bravo >= WINNING_SCORE);
                        if (hasWinner) {
                          void handleRematch();
                        } else {
                          void handleNextRound();
                        }
                      }}
                    >
                      <span className="btn-sparkle">✦</span>
                      <span>
                        {(matchWonTeam || scores.Alpha >= WINNING_SCORE || scores.Bravo >= WINNING_SCORE)
                          ? "START NEW MATCH"
                          : "START NEXT ROUND"}
                      </span>
                      <span className="btn-arrow">➔</span>
                    </button>
                  )}

                  <div className="result-secondary-row">
                    <button
                      type="button"
                      className="result-secondary-btn"
                      onClick={handleShareResult}
                    >
                      <span>📋 Share Results</span>
                    </button>
                    <button
                      type="button"
                      className="result-exit-btn"
                      onClick={handleExitHome}
                    >
                      <span>🚪 Exit to Main Menu</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
      {tableToasts.length ? <div className="table-toast-region" role="region" aria-label="Game notifications" aria-live="polite">
        {tableToasts.map((toast) => <div key={toast.id} className={`table-toast toast-${toast.kind}`}>
          <span className="toast-kind-icon" aria-hidden>{toast.kind === "success" ? "✓" : toast.kind === "warning" ? "!" : toast.kind === "error" ? "×" : toast.kind === "game" ? "♛" : "•"}</span>
          <span><strong>{toast.title}</strong><small>{toast.message}</small></span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setTableToasts((current) => current.filter((entry) => entry.id !== toast.id))}>×</button>
        </div>)}
      </div> : null}
    </main>
  );
}

function TableSeat({
  player,
  visualIndex,
  playerCount,
  isActive,
  isYou,
  peek,
  selectedCardId,
  canSelect,
  onSelectCard,
  reaction,
  hasFourOfAKind,
  activeSignal,
}: {
  player: PlayerSlot;
  visualIndex: number;
  playerCount: number;
  isActive: boolean;
  isYou: boolean;
  isTeammate: boolean;
  peek: boolean;
  selectedCardId: string | null;
  canSelect: boolean;
  onSelectCard: (id: string) => void;
  reaction?: ReactionEvent;
  hasFourOfAKind?: boolean;
  activeSignal?: { symbol: string; label: string; id: string } | null;
}) {
  const seatClass = SEAT_CLASS_BY_COUNT[playerCount]?.[visualIndex] ?? SEAT_CLASS_BY_COUNT[8][visualIndex];
  const count = player.hand.length;
  const showFaces = isYou || peek;

  return (
    <div
      className={[
        "table-seat",
        seatClass,
        isActive ? "is-active" : "",
        player.isStarter ? "is-starter" : "",
        isYou ? "is-you" : "",
        activeSignal ? "seat-is-signaling" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-seat-id={player.id}
    >
      {/* Active Signal Gesture Bubble directly over the signaling player's avatar */}
      {activeSignal && (
        <div key={activeSignal.id} className="seat-signal-bubble" role="status" aria-label={`${player.name} signaled`}>
          <span className="seat-signal-symbol">{activeSignal.symbol}</span>
          <span className="seat-signal-label">{activeSignal.label}</span>
        </div>
      )}

      {/* Reaction Speech Bubble */}
      {reaction && !activeSignal && (
        <div key={reaction.id} className="reaction-burst-bubble" aria-label={`${reaction.playerName} reacted`}>
          <span className="reaction-burst-symbol">
            {quickReactions.find((item) => item.id === reaction.reactionId)?.symbol ?? "✨"}
          </span>
          {reaction.reactionId === "eyes" && <span className="reaction-saw-that-text">I saw that!</span>}
        </div>
      )}

      {/* Player Plaque (Avatar, Name, Team, Status) - Always above cards */}
      <div className={`player-plaque ${isYou ? "you" : ""} ${isActive ? "active-passer" : ""}`}>
        <div className={`player-avatar-badge ${player.team.toLowerCase()}`}>
          <span>{player.name.slice(0, 1).toUpperCase()}</span>
          <span className={`player-team-indicator ${player.team.toLowerCase()}`} title={`Team ${player.team}`} />
        </div>
        <div className="player-meta-box">
          <div className="player-name-row">
            <span className="player-name" title={player.name}>
              {player.name} {isYou ? "(You)" : ""}
            </span>
            <span className="player-online-dot active" title="Online" />
          </div>
          {isActive ? (
            <span className={`player-passing-tag ${isYou ? "your-turn" : ""}`}>
              {isYou ? "YOUR TURN TO PASS ↗" : "PASSING ↗"}
            </span>
          ) : isYou ? (
            <span className="player-team-label-sub">{player.team} Team</span>
          ) : null}
        </div>
        <span className="hand-count-badge" title={`${count} cards in hand`}>{count}</span>
      </div>

      {/* Hand Cards */}
      {showFaces ? (
        <div className={`player-hand ${isYou ? "you-hand" : "peek-hand"} ${findFourOfAKind(player.hand) ? "has-four-glow" : ""}`} data-hand-count={count}>
          {(isYou
            ? [...player.hand].sort((a, b) => {
                if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
                return (a.number ?? 0) - (b.number ?? 0);
              })
            : player.hand
          ).map((card) => {
            const playerFourSuit = findFourOfAKind(player.hand);
            const isMatch = isYou && Boolean(playerFourSuit) && card.suit === playerFourSuit;
            return (
              <WhotCard
                key={card.id}
                card={card}
                selected={isYou && selectedCardId === card.id}
                className={isMatch ? "is-four-matching" : ""}
                onClick={
                  isYou && canSelect
                    ? () => onSelectCard(card.id)
                    : undefined
                }
                compact={!isYou}
              />
            );
          })}
        </div>
      ) : (
        <div className="opponent-cards-holder">
          <CardFan count={count} compact />
        </div>
      )}
    </div>
  );
}
