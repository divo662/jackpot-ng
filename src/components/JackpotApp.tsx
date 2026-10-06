"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CardFan, WhotCard, SuitMark, SUIT_LABELS } from "@/components/WhotCard";
import { MiniMusicPlayer } from "@/components/MiniMusicPlayer";
import { JackpotNavBar } from "@/components/JackpotNavBar";
import { HowToPlayInteractive } from "@/components/HowToPlayInteractive";
import landingBackground from "@/assets/images/home-bg.jpg";
import mobileLandingBackground from "@/assets/images/mobile-bg.jpg";
import { type JackpotCard, type PlayerSlot, type Suit, type Team } from "@/lib/deck";
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
  chooseSuspectProofCards,
  rotatePlayersForViewer,
  SIGNAL_DECISION_WINDOW_MS,
  SUSPECT_ATTEMPTS_PER_TEAM,
} from "@/lib/game";
import {
  createPlayerId,
  createPracticeRoom,
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
import { LocalMatch } from "@/lib/bot/local-match";
import {
  readAccount,
  saveAccount,
  readGuestStats,
  recordGuestStat,
  isTutorialCompleted,
  setTutorialCompleted,
  resetTutorial,
  isFirstVisit,
  setFirstVisitCompleted,
  migrateGuestToAccount,
  fetchAccountFromDb,
  AVAILABLE_AVATARS,
  AVAILABLE_TITLES,
  type UserAccount,
  type PlayerStats,
} from "@/lib/account";
import {
  TUTORIAL_COACHMARKS,
  type TutorialStep,
} from "@/lib/tutorial";
import { type BotDifficulty } from "@/lib/bot/profiles";
import { type BotArchetypeId, BOT_ARCHETYPES, getArchetype, ALL_ARCHETYPE_IDS } from "@/lib/bot/archetypes";
import { SettingsPageContent } from "@/components/SettingsPageContent";

export type Screen = "home" | "create" | "join" | "lobby" | "teams" | "signal" | "table" | "result" | "howto" | "settings";

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
  { id: "more_play", symbol: "🃏", label: "More play!" },
  { id: "e_don_cast", symbol: "🚨", label: "E don cast!" },
  { id: "na_lie", symbol: "🙅‍♂️", label: "Na lie!" },
] as const;

type TableToastKind = "info" | "success" | "warning" | "error" | "game";
type TableToast = { id: string; kind: TableToastKind; title: string; message: string };
type PassFlight = { id: string; fromX: number; fromY: number; dx: number; dy: number; midX: number; midY: number };
type ReactionEvent = NonNullable<GameSnapshot["publicReactions"]>[number];
type SuspectRevealPreview = { targetName: string; cards: JackpotCard[]; isRefuted: boolean };

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
  const [account, setAccount] = useState<UserAccount | null>(null);
  const isGuest = !account;
  const [firstVisitModalOpen, setFirstVisitModalOpen] = useState(false);
  const [firstVisitName, setFirstVisitName] = useState("");
  const [isTutorialMatch, setIsTutorialMatch] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [sessionSummaryOpen, setSessionSummaryOpen] = useState(false);
  const [statsPreviewVisible, setStatsPreviewVisible] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileSetupOpen, setProfileSetupOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("👑");
  const [selectedTitle, setSelectedTitle] = useState("Rookie Partner");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");

  const handleLoginAccount = async () => {
    const cleanUser = normalizePlayerName(authUsername.trim());
    if (!cleanUser) {
      showTableToast("error", "Username Required", "Please enter your player username.");
      return;
    }
    const dbAcc = await fetchAccountFromDb(cleanUser);
    if (!dbAcc) {
      showTableToast("error", "Account Not Found", `No account found for "${cleanUser}" in Neon DB.`);
      return;
    }
    setAccount(dbAcc);
    saveAccount(dbAcc);
    setNickname(dbAcc.username);
    setProfileDraft(dbAcc.username);
    setSelectedAvatar(dbAcc.avatar);
    setSelectedTitle(dbAcc.title);
    setSelectedPartnerId(dbAcc.preferredPartnerId);
    setAuthModalOpen(false);
    showTableToast("success", "Welcome Back!", `Logged in as ${dbAcc.username}. Stats synced from Neon DB.`);
  };
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
  const [roundSignalPickOpen, setRoundSignalPickOpen] = useState(false);
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
  const localMatchRef = useRef<LocalMatch | null>(null);
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
  const playedResultSoundRef = useRef<string | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("jackpot_bot_diff");
        if (saved === "easy" || saved === "normal" || saved === "hard") return saved;
      } catch {}
    }
    return "normal";
  });
  const [selectedPartnerId, setSelectedPartnerId] = useState<BotArchetypeId>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("jackpot_bot_partner");
        if (saved && saved in BOT_ARCHETYPES) return saved as BotArchetypeId;
      } catch {}
    }
    return "strategist";
  });
  const [offlineTeamName, setOfflineTeamName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("jackpot_offline_team_name");
        if (saved && saved.trim()) return saved.trim().slice(0, 18);
      } catch {}
    }
    return "Alpha";
  });
  const [matchRoster, setMatchRoster] = useState<{
    partner: ReturnType<typeof getArchetype>;
    opponents: [ReturnType<typeof getArchetype>, ReturnType<typeof getArchetype>];
  } | null>(null);
  const [suspectModalOpen, setSuspectModalOpen] = useState(false);
  const [suspectRevealing, setSuspectRevealing] = useState(false);
  const [suspectRevealPreview, setSuspectRevealPreview] = useState<SuspectRevealPreview | null>(null);
  const [jackpotModalOpen, setJackpotModalOpen] = useState(false);
  const [jackpotCelebrating, setJackpotCelebrating] = useState(false);
  const [roundTransitionOpen, setRoundTransitionOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
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
    : pathname === "/settings"
      ? "settings"
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
      settings: "/settings",
    };
    router.push(paths[destination]);
  }, [roomCode, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedAccount = readAccount();
      if (savedAccount) {
        setAccount(savedAccount);
        setNickname(savedAccount.username);
        setProfileDraft(savedAccount.username);
        setSelectedPartnerId(savedAccount.preferredPartnerId);
        setSelectedAvatar(savedAccount.avatar);
        setSelectedTitle(savedAccount.title);

        void fetchAccountFromDb(savedAccount.username).then((dbAcc) => {
          if (dbAcc) {
            setAccount(dbAcc);
            saveAccount(dbAcc);
          }
        });
      } else {
        if (isFirstVisit()) {
          setFirstVisitModalOpen(true);
        }
      }

      const savedSession = readSession();
      const guestName = savedAccount?.username ?? savedSession?.nickname ?? window.localStorage.getItem("jackpot:guest-name:v1") ?? "";
      if (!savedAccount) {
        setProfileDraft(guestName);
        setNickname(guestName);
      }
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
      const isPracticeRoute = routeCode.toLowerCase() === "practice";
      const savedRoom = routeCode && !isPracticeRoute ? findRoom(routeCode) : null;

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
      if (isPracticeRoute) {
        const pName = guestName || "You";
        const pid = savedSession?.playerId ?? VIEWER_ID;
        let practiceRoom = findRoom("PRACTICE") ?? findRoom("practice");
        if (!practiceRoom || (practiceRoom.players?.length ?? 0) < 4) {
          practiceRoom = createPracticeRoom(pName, pid);
          saveRoom(practiceRoom);
        }
        setRoom(practiceRoom);
        setRoomCode("practice");
        setTeamDraft(practiceRoom.teams ?? {});
        if (practiceRoom.scores) setScores(practiceRoom.scores);
        if (practiceRoom.round) setRound(practiceRoom.round);
        if (practiceRoom.result) setResult(practiceRoom.result);

        if (pathname.endsWith("/table") && !localMatchRef.current) {
          const match = new LocalMatch(
            {
              humanPlayerName: pName,
              humanPlayerId: pid,
              humanTeamSignal: savedSignal || "thumbs-up",
              difficulty: botDifficulty,
              partnerArchetype: selectedPartnerId,
            },
            Date.now()
          );
          localMatchRef.current = match;
          setMatchRoster(match.getMatchRoster());
          setGame({ ...match.state.game });
        }
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
      if (shared.status !== "result" && shared.result && shared.result.kind !== "suspect" && cached?.result?.title !== shared.result.title) {
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
    if (!hydrated || !roomCode || roomCode.toLowerCase() === "practice" || !pathname.startsWith("/room/") || !session?.playerId) return;
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
  const currentPartnerArchetype = BOT_ARCHETYPES[selectedPartnerId] ?? BOT_ARCHETYPES.strategist;
  const partnerName =
    partnerPlayer?.nickname ??
    teamMates.find((m) => m.id !== session?.playerId)?.nickname ??
    (roomCode === "practice" || localMatchRef.current ? currentPartnerArchetype.name : "Partner");
  const filteredSignals = useMemo(() => {
    if (signalCategoryFilter === "All") return signalLibrary;
    return signalLibrary.filter((s) => s.category === signalCategoryFilter);
  }, [signalCategoryFilter]);
  const scoreTeams: Team[] = ["Alpha", "Bravo"];
  const activePlayer = game?.players.find((player) => player.id === game.activePlayerId);
  const activePlayerIndex = game?.players.findIndex((player) => player.id === game.activePlayerId) ?? -1;
  const passReceiver = game && activePlayerIndex >= 0 ? game.players[(activePlayerIndex + 1) % game.players.length] : null;
  const isYourPass = game?.activePlayerId === viewerPlayerId;
  const yourFour = you ? findFourOfAKind(you.hand) : null;
  const activeSignalBurst = signalBursts.length > 0 ? signalBursts[signalBursts.length - 1] : null;
  const prevYourFour = useRef<Suit | null>(null);

  useEffect(() => {
    if (yourFour && !prevYourFour.current) {
      playCue("success");
      if ((you?.hand.length ?? 0) > 4) {
        showTableToast(
          "warning",
          "4-OF-A-KIND COMPLETE!",
          `You have four ${SUIT_LABELS[yourFour]}s! Pass your 5th card first before signalling.`,
        );
      } else {
        showTableToast(
          "success",
          "JACKPOT READY!",
          `You have four ${SUIT_LABELS[yourFour]}s! Flash your secret signal to your partner!`,
        );
      }
    }
    prevYourFour.current = yourFour;
  }, [yourFour, you?.hand.length, playCue, showTableToast]);

  useEffect(() => {
    if (selectedCardId && you && !you.hand.some((c) => c.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [selectedCardId, you]);

  const isAuthoritativeOnlineRoom = Boolean(roomCode && roomCode.toLowerCase() !== "practice" && room?.gameAuthoritative);
  const suspectAttemptsLeft = you
    ? isAuthoritativeOnlineRoom
      ? room?.suspectAttemptsRemaining?.[you.team as "Alpha" | "Bravo"] ?? SUSPECT_ATTEMPTS_PER_TEAM
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
        if (roomCode === "practice" || localMatchRef.current) {
          const pName = nickname.trim() || "You";
          const pid = session?.playerId ?? VIEWER_ID;
          const match = new LocalMatch(
            {
              humanPlayerName: pName,
              humanPlayerId: pid,
              humanTeamSignal: selectedSignal,
              difficulty: isTutorialMatch ? "easy" : botDifficulty,
              partnerArchetype: isTutorialMatch ? "strategist" : selectedPartnerId,
              tutorialRound: isTutorialMatch && round <= 2 ? (round as 1 | 2) : undefined,
            },
            Date.now()
          );
          if (isTutorialMatch && round === 1) {
            setTutorialStep("table_cards_intro");
            window.setTimeout(() => {
              setTutorialStep((prev) => (prev === "table_cards_intro" ? "table_pick_card" : prev));
            }, 2500);
          }
          localMatchRef.current = match;
          setMatchRoster(match.getMatchRoster());
          setGame({ ...match.state.game });
          if (room) {
            const updated: LocalRoom = {
              ...room,
              status: "table",
              teamPhase: "game",
              game: match.state.game,
            };
            saveRoom(updated);
            setRoom(updated);
          }
          navigate("table", "practice");
          return;
        }
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
    if (room.code.toUpperCase() === "PRACTICE" || roomCode.toLowerCase() === "practice") {
      return;
    }
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

    // Immediately remove from database on server (for online rooms only)
    if (currentCode.toUpperCase() !== "PRACTICE" && roomCode.toLowerCase() !== "practice") {
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

    if (!targetCode || targetCode === "PRACTICE") return;

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
    if (privateRoomCode.toUpperCase() === "PRACTICE" || roomCode === "practice") {
      setTeamMates([{ id: "player-north", nickname: "Michael (Bot)" }]);
      return;
    }
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
    if (!text || strategySeconds === 0) return;
    const now = Date.now();
    const pid = session?.playerId ?? VIEWER_ID;
    const optimisticMsg: LocalChatMessage = {
      id: `team-msg-${now}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: pid,
      nickname: nickname.trim() || "You",
      text,
      createdAt: now,
    };
    setTeamChat((prev) => [...prev, optimisticMsg]);
    if (!overrideText) setTeamChatDraft("");

    if (roomCode === "practice" || localMatchRef.current) {
      window.setTimeout(() => {
        const partnerReplies = [
          "Got it! Let's get these 4 cards fast! ⚡",
          "Copy that partner. Watch my signals too! 👀",
          "Say less! Team Alpha all the way! 🏆",
          "Sharper than sharp. Let's do this! 🔥",
        ];
        const reply = partnerReplies[Math.floor(Math.random() * partnerReplies.length)];
        const replyMsg: LocalChatMessage = {
          id: `team-msg-ai-${Date.now()}`,
          playerId: "player-north",
          nickname: "Michael",
          text: reply,
          createdAt: Date.now(),
        };
        setTeamChat((prev) => [...prev, replyMsg]);
      }, 650);
      return;
    }

    if (!room || !session) return;
    void updateTeamPrivate({ text });
  };

  const confirmSecretSignal = () => {
    setLocalSignalConfirmed(true);
    if (roomCode === "practice" || localMatchRef.current) {
      setTeamSignalLocked(true);
      window.setTimeout(() => {
        setAllTeamsLocked(true);
      }, 450);
      return;
    }
    void updateTeamPrivate({ signal: selectedSignal, agree: true });
  };

  const handleCompleteFirstVisit = () => {
    const clean = normalizePlayerName(firstVisitName.trim() || "Player");
    setNickname(clean);
    setProfileDraft(clean);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("jackpot:guest-name:v1", clean);
    }
    setFirstVisitCompleted();
    setFirstVisitModalOpen(false);
  };

  const handleTutorialNext = () => {
    if (!tutorialStep) return;
    switch (tutorialStep) {
      case "strategy_room_intro":
        setTutorialStep("strategy_signal_intro");
        break;
      case "strategy_signal_intro":
        setTutorialStep("table_cards_intro");
        navigate("table", "practice");
        break;
      case "table_cards_intro":
        setTutorialStep("table_pick_card");
        break;
      case "table_pick_card": {
        const triCard = you?.hand.find((c) => c.suit === "triangle") ?? you?.hand[you.hand.length - 1];
        if (triCard) setSelectedCardId(triCard.id);
        setTutorialStep("table_pass_first_card");
        break;
      }
      case "table_pass_first_card":
        if (selectedCardId && isYourPass) {
          onPassSelected();
        } else {
          const triCard = you?.hand.find((c) => c.suit === "triangle") ?? you?.hand[you.hand.length - 1];
          if (triCard) {
            setSelectedCardId(triCard.id);
            window.setTimeout(() => onPassSelected(), 100);
          }
        }
        break;
      case "table_partner_signal_detected":
        onJackpot();
        break;
      case "round2_observe_intro": {
        void handleNextRoundWithSignal("thumbs-up");
        window.setTimeout(() => {
          const opp1 = game?.players.find((p) => p.team !== you?.team);
          notifySignal({
            id: `tut-opp-sig-${Date.now()}`,
            playerId: opp1?.id ?? "player-east",
            playerName: opp1?.name ?? "Opponent 1 (Bot)",
            signalId: "thumbs-up",
            createdAt: Date.now(),
            expiresAt: Date.now() + 20000,
          });
          setTutorialStep("round2_suspicious_gesture");
        }, 1800);
        break;
      }
      case "round2_suspicious_gesture":
        onSuspect();
        break;
      case "tutorial_complete":
        setIsTutorialMatch(false);
        setTutorialStep(null);
        setTutorialCompleted(true);
        break;
    }
  };

  const startTutorialMatch = () => {
    setIsTutorialMatch(true);
    setBotDifficulty("easy");
    setSelectedPartnerId("strategist");
    setSelectedSignal("thumbs-up");
    setTutorialStep("strategy_room_intro");
    startLocalPracticeMatch("thumbs-up", "strategist", 1);
  };

  const handlePlayOffline = () => {
    if (isGuest && !isTutorialCompleted()) {
      startTutorialMatch();
    } else {
      setIsTutorialMatch(false);
      setTutorialStep(null);
      startLocalPracticeMatch(undefined, account?.preferredPartnerId ?? (isGuest ? "strategist" : selectedPartnerId));
    }
  };

  const handleRegisterAccount = () => {
    const cleanUser = normalizePlayerName(authUsername.trim() || nickname.trim() || "Player");
    const newAcc = migrateGuestToAccount(cleanUser, authEmail, selectedAvatar, selectedTitle, selectedPartnerId, authPassword);
    setAccount(newAcc);
    setNickname(newAcc.username);
    setProfileDraft(newAcc.username);
    setAuthModalOpen(false);
    setSessionSummaryOpen(false);
    setProfileSetupOpen(true);
    showTableToast("success", "Account Created!", "Your guest match records have been saved to your permanent Neon DB profile.");
  };

  const handleSaveProfile = () => {
    if (!account) return;
    const updated: UserAccount = {
      ...account,
      avatar: selectedAvatar,
      title: selectedTitle,
      preferredPartnerId: selectedPartnerId,
    };
    saveAccount(updated);
    setAccount(updated);
    setProfileSetupOpen(false);
    showTableToast("success", "Profile Updated", "Your avatar, title, and AI partner preferences have been saved.");
    navigate("home");
  };

  const startLocalPracticeMatch = (chosenSignal?: string, partnerId = selectedPartnerId, tutorialRound?: 1 | 2) => {
    const signalToUse = chosenSignal ?? selectedSignal ?? "thumbs-up";
    const playerName = nickname.trim() || "You";
    let pid = session?.playerId ?? "";

    if (!session || !pid) {
      pid = createPlayerId();
      const newSession: LocalSession = {
        playerId: pid,
        nickname: playerName,
        roomCode: "practice",
        updatedAt: Date.now(),
      };
      writeSession(newSession);
      setSession(newSession);
    }

    const partnerArchetype = getArchetype(partnerId);
    const practiceRoom = createPracticeRoom(playerName, pid, {
      partnerName: `${partnerArchetype.name} (Bot)`,
    });
    saveRoom(practiceRoom);
    setRoom(practiceRoom);
    setRoomCode("practice");
    setTeamDraft(practiceRoom.teams ?? {});
    setScores(emptyScores());
    setRound(1);
    setResult(null);
    setMatchWonTeam(null);
    setSelectedSignal(signalToUse);
    setLocalSuspectAttempts({ Alpha: 3, Bravo: 3, Charlie: 3, Delta: 3 });
    localMatchRef.current = null;

    navigate("signal", "practice");
  };

  const teamAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!room || !session || teamActionBusy) return;

    if (room.code.toUpperCase() === "PRACTICE" || roomCode.toLowerCase() === "practice") {
      if (action === "begin-assignment") {
        const updated: LocalRoom = {
          ...room,
          teamPhase: "assignment",
          teams: Object.keys(teamDraft).length ? teamDraft : room.teams ?? {},
        };
        saveRoom(updated);
        setRoom(updated);
        navigate("teams", "practice");
        return;
      }

      if (action === "assign-teams") {
        let assignments = (extra.assignments as Record<string, "Alpha" | "Bravo">) ?? currentTeamDraft;
        if (extra.shuffle) {
          const playerIds = room.players.map((p) => p.id);
          const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
          assignments = {
            [shuffled[0]]: "Alpha",
            [shuffled[1]]: "Alpha",
            [shuffled[2]]: "Bravo",
            [shuffled[3]]: "Bravo",
          };
          setTeamDraft(assignments);
        }
        const updated: LocalRoom = {
          ...room,
          teamPhase: "confirmation",
          teams: assignments,
          teamAcceptances: {
            [session.playerId]: true,
            "player-east": true,
            "player-north": true,
            "player-west": true,
          },
          confirmationEndsAt: Date.now() + 2500,
        };
        saveRoom(updated);
        setRoom(updated);

        window.setTimeout(() => {
          const stratRoom: LocalRoom = {
            ...updated,
            teamPhase: "strategy",
            status: "strategy",
            strategyEndsAt: Date.now() + 60000,
          };
          saveRoom(stratRoom);
          setRoom(stratRoom);
          navigate("signal", "practice");
        }, 1800);
        return;
      }

      if (action === "respond") {
        if (extra.accept === true) {
          const stratRoom: LocalRoom = {
            ...room,
            teamPhase: "strategy",
            status: "strategy",
            strategyEndsAt: Date.now() + 60000,
          };
          saveRoom(stratRoom);
          setRoom(stratRoom);
          navigate("signal", "practice");
        } else {
          const assignRoom: LocalRoom = {
            ...room,
            teamPhase: "assignment",
          };
          saveRoom(assignRoom);
          setRoom(assignRoom);
        }
        return;
      }
    }

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

    // Record stats for guest session
    if (isGuest) {
      recordGuestStat("roundsPlayed", 1);
      if (outcome.valid && outcome.scoringTeam === you?.team) {
        recordGuestStat("wins", 1);
      }
      if (outcome.kind === "jackpot" && outcome.valid) {
        recordGuestStat("jackpotsCalled", 1);
      } else if (outcome.kind === "suspect" && outcome.valid) {
        recordGuestStat("suspectsCaught", 1);
      }
    } else if (account) {
      const updatedStats = {
        ...account.stats,
        roundsPlayed: account.stats.roundsPlayed + 1,
        wins: outcome.valid && outcome.scoringTeam === you?.team ? account.stats.wins + 1 : account.stats.wins,
        jackpotsCalled: outcome.kind === "jackpot" && outcome.valid ? account.stats.jackpotsCalled + 1 : account.stats.jackpotsCalled,
        suspectsCaught: outcome.kind === "suspect" && outcome.valid ? account.stats.suspectsCaught + 1 : account.stats.suspectsCaught,
      };
      const updatedAccount = { ...account, stats: updatedStats };
      saveAccount(updatedAccount);
      setAccount(updatedAccount);
    }

    if (isTutorialMatch) {
      if (round === 1) {
        setTutorialStep("round2_observe_intro");
      } else if (round === 2) {
        setTutorialStep("tutorial_complete");
        setTutorialCompleted(true);
      }
    }

    if (room) {
      const updatedRoom = { ...room, status: "result" as const, game, scores: nextScores, result: outcome };
      saveRoom(updatedRoom);
      setRoom(updatedRoom);
    } else {
      showTableToast(outcome.valid ? "success" : "warning", outcome.title, outcome.detail);
    }

    // Check if either team has spelled all 7 letters of JACKPOT
    const winningTeam = (["Alpha", "Bravo"] as const).find((t) => nextScores[t] >= WINNING_SCORE);
    if (winningTeam) {
      setMatchWonTeam(winningTeam);
    }

    if (roomCode === "practice" || localMatchRef.current) {
      navigate("result", "practice");
      return;
    }

    if (!winningTeam && !room) {
      setRoundTransitionOpen(true);
    }
  };

  const tryPass = (fromId: string, cardId: string) => {
    if (!game || busy) return;
    if (localMatchRef.current) {
      const match = localMatchRef.current;
      const outcome = match.submitHumanAction({ type: "pass", playerId: fromId, cardId });
      if (outcome.ok) {
        setGame({ ...match.state.game });
        if (match.state.game.lastPassEvent) {
          seenPassIds.current.add(match.state.game.lastPassEvent.id);
          lastPassEventId.current = match.state.game.lastPassEvent.id;
          notifyCardPass(match.state.game.lastPassEvent);
        }
        setSelectedCardId(null);
        setStatus(match.state.game.log[0] ?? "");
      } else {
        setStatus(outcome.error ?? "Pass failed.");
      }
      return;
    }
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

  const requestServerGameAction = async (
    type: "pass" | "jackpot" | "suspect" | "signal" | "fake-signal" | "reaction" | "restart" | "next-round" | "rematch",
    cardId?: string,
    reactionId?: string,
    targetPlayerId?: string
  ) => {
    if (!room || !session || busy) return;
    setBusy(true);
    try {
      const sendRequest = () => fetch(`/api/rooms/${encodeURIComponent(room.code)}/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: session.playerId,
          type,
          ...(cardId ? { cardId } : {}),
          ...(reactionId ? { reactionId } : {}),
          ...(targetPlayerId ? { targetPlayerId } : {}),
        }),
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
    if (isTutorialMatch && (tutorialStep === "table_pass_first_card" || tutorialStep === "table_pick_card")) {
      // In tutorial round 1, advance step once first pass executes
      window.setTimeout(() => {
        const partner = game.players.find((p) => p.team === you?.team && p.id !== viewerPlayerId);
        notifySignal({
          id: `tut-p-sig-${Date.now()}`,
          playerId: partner?.id ?? "player-north",
          playerName: partner?.name ?? "Partner (Bot)",
          signalId: "thumbs-up",
          createdAt: Date.now(),
          expiresAt: Date.now() + 25000,
        });
        setTutorialStep("table_partner_signal_detected");
      }, 1000);
    }
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

    if (room?.gameAuthoritative) {
      void requestServerGameAction("jackpot");
      setJackpotCelebrating(false);
    } else if (localMatchRef.current) {
      const match = localMatchRef.current;
      const outcome = match.submitHumanAction({ type: "jackpot", playerId: viewerPlayerId });
      if (outcome.ok && outcome.result) {
        if (outcome.result.valid) {
          setMatchStats((prev) => ({ ...prev, jackpotsCalled: prev.jackpotsCalled + 1 }));
          if (partner) triggerTableAutoReaction([partner.id], "fire");
          const opponents = game.players.filter((p) => p.team !== you?.team).map((p) => p.id);
          triggerTableAutoReaction(opponents, "shock");
        } else {
          setMatchStats((prev) => ({ ...prev, falseCalls: prev.falseCalls + 1 }));
          const opponents = game.players.filter((p) => p.team !== you?.team).map((p) => p.id);
          triggerTableAutoReaction(opponents, "laugh");
        }
        finishRound(outcome.result);
      }
      window.setTimeout(() => setJackpotCelebrating(false), 800);
    } else {
      const outcome = resolveJackpot(game, viewerPlayerId);
      if (outcome.valid) {
        setMatchStats((prev) => ({ ...prev, jackpotsCalled: prev.jackpotsCalled + 1 }));
        if (partner) triggerTableAutoReaction([partner.id], "fire");
        const opponents = game.players.filter((p) => p.team !== you?.team).map((p) => p.id);
        triggerTableAutoReaction(opponents, "shock");
        finishRound(outcome);
      } else {
        setMatchStats((prev) => ({ ...prev, falseCalls: prev.falseCalls + 1 }));
        const opponents = game.players.filter((p) => p.team !== you?.team).map((p) => p.id);
        triggerTableAutoReaction(opponents, "laugh");
        finishRound(outcome);
      }
      window.setTimeout(() => setJackpotCelebrating(false), 800);
    }
  };

  const onJackpot = () => {
    if (!game || busy) return;
    // Calling JACKPOT on your partner is allowed even if you hold 5 cards!
    executeJackpot();
  };

  const executeSuspect = async (targetPlayerId?: string) => {
    if (!game || busy) return;
    setSuspectModalOpen(false);
    setSuspectRevealing(true);
    playCue("suspense");

    const caller = game.players.find((player) => player.id === viewerPlayerId);
    const callerTeam = caller?.team ?? "Alpha";
    const targetPlayer = targetPlayerId ? game.players.find((p) => p.id === targetPlayerId) : undefined;
    const isSharedOnline = Boolean(roomCode && roomCode.toLowerCase() !== "practice" && room?.gameAuthoritative);
    const canRevealProof = Boolean(targetPlayer && targetPlayer.team !== callerTeam && !isSharedOnline);

    if (canRevealProof && targetPlayer) {
      const proofCards = chooseSuspectProofCards(targetPlayer.hand);
      if (proofCards.length === 2) {
        setSuspectRevealPreview({
          targetName: targetPlayer.name,
          cards: proofCards,
          isRefuted: proofCards[0].suit !== proofCards[1].suit,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 550));
        setSuspectRevealPreview(null);
      }
    }

    if (isSharedOnline) {
      void requestServerGameAction("suspect", undefined, undefined, targetPlayerId);
      window.setTimeout(() => setSuspectRevealing(false), 400);
    } else if (localMatchRef.current) {
      const match = localMatchRef.current;
      const outcome = match.submitHumanAction({ type: "suspect", playerId: viewerPlayerId, targetPlayerId });
      if (outcome.ok && outcome.result) {
        if (outcome.result.valid) {
          setMatchStats((prev) => ({ ...prev, suspectsCaught: prev.suspectsCaught + 1 }));
          const allOther = game.players.filter((p) => p.id !== viewerPlayerId).map((p) => p.id);
          triggerTableAutoReaction(allOther, "eyes");
          finishRound(outcome.result);
        } else {
          playCue("false_call");
          setMatchStats((prev) => ({ ...prev, falseCalls: prev.falseCalls + 1 }));
          const opponents = game.players.filter((p) => p.team !== callerTeam).map((p) => p.id);
          triggerTableAutoReaction(opponents, "laugh");
          const remaining = match.state.suspectsRemaining[callerTeam] ?? 0;
          setLocalSuspectAttempts((current) => ({ ...current, [callerTeam]: remaining }));
          const targetName = targetPlayer ? targetPlayer.name : "opponent";
          setStatus(`FALSE SUSPECT on ${targetName} — ${remaining} team calls remain.`);
          showTableToast("warning", "False Call", `${targetName} did not have four of a kind! ${remaining} calls left.`);
        }
      }
      window.setTimeout(() => setSuspectRevealing(false), 400);
    } else {
      const remaining = localSuspectAttempts[callerTeam] ?? 0;
      if (remaining <= 0) {
        setStatus("Your team has used all three SUSPECT calls this round.");
        setSuspectRevealPreview(null);
        setSuspectRevealing(false);
        return;
      }
      const outcome = resolveSuspect(game, viewerPlayerId, targetPlayerId);
      setLocalSuspectAttempts((current) => ({ ...current, [callerTeam]: remaining - 1 }));

      if (outcome.valid) {
        setMatchStats((prev) => ({ ...prev, suspectsCaught: prev.suspectsCaught + 1 }));
        const allOther = game.players.filter((p) => p.id !== viewerPlayerId).map((p) => p.id);
        triggerTableAutoReaction(allOther, "eyes");
        finishRound(outcome);
      } else {
        playCue("false_call");
        setMatchStats((prev) => ({ ...prev, falseCalls: prev.falseCalls + 1 }));
        const opponents = game.players.filter((p) => p.team !== callerTeam).map((p) => p.id);
        triggerTableAutoReaction(opponents, "laugh");
        const targetName = targetPlayer ? targetPlayer.name : "opponent";
        setStatus(`FALSE SUSPECT on ${targetName} — ${remaining - 1} team calls remain.`);
        showTableToast("warning", "False Call", `${targetName} did not have four of a kind! ${remaining - 1} calls left.`);
      }
      window.setTimeout(() => setSuspectRevealing(false), 400);
    }
  };

  const onSuspect = (targetPlayerId?: string) => {
    if (!game || busy) return;
    const currentTeam = (you?.team ?? "Alpha") as "Alpha" | "Bravo";
    const isSharedOnline = Boolean(roomCode && roomCode.toLowerCase() !== "practice" && room?.gameAuthoritative);
    const remaining = isSharedOnline
      ? room?.suspectAttemptsRemaining?.[currentTeam] ?? SUSPECT_ATTEMPTS_PER_TEAM
      : localSuspectAttempts[currentTeam] ?? SUSPECT_ATTEMPTS_PER_TEAM;
    if (remaining <= 0) {
      showTableToast("warning", "No calls left", "Your team has used all 3 SUSPECT calls for this round.");
      return;
    }
    void executeSuspect(targetPlayerId);
  };

  const handleNextRoundWithSignal = async (signalIdToUse: string) => {
    setRoundTransitionOpen(false);
    setRoundSignalPickOpen(false);
    setResult(null);
    setSelectedSignal(signalIdToUse);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("jackpot:signal:v1", signalIdToUse);
    }

    const effectiveRoomCode = roomCode || "practice";
    const isSharedOnline = Boolean(effectiveRoomCode.toLowerCase() !== "practice" && room?.gameAuthoritative);
    if (isSharedOnline) {
      await requestServerGameAction("next-round");
    } else {
      const nextR = round + 1;
      setRound(nextR);
      const pName = nickname.trim() || session?.nickname?.trim() || "You";
      const pid = session?.playerId ?? VIEWER_ID;
      const match = new LocalMatch(
        {
          humanPlayerName: pName,
          humanPlayerId: pid,
          humanTeamSignal: signalIdToUse,
          difficulty: botDifficulty,
          partnerArchetype: selectedPartnerId,
        },
        Date.now()
      );
      localMatchRef.current = match;
      setMatchRoster(match.getMatchRoster());
      setGame({ ...match.state.game });
      setLocalSuspectAttempts({ Alpha: 3, Bravo: 3, Charlie: 3, Delta: 3 });
      if (room) {
        const updatedRoom: LocalRoom = {
          ...room,
          status: "table",
          teamPhase: "game",
          game: match.state.game,
          round: nextR,
          result: null,
        };
        saveRoom(updatedRoom);
        setRoom(updatedRoom);
      }
      navigate("table", effectiveRoomCode);
      if (isTutorialMatch && nextR === 2) {
        window.setTimeout(() => {
          const opp1 = match.state.game.players.find((p) => p.team !== "Alpha");
          notifySignal({
            id: `tut-opp-sig-${Date.now()}`,
            playerId: opp1?.id ?? "player-east",
            playerName: opp1?.name ?? "Opponent 1 (Bot)",
            signalId: "thumbs-up",
            createdAt: Date.now(),
            expiresAt: Date.now() + 20000,
          });
          setTutorialStep("round2_suspicious_gesture");
        }, 1800);
      }
    }
  };

  const handleNextRound = async () => {
    setRoundTransitionOpen(false);
    // Open signal picker so the team can change their exposed signal for the new round
    if (!matchWonTeam && (scores.Alpha || 0) < WINNING_SCORE && (scores.Bravo || 0) < WINNING_SCORE) {
      setRoundSignalPickOpen(true);
    } else {
      handleRematch();
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
    } else if (roomCode === "practice" || localMatchRef.current) {
      const pName = nickname.trim() || "You";
      const pid = session?.playerId ?? VIEWER_ID;
      const match = new LocalMatch(
        {
          humanPlayerName: pName,
          humanPlayerId: pid,
          humanTeamSignal: selectedSignal,
          difficulty: botDifficulty,
          partnerArchetype: selectedPartnerId,
        },
        Date.now()
      );
      localMatchRef.current = match;
      setMatchRoster(match.getMatchRoster());
      setGame({ ...match.state.game });
      setLocalSuspectAttempts({ Alpha: 3, Bravo: 3, Charlie: 3, Delta: 3 });
      if (room) {
        const updatedRoom: LocalRoom = {
          ...room,
          status: "strategy",
          teamPhase: "strategy",
          game: match.state.game,
          scores: emptyScores(),
          round: 1,
          result: null,
        };
        saveRoom(updatedRoom);
        setRoom(updatedRoom);
      }
      navigate("signal", "practice");
    } else {
      setStrategySeconds(60);
      navigate("signal");
    }
  };

  const handleExitHome = useCallback(() => {
    if (isGuest && matchStats.roundsPlayed > 0 && !sessionSummaryOpen) {
      setSessionSummaryOpen(true);
      return;
    }
    const currentCode = roomCode;
    const currentPid = session?.playerId;
    localMatchRef.current = null;
    setGame(null);
    setResult(null);
    setRoom(null);
    setRoomCode("");
    setIsTutorialMatch(false);
    setTutorialStep(null);
    setSessionSummaryOpen(false);
    if (session) {
      writeSession({ ...session, roomCode: "" });
    }
    if (currentCode && currentCode.toLowerCase() !== "practice" && currentPid) {
      void fetch(`/api/rooms/${encodeURIComponent(currentCode)}?playerId=${encodeURIComponent(currentPid)}&deliberate=true`, {
        method: "DELETE",
      }).catch(() => {});
    }
    router.push("/");
  }, [isGuest, matchStats.roundsPlayed, roomCode, router, session, sessionSummaryOpen]);

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

  // Play sound effect whenever entering the result screen (strictly ONCE per result)
  useEffect(() => {
    if (screen !== "result" || !result) {
      if (screen !== "result") {
        playedResultSoundRef.current = null;
      }
      return;
    }
    const resultKey = `${round}:${result.kind}:${result.title}:${result.valid}:${result.callingPlayerId}:${result.scoringTeam ?? ""}`;
    if (playedResultSoundRef.current === resultKey) return;
    playedResultSoundRef.current = resultKey;

    if (result.valid) {
      playCue(result.kind === "suspect" ? "caught" : "jackpot");
    } else {
      playCue("false_call");
    }
  }, [screen, result, round, playCue]);

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
    if (you && you.hand.length > 4) {
      showTableToast("warning", "Pass card first", "You are holding 5 cards! Pass your extra card before flashing your signal.");
      return;
    }
    if (room?.gameAuthoritative) {
      playCue("signal");
      void requestServerGameAction("signal");
    } else if (localMatchRef.current) {
      const match = localMatchRef.current;
      const outcome = match.submitHumanAction({ type: "signal", playerId: viewerPlayerId });
      if (outcome.ok) {
        setGame({ ...match.state.game });
        const signals = match.state.game.publicSignals ?? [];
        const newest = signals[signals.length - 1];
        if (newest) {
          lastSignalEventId.current = newest.id;
          notifySignal(newest);
        }
        setSignalFlash(true);
        window.setTimeout(() => setSignalFlash(false), 2400);
      }
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

    if (!game || !partner || room?.gameAuthoritative || localMatchRef.current) return;

    // Partner AI: if they already hold four-of-a-kind (with exactly 4 cards), they call JACKPOT for the team.
    if (partner.hand.length === 4 && findFourOfAKind(partner.hand)) {
      setBusy(true);
      window.setTimeout(() => {
        finishRound(resolveJackpot(game, partner.id));
      }, 700);
    }
  };

  const onFakeSignal = () => {
    if (!game || busy) return;
    setSignalMenuOpen(false);
    if (you && you.hand.length > 4) {
      showTableToast("warning", "Pass card first", "You are holding 5 cards! Pass your extra card before flashing your signal.");
      return;
    }
    if (room?.gameAuthoritative) {
      playCue("signal");
      void requestServerGameAction("fake-signal");
    } else if (localMatchRef.current) {
      const match = localMatchRef.current;
      const actual = selectedSignal;
      const choices = signalLibrary.filter((signal) => signal.id !== actual);
      const decoy = choices[Math.floor(Math.random() * choices.length)];
      const outcome = match.submitHumanAction({ type: "fake-signal", playerId: viewerPlayerId, signalId: decoy.id });
      if (outcome.ok) {
        setGame({ ...match.state.game });
        const signals = match.state.game.publicSignals ?? [];
        const newest = signals[signals.length - 1];
        if (newest) {
          lastSignalEventId.current = newest.id;
          notifySignal(newest);
        }
        setSignalFlash(true);
        window.setTimeout(() => setSignalFlash(false), 2400);
      }
      setStatus("Fake signal flashed — bluff them into calling SUSPECT.");
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
    if (localMatchRef.current) {
      const match = localMatchRef.current;
      const outcome = match.submitHumanAction({ type: "reaction", playerId: viewerPlayerId, reactionId });
      if (outcome.ok) {
        setGame({ ...match.state.game });
        const reactions = match.state.game.publicReactions ?? [];
        const newest = reactions[reactions.length - 1];
        if (newest) displayReaction(newest);
      }
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
    if (localMatchRef.current) return;
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
    if (screen !== "table" || !game || busy || room?.gameAuthoritative || localMatchRef.current) return;
    if (game.activePlayerId === viewerPlayerId) return;
    const snapshot = game;
    const timer = window.setTimeout(() => runAiTurn(snapshot), 0);
    return () => window.clearTimeout(timer);
  }, [screen, game, busy, room?.gameAuthoritative, viewerPlayerId]);

  // Local Practice Bot Simulation Loop
  useEffect(() => {
    if (screen !== "table" || !localMatchRef.current) return;
    const match = localMatchRef.current;
    if (match.state.status !== "playing") return;

    const interval = window.setInterval(() => {
      if (match.state.status !== "playing") return;
      const beforePassCount = match.state.game.passCount;
      const beforeSignalsCount = match.state.game.publicSignals?.length ?? 0;

      const executed = match.stepTo(Date.now(), 100);

      if (match.state.game.passCount !== beforePassCount || executed.length > 0) {
        setGame({ ...match.state.game });
        if (match.state.game.log[0]) setStatus(match.state.game.log[0]);

        if (match.state.game.lastPassEvent && match.state.game.lastPassEvent.id !== lastPassEventId.current) {
          lastPassEventId.current = match.state.game.lastPassEvent.id;
          seenPassIds.current.add(match.state.game.lastPassEvent.id);
          notifyCardPass(match.state.game.lastPassEvent);
        }

        const signals = match.state.game.publicSignals ?? [];
        if (signals.length > beforeSignalsCount) {
          const newest = signals[signals.length - 1];
          if (newest && newest.id !== lastSignalEventId.current) {
            lastSignalEventId.current = newest.id;
            notifySignal(newest);
          }
        }
      }

      for (const exec of executed) {
        if (exec.action.type === "suspect" && exec.outcome && !exec.outcome.valid) {
          const callingTeam = exec.outcome.callingTeam;
          if (callingTeam) {
            setLocalSuspectAttempts((prev) => ({
              ...prev,
              [callingTeam]: Math.max(0, (prev[callingTeam] ?? 3) - 1),
            }));
          }
          showTableToast("warning", exec.outcome.title, exec.outcome.detail);
        }
      }

      if ((match.state.status as "playing" | "over") === "over" && match.state.result) {
        finishRound(match.state.result);
      }
    }, 120);

    return () => window.clearInterval(interval);
  }, [screen, notifyCardPass, notifySignal, finishRound, showTableToast]);

  if (!hydrated) {
    return (
      <main className="app-shell">
        <div className="scene-frame session-loading" aria-live="polite">Loading your game session...</div>
      </main>
    );
  }

  const isFramelessScreen = screen === "table" || screen === "result";
  const isFullWidthScreen = !isFramelessScreen;

  return (
    <main className={`app-shell ${isFullWidthScreen ? "full-width" : ""} ${isFramelessScreen ? "table-mode" : ""} ${screen === "result" ? "result-mode" : ""} ${preferences.animationsEnabled ? "" : "motion-reduced"}`}>
      <div className={`scene-frame ${isFullWidthScreen ? "full-width-frame" : ""} ${isFramelessScreen ? "table-frame" : ""} ${screen === "result" ? "result-frame" : ""}`}>
        {screen === "home" && (
          <section className="hero-screen lobby-home jackpot-home" style={{ "--landing-bg-desktop": `url("${landingBackground.src}")`, "--landing-bg-mobile": `url("${mobileLandingBackground.src}")` } as React.CSSProperties}>
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              onNavigateSettings={() => navigate("settings")}
            />
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

                {/* 3 Game Buttons in 1 Row with Clean SVG Icons (No Emojis) */}
                <div className="landing-wood-actions">
                  <button
                    type="button"
                    className="wood-btn wood-practice"
                    onClick={() => handlePlayOffline()}
                  >
                    <span className="wood-btn-badge" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <path d="M6 12h4" />
                        <path d="M8 10v4" />
                        <circle cx="17" cy="10" r="1" fill="currentColor" />
                        <circle cx="15" cy="13" r="1" fill="currentColor" />
                      </svg>
                    </span>
                    <span className="wood-btn-text">OFFLINE PLAY</span>
                  </button>

                  <button
                    type="button"
                    className="wood-btn wood-create"
                    onClick={() => navigate("create")}
                    disabled={!nickname.trim()}
                  >
                    <span className="wood-btn-badge" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                    </span>
                    <span className="wood-btn-text">CREATE ROOM</span>
                  </button>

                  <button
                    type="button"
                    className="wood-btn wood-join"
                    onClick={() => navigate("join")}
                    disabled={!nickname.trim()}
                  >
                    <span className="wood-btn-badge" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                    </span>
                    <span className="wood-btn-text">JOIN ROOM</span>
                  </button>
                </div>

                {/* Guest Account Prompt Banner (Subtle & Non-blocking) */}
                {isGuest && (
                  <div className="guest-account-prompt-banner">
                    <div className="guest-prompt-text">
                      <span className="guest-sparkle-icon">✦</span>
                      <span>Create an account to save your progress and unlock your full profile.</span>
                    </div>
                    <button
                      type="button"
                      className="guest-prompt-btn"
                      onClick={() => {
                        setAuthUsername(nickname || "Player");
                        setAuthModalOpen(true);
                      }}
                    >
                      Create Free Account
                    </button>
                  </div>
                )}

                {/* Authenticated Account Status Banner */}
                {account && (
                  <div className="user-account-badge-card">
                    <div className="user-badge-left">
                      <span className="user-badge-avatar">{account.avatar}</span>
                      <div className="user-badge-meta">
                        <span className="user-badge-name">{account.username}</span>
                        <span className="user-badge-title">{account.title}</span>
                      </div>
                    </div>
                    <div className="user-badge-stats">
                      🏆 {account.stats.wins} Wins · {account.stats.jackpotsCalled} Jackpots
                    </div>
                  </div>
                )}
              </div>

              {/* Floating Quick-Menu Menu on Right - Tutorials & Settings */}
              <div className="floating-card-menu">
                <button type="button" className="quick-menu-item" onClick={() => navigate("settings")}>
                  <span className="menu-svg-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </span>
                  Settings
                </button>
                <button type="button" className="quick-menu-item" onClick={() => startTutorialMatch()}>
                  <span className="menu-svg-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </span>
                  Interactive Tutorial
                </button>
                <button type="button" className="quick-menu-item" onClick={() => navigate("howto")}>
                  <span className="menu-svg-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </span>
                  Rules Guide
                </button>
              </div>
            </div>
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
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              showBack
              onBack={() => navigate("home")}
              onNavigateHome={() => navigate("home")}
            />

            <div className="jackpot-subpage-content howto-subpage-content">
              <HowToPlayInteractive
                onBack={() => navigate("home")}
                onCreateRoom={() => navigate("create")}
                onJoinRoom={() => navigate("join")}
              />
            </div>
          </section>
        )}

        {screen === "settings" && (
          <section
            className="hero-screen lobby-home jackpot-home jackpot-subpage settings-subpage"
            style={{
              "--landing-bg-desktop": `url("${landingBackground.src}")`,
              "--landing-bg-mobile": `url("${mobileLandingBackground.src}")`,
            } as React.CSSProperties}
          >
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              showBack
              onBack={() => navigate("home")}
              onNavigateHome={() => navigate("home")}
            />

            <div className="jackpot-subpage-content settings-subpage-content">
              <SettingsPageContent
                preferences={preferences}
                setPreferences={setPreferences}
                selectedPartnerId={selectedPartnerId}
                onSelectPartner={(id) => {
                  setSelectedPartnerId(id);
                  try {
                    localStorage.setItem("jackpot_bot_partner", id);
                  } catch {}
                }}
                botDifficulty={botDifficulty}
                onChangeDifficulty={(diff) => {
                  setBotDifficulty(diff);
                  try {
                    localStorage.setItem("jackpot_bot_diff", diff);
                  } catch {}
                }}
                offlineTeamName={offlineTeamName}
                setOfflineTeamName={setOfflineTeamName}
                isGuest={isGuest}
                onPromptAccount={() => {
                  setAuthUsername(nickname || "Player");
                  setAuthModalOpen(true);
                }}
                onStartOfflinePlay={() => handlePlayOffline()}
                onBack={() => navigate("home")}
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
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              showBack
              onBack={() => navigate("home")}
              onNavigateHome={() => navigate("home")}
            />

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
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              showBack
              onBack={() => navigate("home")}
              onNavigateHome={() => navigate("home")}
            />

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
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              onNavigateHome={handleExitHome}
            />

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

                {/* Compact Bot Difficulty Selector for Practice / Solo Rooms */}
                {(roomCode.toLowerCase() === "practice" || room?.code?.toUpperCase() === "PRACTICE") && (
                  <div className="diff-compact-bar">
                    <span className="diff-compact-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      AI Difficulty
                    </span>
                    <div className="diff-compact-pills" role="radiogroup" aria-label="AI Difficulty">
                      <button
                        type="button"
                        className={`diff-pill-btn ${botDifficulty === "easy" ? "active easy" : ""}`}
                        onClick={() => {
                          setBotDifficulty("easy");
                          try { localStorage.setItem("jackpot_bot_diff", "easy"); } catch {}
                        }}
                      >
                        <span className="diff-dot easy" />
                        <span>Easy</span>
                      </button>

                      <button
                        type="button"
                        className={`diff-pill-btn ${botDifficulty === "normal" ? "active normal" : ""}`}
                        onClick={() => {
                          setBotDifficulty("normal");
                          try { localStorage.setItem("jackpot_bot_diff", "normal"); } catch {}
                        }}
                      >
                        <span className="diff-dot normal" />
                        <span>Normal</span>
                      </button>

                      <button
                        type="button"
                        className={`diff-pill-btn ${botDifficulty === "hard" ? "active hard" : ""}`}
                        onClick={() => {
                          setBotDifficulty("hard");
                          try { localStorage.setItem("jackpot_bot_diff", "hard"); } catch {}
                        }}
                      >
                        <span className="diff-dot hard" />
                        <span>Hard</span>
                      </button>
                    </div>
                  </div>
                )}

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
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              onNavigateHome={handleExitHome}
            />

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
            <JackpotNavBar
              nickname={nickname}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              saveProfileName={saveProfileName}
              settingsStatus={settingsStatus}
              account={account}
              onOpenAuth={() => { setAuthUsername(nickname || "Player"); setAuthModalOpen(true); }}
              onOpenProfileSetup={() => setProfileSetupOpen(true)}
              onNavigateHome={handleExitHome}
            />

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

                {/* Main Layout: Signal Chooser & Confirmation */}
                <div className="secret-main-grid single-column">
                  <div className="secret-card signal-chooser-card">
                    <div className="secret-card-header">
                      <div className="secret-header-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

                {/* Dramatic 3... 2... 1... TABLE! Countdown Overlay */}
                {tableLaunchCountdown !== null && (
                  <div className="table-launch-overlay" role="dialog" aria-modal="true" aria-live="assertive">
                    <div className="launch-box-pro">
                      <div className="launch-ambient-pulse" />
                      <div className="launch-radar-ring" />

                      <div className="launch-header-badge">
                        <span className="launch-live-dot" />
                        <span>ALL TEAMS READY</span>
                      </div>

                      <h2 className="launch-hero-title">ENTERING TABLE</h2>
                      <p className="launch-hero-desc">
                        Secret partner cues locked · Shuffling cards for Round {round}...
                      </p>

                      <div className={`launch-dial-stage ${tableLaunchCountdown === 0 ? "dial-table-active" : ""}`}>
                        <div className="launch-dial-ring-outer" />
                        <div className="launch-dial-ring-inner" />
                        <div className="launch-dial-core">
                          {tableLaunchCountdown > 0 ? (
                            <span key={tableLaunchCountdown} className="launch-count-number">
                              {tableLaunchCountdown}
                            </span>
                          ) : (
                            <div className="launch-table-burst">
                              <span className="burst-crown">♛</span>
                              <strong className="burst-text">TABLE!</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="launch-team-status-strip">
                        <div className="launch-team-pill alpha">
                          <span className="pill-dot" />
                          <span>Team Alpha: Ready ✓</span>
                        </div>
                        <div className="launch-team-pill bravo">
                          <span className="pill-dot" />
                          <span>Team Bravo: Ready ✓</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
            {/* Sleek Minimal In-Game Topbar: Essential HUD Only */}
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
                    <span className="end-session-label">Exit</span>
                  </button>
                </div>

                {/* Center: Live Match Scoreboard + Secret Cue Reminder */}
                <div className="topbar-center">
                  <div
                    className="topbar-scoreboard"
                    role="status"
                    aria-label={`Match score: Alpha ${scores.Alpha || 0}, Bravo ${scores.Bravo || 0}, Round ${round}`}
                  >
                    <div className={`score-badge alpha ${you.team === "Alpha" ? "is-your-team" : ""}`} title={`Team ${roomCode === "practice" || localMatchRef.current ? offlineTeamName : "Alpha"}: ${scores.Alpha || 0}/7 letters`}>
                      <span className="team-dot alpha" />
                      <span className="team-abbr">{roomCode === "practice" || localMatchRef.current ? offlineTeamName : "Alpha"}</span>
                      <strong className="team-count">{scores.Alpha || 0}</strong>
                    </div>

                    <div className="scoreboard-mid-pill">
                      <span className="round-text">RD {round}</span>
                    </div>

                    <div className={`score-badge bravo ${you.team === "Bravo" ? "is-your-team" : ""}`} title={`Team Bravo: ${scores.Bravo || 0}/7 letters`}>
                      <strong className="team-count">{scores.Bravo || 0}</strong>
                      <span className="team-abbr">Bravo</span>
                      <span className="team-dot bravo" />
                    </div>
                  </div>

                  {/* Secret Partner Cue Reminder (Clicking opens menu for details) */}
                  <button
                    type="button"
                    className="table-team-signal-pill"
                    onClick={() => setTableMenuOpen(true)}
                    title={`Private cue: ${selectedSignalMeta.label}. Tap to view secret cue in match menu.`}
                    aria-label={`Partner secret cue: ${selectedSignalMeta.label}`}
                  >
                    <span className="signal-pill-lock">🤝</span>
                    <span className="signal-pill-icon">{selectedSignalMeta.symbol}</span>
                    <span className="signal-pill-name">{selectedSignalMeta.label}</span>
                  </button>
                </div>

                {/* Right: Quick React + Table Menu Toggle */}
                <div className="table-topbar-right">
                  <div className="reaction-dropdown-anchor">
                    <button
                      type="button"
                      className={`table-react-toggle ${reactionMenuOpen ? "active" : ""}`}
                      aria-expanded={reactionMenuOpen}
                      onClick={() => setReactionMenuOpen((o) => !o)}
                      title="React"
                    >
                      <span>😊</span>
                      <span className="react-toggle-label">React</span>
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

                  {/* Table Menu Toggle Button */}
                  <button
                    type="button"
                    className={`table-menu-toggle-btn ${tableMenuOpen ? "active" : ""}`}
                    onClick={() => setTableMenuOpen(true)}
                    title="Match Menu, Music & Details"
                    aria-label="Open match details and settings"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </button>
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

                {/* Center Table Stage: Live Signal Broadcasts, Complete Card Alerts & Turn Info */}
                <div className="table-center-void">
                  {/* 1. Active Live Signal Broadcast (Middle of Table Alert - Neutral & Unspoiled) */}
                  {activeSignalBurst ? (
                    <div
                      key={activeSignalBurst.id}
                      className="center-signal-broadcast table-alert-card"
                      role="alert"
                    >
                      <div className="broadcast-header-tag">
                        <span>👁️ SIGNAL</span>
                      </div>

                      <div className="broadcast-body">
                        <span className="broadcast-symbol-glow">{activeSignalBurst.symbol}</span>
                        <div className="broadcast-text-stack">
                          <strong className="broadcast-main-heading">
                            {activeSignalBurst.playerName} raised a signal
                          </strong>
                        </div>

                        {/* Instant reflex actions */}
                        {activeSignalBurst.playerId === partner?.id && (
                          <button
                            type="button"
                            className="center-quick-action-btn jackpot-action"
                            onClick={onJackpot}
                          >
                            ♛ CALL JACKPOT!
                          </button>
                        )}
                        {activeSignalBurst.playerId !== partner?.id && activeSignalBurst.playerId !== viewerPlayerId && (
                          <button
                            type="button"
                            className="center-quick-action-btn suspect-action"
                            disabled={suspectAttemptsLeft <= 0}
                            onClick={() => onSuspect(activeSignalBurst.playerId)}
                          >
                            🚨 SUSPECT! ({suspectAttemptsLeft})
                          </button>
                        )}
                      </div>
                    </div>
                  ) : yourFour ? (
                    /* 2. Complete Card Alert (Middle of Table Alert) */
                    <div
                      className={`center-cards-alert table-alert-card ${(you?.hand.length ?? 0) > 4 ? "has-fifth-card" : "ready-to-signal"}`}
                      role="status"
                    >
                      {(you?.hand.length ?? 0) > 4 ? (
                        <>
                          <span className="center-alert-symbol">⚠️</span>
                          <div className="center-alert-text">
                            <strong className="center-alert-heading">Pass 5th card to signal</strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="center-alert-symbol">⚡</span>
                          <div className="center-alert-text">
                            <strong className="center-alert-heading">Ready to signal {partnerName}</strong>
                          </div>
                          <button
                            type="button"
                            className="center-quick-action-btn signal-action"
                            onClick={onSignal}
                          >
                            {selectedSignalMeta.symbol} FLASH SIGNAL
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    /* 3. Default Center Void with Turn Callout */
                    <>
                      <div className="table-crown" aria-hidden>♛</div>
                      <span className="void-mark">JACKPOT TABLE</span>

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
                    </>
                  )}
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
                        if (isTutorialMatch && (tutorialStep === "table_pick_card" || tutorialStep === "table_cards_intro")) {
                          setTutorialStep("table_pass_first_card");
                        }
                      }}
                      reaction={reactionBursts.filter((entry) => entry.playerId === player.id).at(-1)}
                      hasFourOfAKind={player.id === viewerPlayerId && Boolean(yourFour) && player.hand.length === 4}
                      activeSignal={playerSignal}
                      isTutorialPickCard={isTutorialMatch && (tutorialStep === "table_pick_card" || (tutorialStep === "table_cards_intro" && !selectedCardId))}
                      canSuspect={!busy && suspectAttemptsLeft > 0}
                      onSuspectTarget={(targetId) => onSuspect(targetId)}
                    />
                  );
                })}

                {/* Bottom Action Dock: Exactly 4 Actions, Zero Duplication */}
                <div className="table-action-dock" role="region" aria-label="Game actions">
                  {/* PASS CARD */}
                  <div style={{ position: "relative", flex: 1, display: "flex" }}>
                    {isTutorialMatch && tutorialStep === "table_pass_first_card" && (
                      <div className="tutorial-dock-pointer" aria-hidden="true">
                        <span className="pointer-finger">👉</span>
                        <span className="pointer-label">TOUCH PASS</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className={`dock-action-btn pass ${isYourPass && selectedCardId ? "ready-to-pass" : ""} ${isTutorialMatch && tutorialStep === "table_pass_first_card" ? "tutorial-spotlight-btn" : ""}`}
                      disabled={!isYourPass || !selectedCardId || busy}
                      onClick={onPassSelected}
                      title={isYourPass ? (selectedCardId ? "Pass selected card to next player" : "Select a card from hand") : "Wait for your turn"}
                    >
                      <span className="dock-btn-icon">↗</span>
                      <span className="dock-btn-label-group">
                        <strong>PASS</strong>
                        <small className="dock-btn-sub">CARD</small>
                      </span>
                    </button>
                  </div>

                  {/* JACKPOT */}
                  <div style={{ position: "relative", flex: 1, display: "flex" }}>
                    {isTutorialMatch && tutorialStep === "table_partner_signal_detected" && (
                      <div className="tutorial-dock-pointer" aria-hidden="true">
                        <span className="pointer-finger">🔥</span>
                        <span className="pointer-label">CALL JACKPOT!</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className={`dock-action-btn jackpot ${isTutorialMatch && tutorialStep === "table_partner_signal_detected" ? "tutorial-spotlight-btn jackpot-glow" : ""}`}
                      disabled={busy}
                      onClick={onJackpot}
                      title="Call JACKPOT when your partner flashes their cue!"
                    >
                      <span className="dock-btn-icon crown">♛</span>
                      <span className="dock-btn-label-group">
                        <strong>JACKPOT!</strong>
                        <small className="dock-btn-sub">CALL</small>
                      </span>
                    </button>
                  </div>

                  {/* SIGNAL */}
                  <div className="signal-dropdown-group" style={{ flex: 1, display: "flex" }}>
                    <button
                      type="button"
                      className={`dock-action-btn signal ${(you?.hand.length ?? 0) > 4 ? "has-fifth-card" : ""}`}
                      disabled={busy}
                      aria-expanded={signalMenuOpen}
                      onClick={() => setSignalMenuOpen((open) => !open)}
                      title={(you?.hand.length ?? 0) > 4 ? "Pass 5th card first before signaling!" : "Flash or fake your secret cue"}
                    >
                      <span className="dock-btn-icon">{selectedSignalMeta.symbol}</span>
                      <span className="dock-btn-label-group">
                        <strong>SIGNAL</strong>
                        <small className="dock-btn-sub">CUE ▾</small>
                      </span>
                    </button>
                    {signalMenuOpen && (
                      <div className="signal-dock-menu">
                        <button type="button" onClick={onSignal} className="signal-menu-item">
                          <span className="menu-cue-icon">{selectedSignalMeta.symbol}</span>
                          <div className="menu-text">
                            <strong>Flash Signal</strong>
                            <small>{selectedSignalMeta.label}</small>
                          </div>
                        </button>
                        <button type="button" onClick={onFakeSignal} className="signal-menu-item decoy">
                          <span className="menu-cue-icon">🎭</span>
                          <div className="menu-text">
                            <strong>Fake Signal</strong>
                            <small>Bluff decoy gesture</small>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SUSPECT */}
                  <div style={{ position: "relative", flex: 1, display: "flex" }}>
                    {isTutorialMatch && tutorialStep === "round2_suspicious_gesture" && (
                      <div className="tutorial-dock-pointer" aria-hidden="true">
                        <span className="pointer-finger">🚨</span>
                        <span className="pointer-label">TOUCH SUSPECT!</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className={`dock-action-btn suspect ${isTutorialMatch && tutorialStep === "round2_suspicious_gesture" ? "tutorial-spotlight-btn suspect-glow" : ""}`}
                      disabled={busy || suspectAttemptsLeft <= 0}
                      onClick={() => onSuspect()}
                      title={`Call SUSPECT! Tap an opponent's profile directly or click here (${suspectAttemptsLeft} calls remaining).`}
                    >
                      <span className="dock-btn-icon">🎯</span>
                      <span className="dock-btn-label-group">
                        <strong>SUSPECT</strong>
                        <small className="dock-btn-sub">({suspectAttemptsLeft})</small>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Suspect Quick Reveal Feedback */}
            {suspectRevealing && (
              <div className="table-suspense-overlay" aria-live="assertive">
                <div className="suspense-card">
                  {suspectRevealPreview ? (
                    <>
                      <span className="suspense-eyebrow">SUSPECT CHECK</span>
                      <h3>{suspectRevealPreview.targetName} reveals 2 cards</h3>
                      <div className="suspect-proof-cards" aria-label="Suspect reveal preview">
                        {suspectRevealPreview.cards.map((card) => (
                          <WhotCard key={`suspect-proof-${card.id}`} card={card} compact />
                        ))}
                      </div>
                      <p>
                        {suspectRevealPreview.isRefuted
                          ? "Two different cards shown — no complete set."
                          : "Matching cards shown — complete set confirmed."}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="suspense-radar-ring" />
                      <span className="suspense-icon">🔍</span>
                      <span className="suspense-eyebrow">FASTEST FINGERS</span>
                      <h3>VERIFYING OPPONENT HANDS...</h3>
                      <p>Interception call dispatched!</p>
                    </>
                  )}
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



            {/* Table Match Menu & Details Modal */}
            {tableMenuOpen && (
              <div className="table-modal-backdrop table-menu-backdrop" role="dialog" aria-modal="true">
                <div className="table-modal-card table-menu-modal">
                  <div className="table-menu-modal-header">
                    <div className="modal-title-lock">
                      <span className="modal-crown">♛</span>
                      <h3>Match Details &amp; Settings</h3>
                    </div>
                    <button
                      type="button"
                      className="table-modal-close-icon"
                      onClick={() => setTableMenuOpen(false)}
                      aria-label="Close menu"
                    >
                      ×
                    </button>
                  </div>

                  <div className="table-menu-modal-body">
                    {/* Player Info Card */}
                    <div className="menu-detail-card">
                      <div className="menu-detail-header">
                        <span className="detail-tag">ACTIVE PLAYER</span>
                        <span className="room-sub-tag">ROOM: {roomCode?.toUpperCase() || "PRACTICE"}</span>
                      </div>
                      <div className="menu-player-row">
                        <div className={`menu-player-dot ${you.team.toLowerCase()}`} />
                        <strong className="menu-player-name">{nickname || you.name}</strong>
                        <span className={`viewer-team-tag ${you.team.toLowerCase()}`}>{you.team} TEAM</span>
                        {(localMatchRef.current || roomCode === "practice") && (
                          <span className={`viewer-diff-tag ${botDifficulty}`} title={`Bot Difficulty: ${botDifficulty.toUpperCase()}`}>
                            {botDifficulty === "easy" ? "🟢 EASY" : botDifficulty === "normal" ? "🟡 NORMAL" : "🔴 HARD"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Secret Cue Card */}
                    <div className="menu-detail-card">
                      <span className="detail-tag">SECRET PARTNER CUE</span>
                      <div className="menu-cue-row">
                        <span className="menu-cue-symbol">{selectedSignalMeta.symbol}</span>
                        <div className="menu-cue-info">
                          <strong>{selectedSignalMeta.label}</strong>
                          <small>{selectedSignalMeta.description}</small>
                        </div>
                      </div>
                    </div>

                    {/* Music & Audio Controls Card */}
                    <div className="menu-detail-card music-audio-card">
                      <span className="detail-tag">MUSIC &amp; AUDIO CONTROLS</span>
                      <div className="menu-music-wrap">
                        <MiniMusicPlayer />
                      </div>
                    </div>

                    {/* Match Standings */}
                    <div className="menu-detail-card">
                      <span className="detail-tag">MATCH RACE STANDINGS (7 LETTERS TO WIN)</span>
                      <div className="menu-race-teams">
                        {(["Alpha", "Bravo"] as const).map((team) => {
                          const count = scores[team] || 0;
                          const isYourTeam = you.team === team;
                          return (
                            <div key={team} className={`menu-race-team-row ${team.toLowerCase()} ${isYourTeam ? "is-your-team" : ""}`}>
                              <div className="menu-race-meta">
                                <span className={`team-dot ${team.toLowerCase()}`} />
                                <span className="team-title">TEAM {team.toUpperCase()}{isYourTeam ? " (YOU)" : ""}</span>
                                <strong className="team-score-num">{count}/7</strong>
                              </div>
                              <div className="menu-letters-track">
                                {JACKPOT_LETTERS.map((letter, idx) => (
                                  <span
                                    key={`menu-race-${team}-${letter}-${idx}`}
                                    className={`menu-letter-pill ${count > idx ? "earned" : "empty"}`}
                                  >
                                    {letter}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Rules Quick Recap */}
                    <div className="menu-detail-card rules-card">
                      <span className="detail-tag">HOW TO PLAY RECAP</span>
                      <ul className="menu-rules-bullets">
                        <li>Pass 1 card clockwise when it is your turn.</li>
                        <li>Collect 4 cards of the same suit to get 4 of a kind.</li>
                        <li>Flash your secret cue to your partner without opponents noticing!</li>
                        <li>Teammate calls JACKPOT to score a letter toward J-A-C-K-P-O-T.</li>
                        <li>If you spot an opponent signaling, tap SUSPECT to intercept and steal the point!</li>
                      </ul>
                    </div>
                  </div>

                  <div className="table-menu-modal-footer">
                    <button
                      type="button"
                      className="table-modal-btn exit-danger-btn"
                      onClick={() => {
                        setTableMenuOpen(false);
                        setExitConfirmOpen(true);
                      }}
                    >
                      <span>🚪 Leave Match</span>
                    </button>
                    <button
                      type="button"
                      className="table-modal-btn cancel-btn"
                      onClick={() => setTableMenuOpen(false)}
                    >
                      Return to Table
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

        {screen === "result" && (
          result ? (
            <section className="result-screen" aria-label="Match Results">
              {result.valid ? (
                <div className="confetti-burst" aria-hidden="true">
                  {Array.from({ length: 36 }, (_, index) => (
                    <i
                      key={index}
                      style={{
                        left: `${(index * 27) % 100}%`,
                        animationDelay: `${(index % 10) * 0.08}s`,
                        backgroundColor: ["#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#fef08a"][index % 5],
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {/* Minimal Topbar: No clutter, fast exit & share */}
              <header className="result-minimal-topbar">
                <button
                  type="button"
                  className="result-topbar-btn"
                  onClick={handleExitHome}
                  title="Exit to Main Menu"
                >
                  <ResultExitIcon />
                  <span>Exit</span>
                </button>

                <div className="result-topbar-center">
                  <span className="result-topbar-badge">
                    <span className="result-badge-dot" />
                    ROUND {round} RESOLVED
                  </span>
                </div>

                <button
                  type="button"
                  className="result-topbar-btn"
                  onClick={handleShareResult}
                  title="Share Results"
                >
                  <ResultShareIcon />
                  <span className="desktop-only-inline">Share</span>
                </button>
              </header>

              {/* Main Balanced Board: Zero Scroll on Desktop and Mobile */}
              <div className="result-screen-inner">
                {/* Hero Outcome Section */}
                <div className="result-hero-section">
                  <div className={`result-emblem-badge ${result.valid ? "emblem-gold" : "emblem-ruby"}`}>
                    {result.valid ? <ResultTrophyIcon /> : <ResultAlertIcon />}
                  </div>

                  <div className="result-tag-cluster">
                    <span className={`result-status-pill ${result.valid ? "status-win" : "status-miss"}`}>
                      <ResultSparkleIcon />
                      <span>{result.valid ? "JACKPOT SCORED" : "FALSE CALL / BLUFF BUSTED"}</span>
                    </span>
                  </div>

                  <div className="result-narrative">
                    <h2 className="result-headline">{result.title}</h2>
                    <p className="result-description">{result.detail}</p>
                  </div>
                </div>

                {/* Match Race Standings: 7 Letter Tracker */}
                <div className="result-race-board">
                  <div className="result-race-header">
                    <span className="race-header-title">
                      <ResultFlagIcon />
                      <span>MATCH RACE STANDINGS</span>
                    </span>
                    <span className="race-header-subtitle">Spell J-A-C-K-P-O-T to win</span>
                  </div>

                  <div className="result-race-tracks">
                    {scoreTeams.map((team) => {
                      const count = Math.min(7, Math.max(0, scores[team] ?? 0));
                      const isLeader = count === Math.max(...scoreTeams.map((t) => scores[t] ?? 0));
                      return (
                        <div key={team} className={`result-team-track ${isLeader && count > 0 ? "leader-track" : ""}`}>
                          <div className="team-track-info">
                            <span className="team-track-name">
                              {team === "Alpha" && (roomCode === "practice" || localMatchRef.current)
                                ? offlineTeamName
                                : team}
                            </span>
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

                {/* Action Buttons: Always in Sight */}
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
                      <ResultSparkleIcon />
                      <span>
                        {(matchWonTeam || scores.Alpha >= WINNING_SCORE || scores.Bravo >= WINNING_SCORE)
                          ? "RUN IT BACK (NEW MATCH)"
                          : `START NEXT ROUND (ROUND ${round + 1})`}
                      </span>
                      <ResultArrowRightIcon />
                    </button>
                  )}

                  <div className="result-secondary-row">
                    <button
                      type="button"
                      className="result-secondary-btn"
                      onClick={handleShareResult}
                    >
                      <ResultShareIcon />
                      <span>Share Results</span>
                    </button>
                    <button
                      type="button"
                      className="result-exit-btn"
                      onClick={handleExitHome}
                    >
                      <ResultExitIcon />
                      <span>Exit to Menu</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="result-screen result-fallback-screen" aria-label="Round Summary">
              <header className="result-minimal-topbar">
                <button
                  type="button"
                  className="result-topbar-btn"
                  onClick={handleExitHome}
                  title="Exit to Main Menu"
                >
                  <ResultExitIcon />
                  <span>Exit</span>
                </button>
                <div className="result-topbar-center">
                  <span className="result-topbar-badge">
                    <span className="result-badge-dot" />
                    MATCH STANDINGS
                  </span>
                </div>
                <button
                  type="button"
                  className="result-topbar-btn"
                  onClick={handleShareResult}
                  title="Share Results"
                >
                  <ResultShareIcon />
                  <span className="desktop-only-inline">Share</span>
                </button>
              </header>

              <div className="result-screen-inner">
                <div className="result-hero-section">
                  <div className="result-emblem-badge emblem-gold">
                    <ResultTrophyIcon />
                  </div>
                  <div className="result-narrative">
                    <h2 className="result-headline">Round Standings</h2>
                    <p className="result-description">
                      {roomCode === "practice" || localMatchRef.current
                        ? "Ready to deal the next round with your AI partner!"
                        : "Round concluded. Ready to continue match."}
                    </p>
                  </div>
                </div>

                <div className="result-race-board">
                  <div className="result-race-header">
                    <span className="race-header-title">
                      <ResultFlagIcon />
                      <span>MATCH RACE STANDINGS</span>
                    </span>
                    <span className="race-header-subtitle">Spell J-A-C-K-P-O-T to win</span>
                  </div>
                  <div className="result-race-tracks">
                    {scoreTeams.map((team) => {
                      const count = Math.min(7, Math.max(0, scores[team] ?? 0));
                      const isLeader = count === Math.max(...scoreTeams.map((t) => scores[t] ?? 0));
                      return (
                        <div key={team} className={`result-team-track ${isLeader && count > 0 ? "leader-track" : ""}`}>
                          <div className="team-track-info">
                            <span className="team-track-name">
                              {team === "Alpha" && (roomCode === "practice" || localMatchRef.current)
                                ? offlineTeamName
                                : team}
                            </span>
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

                <div className="result-action-panel">
                  <button
                    type="button"
                    className="result-primary-btn"
                    onClick={() => {
                      if (roomCode === "practice" || localMatchRef.current) {
                        void handleNextRound();
                      } else {
                        navigate("table", roomCode || "practice");
                      }
                    }}
                  >
                    <ResultSparkleIcon />
                    <span>{roomCode === "practice" || localMatchRef.current ? `START ROUND ${round + 1}` : "RETURN TO TABLE"}</span>
                    <ResultArrowRightIcon />
                  </button>
                  <div className="result-secondary-row">
                    <button
                      type="button"
                      className="result-exit-btn"
                      onClick={handleExitHome}
                      style={{ gridColumn: "span 2" }}
                    >
                      <ResultExitIcon />
                      <span>Exit to Main Menu</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )
        )}
      </div>
      {tableToasts.length ? <div className="table-toast-region" role="region" aria-label="Game notifications" aria-live="polite">
        {tableToasts.map((toast) => <div key={toast.id} className={`table-toast toast-${toast.kind}`}>
          <span className="toast-kind-icon" aria-hidden>{toast.kind === "success" ? "✓" : toast.kind === "warning" ? "!" : toast.kind === "error" ? "×" : toast.kind === "game" ? "♛" : "•"}</span>
          <span><strong>{toast.title}</strong><small>{toast.message}</small></span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setTableToasts((current) => current.filter((entry) => entry.id !== toast.id))}>×</button>
        </div>)}
      </div> : null}

            {/* Round Secret Signal Pick Modal (Choose new cue before next round) */}
            {roundSignalPickOpen && (
              <div className="table-modal-backdrop round-signal-backdrop" role="dialog" aria-modal="true">
                <div className="table-modal-card round-signal-modal">
                  <div className="table-menu-modal-header">
                    <div className="modal-title-lock">
                      <span className="modal-crown">🔄</span>
                      <h3>Round {round + 1}: Switch Secret Signal</h3>
                    </div>
                    <button
                      type="button"
                      className="table-modal-close-icon"
                      onClick={() => setRoundSignalPickOpen(false)}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  <div className="round-signal-body">
                    <div className="signal-compromised-banner">
                      <span className="banner-icon">⚠️</span>
                      <div className="banner-text">
                        <strong>PREVIOUS SIGNAL EXPOSED</strong>
                        <p>
                          Your cue ({selectedSignalMeta.symbol} {selectedSignalMeta.label}) was spotted or resolved!
                          Agree on a fresh secret signal with {partnerName} before dealing Round {round + 1}:
                        </p>
                      </div>
                    </div>

                    <div className="round-signals-grid">
                      {signalLibrary.map((signal) => {
                        const isSelected = selectedSignal === signal.id;
                        return (
                          <button
                            key={signal.id}
                            type="button"
                            className={`round-signal-choice-card ${isSelected ? "selected" : ""}`}
                            onClick={() => setSelectedSignal(signal.id)}
                          >
                            <span className="choice-icon">{signal.symbol}</span>
                            <strong className="choice-label">{signal.label}</strong>
                            <span className="choice-desc">{signal.description}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="round-signal-modal-footer">
                      <button
                        type="button"
                        className="table-modal-btn confirm-jackpot-btn"
                        onClick={() => {
                          void handleNextRoundWithSignal(selectedSignal);
                        }}
                      >
                        <span>Deal Round {round + 1} with {selectedSignalMeta.symbol} {selectedSignalMeta.label} ➔</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
      {/* 1. First Visit Username Modal */}
      {firstVisitModalOpen && (
        <div className="table-modal-backdrop first-visit-backdrop" role="dialog" aria-modal="true">
          <div className="table-modal-card first-visit-card">
            <div className="first-visit-badge">👋</div>
            <h2>What should we call you?</h2>
            <p className="first-visit-desc">
              Choose your player nickname to enter Jackpot. You can start playing immediately as a Guest!
            </p>
            <form
              className="first-visit-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleCompleteFirstVisit();
              }}
            >
              <input
                type="text"
                className="first-visit-input"
                placeholder="e.g. Ace, Lucky, Chioma..."
                value={firstVisitName}
                onChange={(e) => setFirstVisitName(e.target.value)}
                maxLength={MAX_PLAYER_NAME_LENGTH}
                autoFocus
              />
              <button
                type="submit"
                className="game-primary-btn first-visit-submit-btn"
                disabled={!firstVisitName.trim()}
              >
                Continue to Game ➔
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Interactive Tutorial Floating HUD Banner (Subway Surfers Style) */}
      {isTutorialMatch && tutorialStep && (
        <div className="tutorial-hud-overlay" role="region" aria-label="Interactive Game Tutorial">
          <div className="tutorial-hud-banner">
            <div className="tutorial-hud-top-bar">
              <span className="tutorial-hud-badge">
                <span className="hud-badge-pulse" />
                {TUTORIAL_COACHMARKS[tutorialStep]?.badge ?? "TUTORIAL"}
              </span>
              <button
                type="button"
                className="tutorial-hud-skip-btn"
                onClick={() => {
                  setIsTutorialMatch(false);
                  setTutorialStep(null);
                  setTutorialCompleted(true);
                  showTableToast("info", "Tutorial Skipped", "You can now play freely!");
                }}
              >
                Skip Tutorial ✕
              </button>
            </div>

            <div className="tutorial-hud-body">
              <h3 className="tutorial-hud-title">
                {TUTORIAL_COACHMARKS[tutorialStep]?.title}
              </h3>
              <p className="tutorial-hud-desc">
                {TUTORIAL_COACHMARKS[tutorialStep]?.description}
              </p>
            </div>

            <div className="tutorial-hud-actions">
              <button
                type="button"
                className="tutorial-hud-next-btn"
                onClick={handleTutorialNext}
              >
                <span>{TUTORIAL_COACHMARKS[tutorialStep]?.actionText || "Next ➔"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. End of Guest Session Summary Modal */}
      {sessionSummaryOpen && (
        <div className="table-modal-backdrop" role="dialog" aria-modal="true">
          <div className="table-modal-card session-summary-card">
            <span className="modal-category-tag">SESSION COMPLETE</span>
            <h3 className="session-summary-title">Your Match Record</h3>
            <p className="session-summary-subtitle">Here is how you performed this session:</p>

            <div className="session-stats-grid">
              <div className="stat-badge-box">
                <span className="stat-badge-val">{matchStats.roundsPlayed}</span>
                <span className="stat-badge-lbl">Rounds</span>
              </div>
              <div className="stat-badge-box">
                <span className="stat-badge-val">{matchStats.jackpotsCalled}</span>
                <span className="stat-badge-lbl">Jackpots</span>
              </div>
              <div className="stat-badge-box">
                <span className="stat-badge-val">{matchStats.suspectsCaught}</span>
                <span className="stat-badge-lbl">Catches</span>
              </div>
              <div className="stat-badge-box">
                <span className="stat-badge-val">{scores.Alpha}</span>
                <span className="stat-badge-lbl">Wins</span>
              </div>
            </div>

            <div className="session-account-pitch-box">
              <strong className="pitch-heading">
                <span>⭐</span> Save Your Jackpot Record
              </strong>
              <p className="pitch-desc">
                Create a free account to preserve these stats in Neon DB, unlock 6 AI partner personalities, and customize your profile!
              </p>
            </div>

            <div className="session-actions-stack">
              <button
                type="button"
                className="game-primary-btn session-save-cta-btn"
                onClick={() => {
                  setAuthMode("register");
                  setAuthUsername(nickname || "Player");
                  setSessionSummaryOpen(false);
                  setAuthModalOpen(true);
                }}
              >
                <span>Create Free Account &amp; Save Stats ➔</span>
              </button>
              <button
                type="button"
                className="session-exit-ghost-btn"
                onClick={() => {
                  setSessionSummaryOpen(false);
                  navigate("home");
                }}
              >
                Discard &amp; Exit to Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Account Registration & Login Modal (Neon DB Synced) */}
      {authModalOpen && (
        <div className="table-modal-backdrop" role="dialog" aria-modal="true">
          <div className="table-modal-card account-modal-card">
            <div className="account-modal-header">
              <h3 className="account-modal-title">
                {authMode === "register" ? "Create Free Account" : "Log In to Account"}
              </h3>
              <button
                type="button"
                className="table-modal-close-icon"
                onClick={() => setAuthModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="account-modal-tabs">
              <button
                type="button"
                className={`account-tab-btn ${authMode === "register" ? "active" : ""}`}
                onClick={() => setAuthMode("register")}
              >
                Create Account
              </button>
              <button
                type="button"
                className={`account-tab-btn ${authMode === "login" ? "active" : ""}`}
                onClick={() => setAuthMode("login")}
              >
                Log In
              </button>
            </div>

            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", marginBottom: "16px" }}>
              {authMode === "register"
                ? "Your guest gameplay record will automatically migrate into your permanent Neon DB profile!"
                : "Enter your username and PIN to load your permanent profile and stats from Neon DB."}
            </p>

            <form
              className="account-form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (authMode === "register") {
                  handleRegisterAccount();
                } else {
                  void handleLoginAccount();
                }
              }}
            >
              <div className="account-input-wrap">
                <label>Player Username</label>
                <input
                  type="text"
                  placeholder="e.g. Ace, Lucky, Chioma..."
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  maxLength={MAX_PLAYER_NAME_LENGTH}
                  required
                  autoFocus
                />
              </div>

              <div className="account-input-wrap">
                <label>Password or PIN (Quick access)</label>
                <input
                  type="password"
                  placeholder="Enter a password or 4-digit PIN"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              {authMode === "register" && (
                <div className="account-input-wrap">
                  <label>Email (Optional for recovery)</label>
                  <input
                    type="email"
                    placeholder="yourname@example.com (optional)"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>
              )}

              <button
                type="submit"
                className="game-primary-btn"
                style={{ width: "100%", marginTop: "8px", padding: "13px" }}
                disabled={!authUsername.trim()}
              >
                {authMode === "register" ? "Save My Stats & Create Account ➔" : "Log In & Sync Profile ➔"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Profile Setup Modal (Post-Registration Customization) */}
      {profileSetupOpen && (
        <div className="table-modal-backdrop" role="dialog" aria-modal="true">
          <div className="table-modal-card account-modal-card" style={{ maxWidth: "540px" }}>
            <div className="account-modal-header">
              <h3 className="account-modal-title">Profile Customization</h3>
              <button
                type="button"
                className="table-modal-close-icon"
                onClick={() => setProfileSetupOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", marginBottom: "12px" }}>
              Welcome to verified play! Choose your avatar, player title, and permanent AI partner:
            </p>

            {/* Avatar Picker */}
            <div className="profile-setup-section-title">Select Avatar Badge</div>
            <div className="avatar-grid-picker">
              {AVAILABLE_AVATARS.map((av) => (
                <button
                  key={av.id}
                  type="button"
                  className={`avatar-choice-card ${selectedAvatar === av.emoji ? "selected" : ""}`}
                  onClick={() => setSelectedAvatar(av.emoji)}
                >
                  <span className="avatar-emoji-glyph">{av.emoji}</span>
                  <span className="avatar-choice-lbl">{av.label}</span>
                </button>
              ))}
            </div>

            {/* Title Picker */}
            <div className="profile-setup-section-title">Select Player Title</div>
            <div className="title-chips-wrap">
              {AVAILABLE_TITLES.map((tit) => (
                <button
                  key={tit}
                  type="button"
                  className={`title-chip-btn ${selectedTitle === tit ? "selected" : ""}`}
                  onClick={() => setSelectedTitle(tit)}
                >
                  {tit}
                </button>
              ))}
            </div>

            {/* Partner Selection */}
            <div className="profile-setup-section-title">Unlocked AI Partner</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "14px" }}>
              {ALL_ARCHETYPE_IDS.map((aid) => {
                const b = BOT_ARCHETYPES[aid];
                const isSel = selectedPartnerId === aid;
                return (
                  <button
                    key={aid}
                    type="button"
                    className={`avatar-choice-card ${isSel ? "selected" : ""}`}
                    onClick={() => setSelectedPartnerId(aid)}
                  >
                    <span className="avatar-emoji-glyph">{b.avatar}</span>
                    <span className="avatar-choice-lbl" style={{ fontWeight: 800 }}>{b.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="profile-setup-footer">
              <button
                type="button"
                className="game-ghost-btn"
                onClick={() => {
                  setProfileSetupOpen(false);
                  navigate("home");
                }}
              >
                Skip for Now
              </button>
              <button
                type="button"
                className="game-primary-btn"
                onClick={handleSaveProfile}
              >
                Save Profile &amp; Play ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function TableSeat({
  player,
  visualIndex,
  playerCount,
  isActive,
  isYou,
  isTeammate,
  peek,
  selectedCardId,
  canSelect,
  onSelectCard,
  reaction,
  hasFourOfAKind,
  activeSignal,
  isTutorialPickCard,
  onSuspectTarget,
  canSuspect,
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
  isTutorialPickCard?: boolean;
  onSuspectTarget?: (targetPlayerId: string) => void;
  canSuspect?: boolean;
}) {
  const seatClass = SEAT_CLASS_BY_COUNT[playerCount]?.[visualIndex] ?? SEAT_CLASS_BY_COUNT[8][visualIndex];
  const count = player.hand.length;
  const showFaces = isYou || peek;
  const isOpponent = !isYou && !isTeammate;

  return (
    <div
      className={[
        "table-seat",
        seatClass,
        isActive ? "is-active" : "",
        player.isStarter ? "is-starter" : "",
        isYou ? "is-you" : "",
        isOpponent ? "is-opponent-targetable" : "",
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
      {reaction && (
        <div
          key={reaction.id}
          className={`reaction-burst-bubble ${activeSignal ? "reaction-elevated" : ""}`}
          aria-label={`${reaction.playerName} reacted`}
        >
          <span className="reaction-burst-symbol">
            {quickReactions.find((item) => item.id === reaction.reactionId)?.symbol ?? "✨"}
          </span>
          {reaction.reactionId === "eyes" && <span className="reaction-saw-that-text">I saw that!</span>}
        </div>
      )}

      {/* Player Plaque (Avatar, Name, Team, Status) - Always above cards */}
      <div
        className={[
          "player-plaque",
          isYou ? "you" : "",
          isActive ? "active-passer" : "",
          isOpponent && canSuspect ? "opponent-suspect-clickable" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (isOpponent && canSuspect && onSuspectTarget) {
            onSuspectTarget(player.id);
          }
        }}
        title={isOpponent && canSuspect ? `Tap to SUSPECT ${player.name}!` : undefined}
      >
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
          ) : isOpponent && canSuspect ? (
            <span className="player-suspect-cue-tag">🎯 TAP TO SUSPECT</span>
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
            const isTutorialTarget = Boolean(isYou && isTutorialPickCard && (card.suit === "triangle" || card.id === "tut1-h-triangle-4"));
            return (
              <div key={card.id} style={{ position: "relative" }}>
                {isTutorialTarget && (
                  <div className="tutorial-card-pointer" aria-hidden="true">
                    <span className="pointer-finger">👆</span>
                    <span className="pointer-label">PICK THIS</span>
                  </div>
                )}
                <WhotCard
                  card={card}
                  selected={isYou && selectedCardId === card.id}
                  className={`${isMatch ? "is-four-matching" : ""} ${isTutorialTarget ? "tutorial-spotlight-card" : ""}`}
                  onClick={
                    isYou && canSelect
                      ? () => onSelectCard(card.id)
                      : undefined
                  }
                  compact={!isYou}
                />
              </div>
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

function ResultTrophyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}

function ResultAlertIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ResultFlagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function ResultSparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

function ResultArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ResultShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function ResultExitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
