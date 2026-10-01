"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CardFan, WhotCard } from "@/components/WhotCard";
import { DEFAULT_PLAYER_NAMES, type PlayerSlot, type Team } from "@/lib/deck";
import {
  type GameSnapshot,
  type RoundResult,
  type ScoreBoard,
  applyRoundScore,
  chooseAiPassCard,
  createMatch,
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
  type LocalRoom,
  type LocalSession,
  readSession,
  updateRoomForPlayer,
  writeSession,
} from "@/lib/session";

export type Screen = "home" | "create" | "join" | "lobby" | "teams" | "signal" | "table" | "result" | "howto";

const signalLibrary = [
  { id: "wave", label: "Wave", symbol: "≋" },
  { id: "clap", label: "Clap", symbol: "∥" },
  { id: "jump", label: "Jump", symbol: "↟" },
  { id: "crouch", label: "Crouch", symbol: "⌁" },
  { id: "spin", label: "Spin", symbol: "⟳" },
  { id: "point", label: "Point", symbol: "➤" },
  { id: "salute", label: "Salute", symbol: "⌑" },
  { id: "nod", label: "Nod", symbol: "↕" },
  { id: "flash", label: "Flash", symbol: "✦" },
  { id: "dance", label: "Dance", symbol: "∿" },
];

const quickReactions = [
  { id: "laugh", symbol: "😂", label: "Laugh" },
  { id: "wow", symbol: "😮", label: "Wow" },
  { id: "clap", symbol: "👏", label: "Clap" },
  { id: "fire", symbol: "🔥", label: "Fire" },
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
  const [nickname, setNickname] = useState("Maya");
  const [roomCode, setRoomCode] = useState("");
  const [privateRoom, setPrivateRoom] = useState(true);
  const [room, setRoom] = useState<LocalRoom | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
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
  const [teamSignalSelectedBy, setTeamSignalSelectedBy] = useState("");
  const [teamMates, setTeamMates] = useState<Array<{ id: string; nickname: string }>>([]);

  const [signalFlash, setSignalFlash] = useState(false);
  const [signalClock, setSignalClock] = useState(0);
  const [signalMenuOpen, setSignalMenuOpen] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [tableToasts, setTableToasts] = useState<TableToast[]>([]);
  const [passFlight, setPassFlight] = useState<PassFlight | null>(null);
  const [reactionBursts, setReactionBursts] = useState<ReactionEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const lastPassEventId = useRef("");
  const lastReactionEventId = useRef("");
  const sharedRoomRevision = useRef(0);
  const roomRecoveryAttempted = useRef("");
  const lastSignalEventId = useRef("");
  const lastGameNoticeId = useRef("");
  const toastTimers = useRef(new Map<string, number>());

  const showTableToast = useCallback((kind: TableToastKind, title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTableToasts((current) => [...current, { id, kind, title, message }].slice(-4));
    const timer = window.setTimeout(() => {
      setTableToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimers.current.delete(id);
    }, kind === "success" || kind === "error" ? 5200 : 3600);
    toastTimers.current.set(id, timer);
  }, []);

  const animateCardPass = useCallback((event: NonNullable<GameSnapshot["lastPassEvent"]>) => {
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
      setPassFlight({ id: event.id, fromX, fromY, dx, dy, midX: dx * 0.5, midY: dy * 0.5 - 72 });
    });
  }, []);

  const notifyCardPass = useCallback((event: NonNullable<GameSnapshot["lastPassEvent"]>) => {
    showTableToast("game", "Card passed", `${event.fromName} passed a card to ${event.toName}.`);
    animateCardPass(event);
  }, [animateCardPass, showTableToast]);

  const notifySignal = useCallback((signal: NonNullable<GameSnapshot["publicSignals"]>[number]) => {
    const label = signalLibrary.find((item) => item.id === signal.signalId)?.label ?? "a signal";
    setSignalFlash(true);
    setSignalClock(Date.now());
    window.setTimeout(() => setSignalFlash(false), 900);
    showTableToast("game", "Signal flashed", `${signal.playerName} flashed ${label}.`);
  }, [showTableToast]);

  const displayReaction = useCallback((reaction: ReactionEvent) => {
    setReactionBursts((current) => [...current.filter((entry) => entry.playerId !== reaction.playerId), reaction].slice(-8));
    const timerKey = `reaction-${reaction.id}`;
    const timer = window.setTimeout(() => {
      setReactionBursts((current) => current.filter((entry) => entry.id !== reaction.id));
      toastTimers.current.delete(timerKey);
    }, 2400);
    toastTimers.current.set(timerKey, timer);
    showTableToast("info", "Reaction", `${reaction.playerName} reacted.`);
  }, [showTableToast]);

  useEffect(() => () => {
    for (const timer of toastTimers.current.values()) window.clearTimeout(timer);
  }, []);

  const screen: Screen = pathname === "/how-to"
    ? "howto"
    : pathname === "/create"
      ? "create"
      : pathname === "/join"
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
              ? room?.teamPhase === "assignment" || room?.teamPhase === "confirmation"
                ? "teams"
                : room || !joinCode ? "lobby" : "join"
              : "home";

  const navigate = (destination: Screen, destinationRoomCode = roomCode) => {
    const roomPath = destinationRoomCode
      ? `/room/${encodeURIComponent(destinationRoomCode)}`
      : "/room/unknown";
    const paths: Record<Screen, string> = {
      home: "/",
      create: "/create",
      join: "/join",
      lobby: roomPath,
      signal: `${roomPath}/signal`,
      teams: roomPath,
      table: `${roomPath}/table`,
      result: `${roomPath}/result`,
      howto: "/how-to",
    };
    router.push(paths[destination]);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedSession = readSession();
      const routeCode = pathname.startsWith("/room/")
        ? decodeURIComponent(pathname.split("/")[2] ?? "")
        : "";
      const savedRoom = routeCode ? findRoom(routeCode) : savedSession?.roomCode ? findRoom(savedSession.roomCode) : null;

      const savedSignal = window.localStorage.getItem("jackpot:signal:v1");
      if (savedSignal && signalLibrary.some((signal) => signal.id === savedSignal)) setSelectedSignal(savedSignal);
      if (savedSession) {
        setSession(savedSession);
        setNickname(normalizePlayerName(savedSession.nickname));
        setRoomCode(routeCode || savedSession.roomCode || "");
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
      setJoinCode(routeCode);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

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

  // Poll the authoritative room so every browser sees the same teams, game state, and results.
  useEffect(() => {
    if (!hydrated || !roomCode || screen === "join") return;
    let active = true;
    const syncLobby = async () => {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}?playerId=${encodeURIComponent(session?.playerId ?? "")}`, { cache: "no-store" });
        if (response.status === 404 && session?.playerId) {
          const cachedRoom = findRoom(roomCode);
          if (cachedRoom?.hostPlayerId === session.playerId && roomRecoveryAttempted.current !== roomCode) {
            roomRecoveryAttempted.current = roomCode;
            // A process restart can erase a room created before disk persistence was added.
            // Recreate it as a fresh lobby; the old private hands cannot be reconstructed safely.
            await fetch("/api/rooms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ room: cachedRoom }),
            });
          }
          return;
        }
        if (!response.ok) return;
        const payload = await response.json() as { room?: { id: string; code: string; isPrivate: boolean; maxPlayers: 4 | 6 | 8; status: LocalRoom["status"]; hostPlayerId: string; players: LocalRoom["players"]; chat: LocalRoom["chat"]; teams?: LocalRoom["teams"]; teamAcceptances?: LocalRoom["teamAcceptances"]; teamNotice?: string; teamPhase?: LocalRoom["teamPhase"]; confirmationEndsAt?: number; strategyEndsAt?: number; gameSnapshot?: GameSnapshot | null; scores?: ScoreBoard; suspectAttemptsRemaining?: LocalRoom["suspectAttemptsRemaining"]; round?: number; result?: RoundResult | null; gameAuthoritative?: boolean; updatedAt: number } };
        const shared = payload.room;
        if (!active || !shared || shared.updatedAt <= sharedRoomRevision.current) return;
        sharedRoomRevision.current = shared.updatedAt;
        const cached = findRoom(roomCode);
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
          game: shared.gameSnapshot !== undefined ? shared.gameSnapshot : cached?.game ?? null,
          gameAuthoritative: shared.gameAuthoritative ?? cached?.gameAuthoritative,
          scores: shared.scores ?? cached?.scores ?? emptyScores(),
          suspectAttemptsRemaining: shared.suspectAttemptsRemaining ?? cached?.suspectAttemptsRemaining,
          round: shared.round ?? cached?.round ?? 1,
          result: shared.result ?? cached?.result ?? null,
          updatedAt: shared.updatedAt,
        };
        saveRoom(syncedRoom);
        setRoom(syncedRoom);
        if (shared.gameSnapshot !== undefined) {
          const snapshot = shared.gameSnapshot;
          const passEvents = snapshot?.passEvents ?? (snapshot?.lastPassEvent ? [snapshot.lastPassEvent] : []);
          const previousPassIndex = passEvents.findIndex((event) => event.id === lastPassEventId.current);
          for (const event of previousPassIndex >= 0 ? passEvents.slice(previousPassIndex + 1) : passEvents.slice(-1)) {
            lastPassEventId.current = event.id;
            if (Date.now() - event.createdAt < 5000) notifyCardPass(event);
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
        }
        if (shared.scores) setScores(shared.scores);
        if (shared.round !== undefined) setRound(shared.round);
        if (shared.result !== undefined) {
          setResult(shared.result);
          if (shared.result && shared.result.kind !== "suspect" && cached?.result?.title !== shared.result.title) {
            showTableToast(shared.result.valid ? "success" : "warning", shared.result.title, shared.result.detail);
          }
        }
        if (shared.teamPhase === "strategy" && !pathname.endsWith("/signal")) {
          router.replace(`/room/${encodeURIComponent(roomCode)}/signal`);
        } else if (shared.teamPhase === "game" && !pathname.endsWith("/table")) {
          router.replace(`/room/${encodeURIComponent(roomCode)}/table`);
        } else if (shared.status === "result" && !pathname.endsWith("/result")) {
          router.replace(`/room/${encodeURIComponent(roomCode)}/result`);
        } else if (shared.teamPhase === "strategy" && pathname.endsWith("/result")) {
          router.replace(`/room/${encodeURIComponent(roomCode)}/signal`);
        }
      } catch {
        // The saved local room remains usable while the room server is unavailable.
      }
    };
    void syncLobby();
    const timer = window.setInterval(syncLobby, 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [hydrated, roomCode, screen, pathname, router, session?.playerId, showTableToast, notifyCardPass, notifySignal, displayReaction]);

  useEffect(() => {
    if (!hydrated || !session) return;
    const nextSession = { ...session, nickname, roomCode: roomCode || session.roomCode, updatedAt: Date.now() };
    writeSession(nextSession);
    window.localStorage.setItem("jackpot:signal:v1", selectedSignal);
    const currentRoom = nextSession.roomCode ? findRoom(nextSession.roomCode) : null;
    const member = currentRoom?.players.find((player) => player.id === nextSession.playerId);
    if (currentRoom && member && member.nickname !== nickname) {
      updateRoomForPlayer(currentRoom, nextSession.playerId, nickname);
    }
  }, [hydrated, nickname, roomCode, selectedSignal, session]);

  const selectedSignalMeta =
    signalLibrary.find((signal) => signal.id === selectedSignal) ?? signalLibrary[0];
  const currentTeamDraft = Object.keys(teamDraft).length ? teamDraft : room?.teams ?? {};

  const playerNames = useMemo(
    () =>
      DEFAULT_PLAYER_NAMES.map((name, index) =>
        index === 0 ? nickname.trim() || "You" : name,
      ),
    [nickname],
  );

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
    const rotated = rotatePlayersForViewer(game.players, viewerPlayerId);
    const viewer = rotated[0];
    const teammate = rotated.find((player) => player.id !== viewer?.id && player.team === viewer?.team);
    if (!viewer || !teammate || rotated.length < 4) return rotated;

    // Keep the viewer at the bottom and put a teammate at the opposite seat.
    const seats = new Array<PlayerSlot>(rotated.length);
    const oppositeSeat = Math.floor(rotated.length / 2);
    seats[0] = viewer;
    seats[oppositeSeat] = teammate;
    const remaining = rotated.filter((player) => player.id !== viewer.id && player.id !== teammate.id);
    for (let seat = 1, playerIndex = 0; seat < seats.length; seat += 1) {
      if (!seats[seat]) seats[seat] = remaining[playerIndex++];
    }
    return seats;
  }, [game, viewerPlayerId]);
  const partner = seated[Math.floor(seated.length / 2)]?.team === seated[0]?.team
    ? seated[Math.floor(seated.length / 2)]
    : null;
  const you = seated[0];
  const scoreTeams: Team[] = room?.gameAuthoritative ? ["Alpha", "Bravo"] : Object.keys(scores) as Team[];
  const activePlayer = game?.players.find((player) => player.id === game.activePlayerId);
  const activePlayerIndex = game?.players.findIndex((player) => player.id === game.activePlayerId) ?? -1;
  const passReceiver = game && activePlayerIndex >= 0 ? game.players[(activePlayerIndex + 1) % game.players.length] : null;
  const isYourPass = game?.activePlayerId === viewerPlayerId;
  const yourFour = you ? findFourOfAKind(you.hand) : null;
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

  const sendLobbyMessage = () => {
    const text = chatDraft.trim();
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
    setChatDraft("");
    void fetch(`/api/rooms/${encodeURIComponent(room.code)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: session.playerId, text }),
    }).catch(() => setStatus("Message saved locally; shared chat is temporarily offline."));
  };

  const leaveRoom = () => {
    if (!room || !session) {
      navigate("home");
      return;
    }
    if (room.status !== "lobby" && !window.confirm("Leave this practice game? Your current round will end.")) return;
    const nextSession = leaveRoomSession(room.code, session.playerId);
    setSession(nextSession);
    setRoom(null);
    setGame(null);
    setResult(null);
    setRoomCode("");
    navigate("home", "");
  };
  const createRoom = async () => {
    const created = createRoomSession(nickname, privateRoom);
    setSession(created.session);
    setRoom(created.room);
    setRoomCode(created.room.code);
    setNickname(created.session.nickname);
    setSessionError("");
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
    navigate("lobby", created.room.code);
  };

  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    const cleanNickname = normalizePlayerName(nickname);
    if (!code || !cleanNickname || joining) return;
    setJoining(true);
    setSessionError("");
    try {
      const previousSession = readSession();
      const playerId = previousSession?.roomCode === code
        ? previousSession.playerId
        : createPlayerId();
      const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, nickname: cleanNickname }),
      });
      const payload = await response.json() as { room?: { id: string; code: string; isPrivate: boolean; maxPlayers: 4 | 6 | 8; status: LocalRoom["status"]; hostPlayerId: string; players: LocalRoom["players"]; chat: LocalRoom["chat"]; teams?: LocalRoom["teams"]; teamAcceptances?: LocalRoom["teamAcceptances"]; teamNotice?: string; teamPhase?: LocalRoom["teamPhase"]; confirmationEndsAt?: number; strategyEndsAt?: number; updatedAt: number }; error?: string };
      if (!response.ok || !payload.room) {
        setSessionError(payload.error ?? "This room could not be joined. Check the invite and try again.");
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
      saveRoom(joinedRoom);
      writeSession(nextSession);
      setSession(nextSession);
      setRoom(joinedRoom);
      setRoomCode(shared.code);
      setNickname(joinedPlayer.nickname);
      navigate("lobby", shared.code);
    } catch {
      setSessionError("Could not reach the room. Make sure the host's Jackpot app is running, then retry.");
    } finally {
      setJoining(false);
    }
  };

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
        const payload = await response.json() as { privateRoom?: { signal?: string; selectedBy?: string; agreements?: Record<string, boolean>; locked?: boolean; teammates?: Array<{ id: string; nickname: string }>; chat?: LocalRoom["chat"]; endsAt?: number } };
        if (!active || !payload.privateRoom) return;
        if (payload.privateRoom.signal && signalLibrary.some((signal) => signal.id === payload.privateRoom?.signal)) setSelectedSignal(payload.privateRoom.signal);
        setTeamSignalSelectedBy(payload.privateRoom.selectedBy ?? "");
        setTeamSignalAgreements(payload.privateRoom.agreements ?? {});
        setTeamSignalLocked(Boolean(payload.privateRoom.locked));
        setTeamMates(payload.privateRoom.teammates ?? []);
        setTeamChat(payload.privateRoom.chat ?? []);
        if (payload.privateRoom.endsAt) setStrategySeconds(Math.max(0, Math.ceil((payload.privateRoom.endsAt - Date.now()) / 1000)));
      } catch { /* reconnect on the next poll */ }
    };
    void refreshPrivateRoom();
    const timer = window.setInterval(refreshPrivateRoom, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, privateRoomCode, activePlayerId]);

  const updateTeamPrivate = async (payload: { signal?: string; agree?: boolean; text?: string }) => {
    if (!room || !session) return;
    const response = await fetch(`/api/rooms/${encodeURIComponent(room.code)}/private`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: session.playerId, ...payload }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setStatus(result.error ?? "That team update could not be sent.");
  };

  const teamAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!room || !session) return;
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(room.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: session.playerId, action, ...extra }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) setStatus(payload.error ?? "That team action could not be completed.");
      else if (action === "assign-teams" && room.teamPhase === "assignment") navigate("teams", room.code);
      else if (action === "respond" && extra.accept === false) setStatus("Team assignment rejected. The host can adjust teams.");
    } catch {
      setStatus("Room connection lost. Reconnecting to the lobby…");
    }
  };

  const beginRound = (nextRound = round) => {
    const next = createMatch(playerNames);
    setGame(next);
    setSelectedCardId(null);
    setResult(null);
    setLocalSuspectAttempts({ Alpha: SUSPECT_ATTEMPTS_PER_TEAM, Bravo: SUSPECT_ATTEMPTS_PER_TEAM, Charlie: SUSPECT_ATTEMPTS_PER_TEAM, Delta: SUSPECT_ATTEMPTS_PER_TEAM });
    setBusy(false);
    setStatus(`${next.players.find((player) => player.id === next.activePlayerId)?.name ?? "Player"} starts — pass a card clockwise.`);
    if (room) {
      const updatedRoom = { ...room, status: "table" as const, game: next, scores, result: null, round: nextRound };
      saveRoom(updatedRoom);
      setRoom(updatedRoom);
    }
    navigate("table");
  };

  const finishRound = (outcome: RoundResult) => {
    const nextScores = applyRoundScore(scores, outcome);
    setResult(outcome);
    setScores(nextScores);
    setBusy(false);
    showTableToast(outcome.valid ? "success" : "warning", outcome.title, outcome.detail);
    if (room) {
      const updatedRoom = { ...room, status: "result" as const, game, scores: nextScores, result: outcome };
      saveRoom(updatedRoom);
      setRoom(updatedRoom);
    }
    navigate("result");
  };

  const tryPass = (fromId: string, cardId: string) => {
    if (!game || busy) return;
    try {
      const next = passCard(game, fromId, cardId);
      setGame(next);
      if (next.lastPassEvent) {
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

  const requestServerGameAction = async (type: "pass" | "jackpot" | "suspect" | "signal" | "fake-signal" | "reaction" | "restart", cardId?: string, reactionId?: string) => {
    if (!room || !session || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(room.code)}/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: session.playerId, type, ...(cardId ? { cardId } : {}), ...(reactionId ? { reactionId } : {}) }),
      });
      const payload = await response.json() as { error?: string; notice?: string; suspectAttemptsRemaining?: LocalRoom["suspectAttemptsRemaining"] };
      if (!response.ok) {
        const message = payload.error ?? "That action is no longer available.";
        setStatus(message);
        showTableToast("error", "Action failed", message);
      } else {
        setStatus(payload.notice || (type === "pass" ? "Card passed." : type.includes("signal") ? "Signal flashed." : `${type.toUpperCase()} called.`));
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

  const onJackpot = () => {
    if (!game || busy || !window.confirm("Call JACKPOT for your team?")) return;
    if (room?.gameAuthoritative) void requestServerGameAction("jackpot");
    else finishRound(resolveJackpot(game, viewerPlayerId));
  };

  const onSuspect = () => {
    if (!game || busy || !window.confirm("Call SUSPECT on an opposing team?")) return;
    if (room?.gameAuthoritative) void requestServerGameAction("suspect");
    else {
      const caller = game.players.find((player) => player.id === viewerPlayerId);
      const callerTeam = caller?.team ?? "Alpha";
      const remaining = localSuspectAttempts[callerTeam];
      if (remaining <= 0) {
        setStatus("Your team has used all three SUSPECT calls this round.");
        return;
      }
      const outcome = resolveSuspect(game, viewerPlayerId);
      setLocalSuspectAttempts((current) => ({ ...current, [callerTeam]: remaining - 1 }));
      if (outcome.valid) finishRound(outcome);
      else setStatus(`FALSE SUSPECT — ${remaining - 1} team calls remain.`);
    }
  };

  const onSignal = () => {
    setSignalMenuOpen(false);
    if (room?.gameAuthoritative) {
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

  const handleReactionClick = (clickEvent: MouseEvent<HTMLButtonElement>) => {
    const reactionId = clickEvent.currentTarget.dataset.reactionId;
    if (!reactionId) return;
    setReactionMenuOpen(false);
    if (!game || busy) return;
    if (room?.gameAuthoritative) {
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

  const runAiTurn = useEffectEvent((snapshot: GameSnapshot) => {
    if (snapshot.activePlayerId === viewerPlayerId) return;

    const actor = snapshot.players.find((player) => player.id === snapshot.activePlayerId);
    if (!actor) return;

    setBusy(true);

    // Occasional auto JACKPOT if this AI (or partner) has four-of-a-kind.
    const ownFour = findFourOfAKind(actor.hand);
    const mate = getPartner(snapshot.players, actor.id);
    const mateFour = mate ? findFourOfAKind(mate.hand) : null;

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

  return (
    <main className={`app-shell ${screen === "table" ? "table-mode" : ""}`}>
      <div className={`scene-frame ${screen === "table" ? "table-frame" : ""}`}>
        {screen === "home" && (
          <section className="hero-screen lobby-home">
            <header className="lobby-topbar"><div className="brand-bar"><div className="brand-mark">J</div><div><span className="mini-tag">A SOCIAL CARD GAME</span><h1>JACKPOT!</h1></div></div><div className="lobby-top-actions"><span className="lobby-online"><i /> FRIENDS &amp; FAMILY EDITION</span><details className="profile-menu"><summary aria-label="Open player profile"><span className="profile-avatar">{(nickname.trim()[0] || "M").toUpperCase()}</span><span className="profile-name">{nickname || "Player"}</span><span aria-hidden="true">⌄</span></summary><div className="profile-popover"><span className="mini-tag">PLAYER PROFILE</span><label htmlFor="home-player-name">Display name</label><input id="home-player-name" value={nickname} maxLength={MAX_PLAYER_NAME_LENGTH} onChange={(event) => setNickname(event.target.value)} /><p>Your name appears at the table when you create or join a room.</p><button type="button" className="profile-rules" onClick={() => navigate("howto")}>Rules &amp; hints →</button></div></details></div></header>
            <div className="tropic-stage"><div className="stage-cloud cloud-one"/><div className="stage-cloud cloud-two"/><div className="stage-sun"/><div className="stage-palm palm-left">♣</div><div className="stage-palm palm-right">♣</div><div className="stage-copy"><span className="stage-kicker"><i /> THE TABLE IS OPEN</span><h2>Bring your<br />best <em>bluff.</em></h2><p>Read the signal. Outsmart your friends.<br />Be the first team to call JACKPOT!</p><div className="stage-badges"><span>♟ &nbsp;4–8 PLAYERS</span><span>✦ &nbsp;PRIVATE ROOMS</span></div></div><div className="stage-cards" aria-hidden="true"><span className="tropic-card card-blue"><small>J</small><b>✦</b></span><span className="tropic-card card-red"><small>JACKPOT</small><b>♛</b><small>THE BIG CALL</small></span><span className="tropic-card card-gold"><small>★</small><b>♣</b></span><span className="card-glint glint-one">✦</span><span className="card-glint glint-two">✧</span></div><div className="stage-water"/></div>
            <div className="tropic-controls"><div className="control-heading"><div><span className="control-eyebrow">PICK YOUR PLAY</span><h3>How do you want to play?</h3></div><button type="button" className="rules-button" onClick={() => navigate("howto")}>HOW TO PLAY <span>↗</span></button></div><div className="tropic-actions"><button type="button" className="tropic-action create-action" onClick={() => navigate("create")}><span className="action-medal">＋</span><span><strong>Create a room</strong><small>Host a table and invite your crew</small></span><b>→</b></button><button type="button" className="tropic-action join-action" onClick={() => navigate("join")}><span className="action-medal">⇥</span><span><strong>Join a room</strong><small>Enter your friend’s room code</small></span><b>→</b></button></div><div className="tropic-tips"><span className="tip-icon">💡</span><span><strong>Quick tip</strong><small>Match four shapes, signal your partner, then call JACKPOT. Watch for bluffs with SUSPECT!</small></span><button type="button" onClick={() => navigate("howto")}>See rules →</button></div></div>
            <footer className="tropic-footer"><span><i/> MADE FOR GAME NIGHTS</span><span>Keep your signal secret. Trust your partner. Have fun.</span></footer>
          </section>
        )}

        {screen === "howto" && (
          <section className="screen-panel">
            <div className="panel-top">
              <div>
                <span className="mini-tag">Rules</span>
                <h2>How Jackpot works</h2>
              </div>
              <button type="button" className="ghost-btn" onClick={() => navigate("home")}>
                Back
              </button>
            </div>
            <div className="howto-grid">
              <article className="howto-card">
                <h3>The deck</h3>
                <p>
                  8 shapes × 4 cards = 32. No ranks — only the shape matters. Goal: hold all
                  four of one shape.
                </p>
              </article>
              <article className="howto-card">
                <h3>Passing</h3>
                <p>
                  One seat always holds one extra pass card (a spare token or a shape).
                  Pass one card clockwise. The spare token does not count toward four-of-a-kind.
                </p>
              </article>
              <article className="howto-card">
                <h3>Teams &amp; signal</h3>
                <p>
                  Partners sit opposite (same team color). Agree a private signal. When you
                  (or your partner) have four-of-a-kind, flash the signal then call JACKPOT.
                </p>
              </article>
              <article className="howto-card">
                <h3>Calls</h3>
                <p>
                  <strong>JACKPOT</strong> scores if your team holds four-of-a-kind.
                  <strong> SUSPECT</strong> scores if an opposing team does. False calls score
                  nothing.
                </p>
              </article>
            </div>
            <div className="cta-row">
              <button type="button" className="primary-btn" onClick={() => navigate("create")}>
                Create room
              </button>
            </div>
          </section>
        )}

        {screen === "create" && (
          <section className="screen-panel">
            <div className="panel-top">
              <div>
                <span className="mini-tag">Local practice room</span>
                <h2>Create match</h2>
              </div>
              <div className="room-code-box">A room code is generated when you create the room</div>
            </div>

            <div className="create-grid">
              <div className="form-card">
                <label>
                  Nickname
                  <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={MAX_PLAYER_NAME_LENGTH} aria-describedby="create-name-limit" />
                </label>
                <p id="create-name-limit" className="field-hint">Up to {MAX_PLAYER_NAME_LENGTH} characters. Names shorten with an ellipsis in tight player labels.</p>
                <div className="toggle-row">
                  <span>Private room</span>
                  <button
                    type="button"
                    className={`toggle ${privateRoom ? "on" : ""}`}
                    onClick={() => setPrivateRoom((value) => !value)}
                  >
                    {privateRoom ? "ON" : "OFF"}
                  </button>
                </div>
                <div className="cta-row split">
                  <button type="button" className="primary-btn" onClick={createRoom}>
                    Create room
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => navigate("home")}>
                    Back
                  </button>
                </div>
              </div>

              <div className="summary-card">
                <h3>Local practice setup</h3>
                <ul>
                  <li>8-player local table (you + 7 AI)</li>
                  <li>4 teams of 2 — partners opposite</li>
                  <li>32-card Whot-shape deck</li>
                  <li>{privateRoom ? "Private" : "Open"} room · code {roomCode}</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {screen === "join" && (
          <section className="screen-panel">
            <div className="panel-top">
              <div>
                <span className="mini-tag">Join a room</span>
                <h2>{joinCode ? `Join room ${joinCode}` : "Enter the room code"}</h2>
              </div>
              <button type="button" className="ghost-btn" onClick={() => navigate("home")}>
                Back
              </button>
            </div>

            <div className="create-grid">
              <div className="form-card">
                <label>
                  Nickname
                  <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={MAX_PLAYER_NAME_LENGTH} aria-describedby="join-name-limit" />
                </label>
                <p id="join-name-limit" className="field-hint">Up to {MAX_PLAYER_NAME_LENGTH} characters. Names shorten with an ellipsis in tight player labels.</p>
                {!joinCode ? (
                  <label>
                    Room code
                    <input
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder="e.g. 7H92K"
                      maxLength={5}
                      autoCapitalize="characters"
                    />
                  </label>
                ) : null}
                {sessionError ? <p className="form-error" role="alert">{sessionError}</p> : null}
                <div className="cta-row split">
                  <button type="button" className="primary-btn" onClick={() => void joinRoom()} disabled={!joinCode.trim() || !nickname.trim() || joining}>
                    {joining ? "Joining…" : "Join room"}
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => navigate("create")}>
                    Create instead
                  </button>
                </div>
              </div>

              <div className="summary-card">
                <h3>Before you join</h3>
                <ul>
                  <li>{joinCode ? `You’re joining room ${joinCode}.` : "Use the code shared by the room host."}</li>
                  <li>Your nickname is saved for this browser.</li>
                  <li>You will enter the lobby immediately.</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {screen === "lobby" && (
          <section className="screen-panel">
            <div className="panel-top">
              <div>
                <span className="mini-tag">Room lobby</span>
                <h2>Match waiting room</h2>
              </div>
              <div className="room-code-box">{room ? room.code : "Room unavailable"}</div>
            </div>

            {!room ? (
              <div className="inline-status" role="alert">
                This room is unavailable in this browser session. Join with a valid room code or create a new room.
                <div className="cta-row">
                  <button type="button" className="primary-btn" onClick={() => navigate("join")}>Join room</button>
                  <button type="button" className="ghost-btn" onClick={() => navigate("home")}>Return home</button>
                </div>
              </div>
            ) : null}

            <div className="inline-status">{lobbyPlayers.length} / {room?.maxPlayers ?? 8} players · {room?.maxPlayers && lobbyPlayers.length < room.maxPlayers ? `Waiting for ${Math.max(0, 4 - lobbyPlayers.length)} more to assign teams` : "Ready to assign teams"}</div>
            <div className="seat-grid eight">
              {lobbyPlayers.map((player) => (
                <div key={player.id} className="seat-card">
                  <div className="seat-meta">
                    <div className="avatar-badge">{player.name.slice(0, 1)}</div>
                    <div>
                      <strong>{player.name}</strong>
                      <small>{player.isAdmin ? "Host · Admin" : "Player"}</small>
                    </div>
                  </div>
                  <div className={`seat-state ${player.isReady ? "ready" : ""}`}>{player.isReady ? "Ready" : "Not ready"}</div>
                </div>
              ))}
            </div>

            <section className="local-chat" aria-label="Lobby chat">
              <h3>Lobby chat <span>Room chat</span></h3>
              <div className="local-chat-feed" aria-live="polite">
                {(room?.chat ?? []).slice(-12).map((message) => (
                  <p key={message.id} className={message.system ? "chat-system" : ""}>
                    <strong>{message.nickname}</strong> {message.text}
                  </p>
                ))}
              </div>
              <form className="local-chat-form" onSubmit={(event) => { event.preventDefault(); sendLobbyMessage(); }}>
                <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={280} placeholder="Message the room" aria-label="Lobby chat message" />
                <button className="secondary-btn" type="submit" disabled={!chatDraft.trim()}>Send</button>
              </form>
            </section>
            <div className="cta-row split">
              <button
                type="button"
                className="primary-btn"
                disabled={!room || room.hostPlayerId !== session?.playerId}
                onClick={() => void teamAction("begin-assignment")}
              >
                Assign teams
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={async () => {
                  const text = `${window.location.origin}/room/${roomCode}`;
                  try {
                    await navigator.clipboard.writeText(text);
                    setStatus("Room link copied. Friends can join while this Jackpot server is running.");
                  } catch {
                    setStatus(text);
                  }
                }}
              >
                Copy local room link
              </button>
              <button type="button" className="ghost-btn" onClick={leaveRoom}>Leave room
              </button>
            </div>
            {status && screen === "lobby" ? <p className="inline-status">{status}</p> : null}
          </section>
        )}

        {screen === "teams" && room && session && (
          <section className="screen-panel team-modal" role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
            <div className="panel-top">
              <div>
                <span className="mini-tag">Team selection</span>
                <h2 id="team-modal-title">{room.teamPhase === "confirmation" ? "Confirm your team" : "Choose the two teams"}</h2>
              </div>
              <div className="room-code-box">{room.players.length} players</div>
            </div>
            {room.teamPhase === "assignment" && room.hostPlayerId === session.playerId ? (
              <>
                {room.teamNotice ? <p className="inline-status" role="status">{room.teamNotice}</p> : null}
                <p className="inline-status">Place every player into one of two balanced teams. The server checks the final assignment.</p>
                <div className="team-pick-grid">
                  {(["Alpha", "Bravo"] as const).map((team) => (
                    <section className={`team-pick ${team.toLowerCase()}`} key={team}>
                      <h3>Team {team} <span>{room.players.filter((player) => currentTeamDraft[player.id] === team).length}</span></h3>
                      {room.players.filter((player) => currentTeamDraft[player.id] === team).map((player) => (
                        <button className="team-player" type="button" key={player.id} onClick={() => setTeamDraft((current) => ({ ...current, [player.id]: team === "Alpha" ? "Bravo" : "Alpha" }))}>
                          <span className="avatar-badge">{player.nickname.slice(0, 1)}</span><span className="team-player-name" title={player.nickname}>{player.nickname}</span>{player.isAdmin ? <small>HOST</small> : null}
                        </button>
                      ))}
                    </section>
                  ))}
                  {room.players.filter((player) => !currentTeamDraft[player.id]).map((player) => (
                    <button className="team-player unassigned" type="button" key={player.id} onClick={() => setTeamDraft((current) => ({ ...current, [player.id]: room.players.filter((entry) => current[entry.id] === "Alpha").length < room.players.length / 2 ? "Alpha" : "Bravo" }))}>
                      <span className="avatar-badge">{player.nickname.slice(0, 1)}</span><span className="team-player-name" title={player.nickname}>{player.nickname} · tap to assign</span>
                    </button>
                  ))}
                </div>
                {room.hostPlayerId === session.playerId ? (
                  <div className="cta-row split">
                    <button className="secondary-btn" type="button" onClick={() => void teamAction("assign-teams", { shuffle: true })}>Shuffle teams</button>
                    <button className="primary-btn" type="button" disabled={room.players.some((player) => !currentTeamDraft[player.id]) || room.players.filter((player) => currentTeamDraft[player.id] === "Alpha").length !== room.players.length / 2} onClick={() => void teamAction("assign-teams", { assignments: currentTeamDraft })}>Confirm teams</button>
                  </div>
                ) : <p className="inline-status">The host is choosing teams. Hang tight.</p>}
              </>
            ) : room.teamPhase === "confirmation" ? (
              <>
                <p className="inline-status">{Object.values(room.teamAcceptances ?? {}).filter(Boolean).length} of {room.players.length} players accepted. Waiting for everyone before continuing.</p>
                <div className="team-confirm-grid">
                  {(["Alpha", "Bravo"] as const).map((team) => <section className={`team-pick ${team.toLowerCase()}`} key={team}>
                    <h3>Team {team}</h3>
                    {room.players.filter((player) => room.teams?.[player.id] === team).map((player) => <div className="team-confirm-player" key={player.id}><span title={player.nickname}>{player.nickname}{player.id === session.playerId ? " · You" : ""}</span><small>{room.teamAcceptances?.[player.id] ? "ACCEPTED" : "WAITING"}</small></div>)}
                  </section>)}
                </div>
                <div className="team-countdown"><span>Confirm in</span><strong>{teamSeconds}</strong><span>seconds</span></div>
                {!room.teamAcceptances?.[session.playerId] ? <div className="cta-row split"><button className="ghost-btn" type="button" onClick={() => void teamAction("respond", { accept: false })}>Reject teams</button><button className="primary-btn" type="button" onClick={() => void teamAction("respond", { accept: true })}>Accept this team</button></div> : <p className="inline-status" role="status">You accepted this team. Waiting for everyone else…</p>}
              </>
            ) : <p className="inline-status">Waiting for the host to begin team assignment.</p>}
            {status ? <p className="inline-status" role="status">{status}</p> : null}
          </section>
        )}

        {screen === "signal" && (
          <section className="screen-panel signal-panel">
            <div className="panel-top">
              <div>
                <span className="mini-tag">Private Team {room?.teams?.[session?.playerId ?? ""] ?? ""} room</span>
                <h2>Plan your signal together</h2>
              </div>
              <div className="room-code-box">{strategySeconds}s</div>
            </div>

            <p className="inline-status">Only your teammates can see this room. Agree on a signal before the strategy timer ends.</p>
            <div className="signal-note" aria-live="polite">
              <strong>Shared team signal: {teamSignalSelectedBy ? selectedSignalMeta.label : "Choose a signal together"}</strong>
              {teamSignalSelectedBy ? <span>Proposed by {teamMates.find((player) => player.id === teamSignalSelectedBy)?.nickname ?? "your teammate"}.</span> : null}
              <span>{teamMates.filter((player) => teamSignalAgreements[player.id]).length} of {teamMates.length} teammates agree.</span>
              {teamMates.map((player) => <span key={player.id}>{player.nickname}: {teamSignalAgreements[player.id] ? "Agreed" : "Waiting"}</span>)}
            </div>
            <section className="team-private-chat" aria-label="Private team chat" aria-live="polite">
              {teamChat.map((message) => <p key={message.id}><strong>{message.nickname}</strong>{message.text}</p>)}
              {teamChat.length === 0 ? <span>Your private team chat starts here.</span> : null}
            </section>
            <form className="local-chat-form" onSubmit={(event) => { event.preventDefault(); const text = teamChatDraft.trim(); if (text) { void updateTeamPrivate({ text }); setTeamChatDraft(""); } }}>
              <input value={teamChatDraft} onChange={(event) => setTeamChatDraft(event.target.value)} maxLength={280} placeholder="Message your teammate" aria-label="Private team message" />
              <button className="secondary-btn" type="submit" disabled={!teamChatDraft.trim() || strategySeconds === 0}>Send</button>
            </form>

            <div className="signal-grid">
              {signalLibrary.map((signal) => (
                <button
                  key={signal.id}
                  type="button"
                  className={`signal-card ${selectedSignal === signal.id ? "active" : ""}`}
                  disabled={teamSignalLocked || strategySeconds === 0}
                  onClick={() => { setSelectedSignal(signal.id); void updateTeamPrivate({ signal: signal.id }); }}
                >
                  <span className="signal-symbol" aria-hidden="true">{signal.symbol}</span>
                  <strong>{signal.label}</strong>
                </button>
              ))}
            </div>

            <div className="signal-note">
              Your signal and team chat are stored in a private team channel. Opponents cannot fetch them.
            </div>

            <div className="cta-row split">
              <div className="selected-pill">{teamSignalLocked ? `Locked: ${selectedSignalMeta.label}` : `Shared pick: ${teamSignalSelectedBy ? selectedSignalMeta.label : "none yet"}`}</div>
              <button type="button" className="primary-btn" disabled={!teamSignalSelectedBy || strategySeconds === 0 || teamSignalLocked || Boolean(teamSignalAgreements[session?.playerId ?? ""])} onClick={() => void updateTeamPrivate({ agree: true })}>
                {teamSignalLocked ? "Signal locked" : teamSignalAgreements[session?.playerId ?? ""] ? "You agreed" : `Agree on ${selectedSignalMeta.label}`}
              </button>
            </div>
          </section>
        )}

        {screen === "table" && game && you && (
          <section className={`table-screen ${signalFlash ? "signal-flash" : ""} ${signalWindowActive ? "has-signal-pressure" : ""}`}>
            <header className="table-topbar">
              <div className="topbar-left">
                <button type="button" className="ghost-btn tiny" onClick={() => navigate("lobby")}>
                  Lobby
                </button>
                <span className="round-pill">Round {round}</span>
              </div>
              <div className="table-topbar-center">
                <div className="table-player-context">
                  <span className="viewer-name" title={`Playing as ${you?.name ?? nickname}`}>Playing as {you?.name ?? nickname}</span>
                  {you?.team ? <span className="viewer-team">{you.team}</span> : null}
                  {partner ? <span className="viewer-partner">Teammate: {partner.name}</span> : null}
                </div>
                <strong className={isYourPass ? "turn-you" : ""}>
                  {isYourPass
                    ? `Your pass → ${passReceiver?.name ?? "next player"}`
                    : `${activePlayer?.name ?? "…"} is passing → ${passReceiver?.name ?? "next player"}`}
                </strong>
                {signalWindowActive && latestPublicSignal ? (
                  <div className={`signal-decision-window ${signalSecondsRemaining <= 15 ? "urgent" : ""}`} role="status" aria-live="polite">
                    <span className="signal-window-pulse" aria-hidden="true" />
                    <span className="signal-window-symbol" aria-hidden="true">{latestSignalMeta?.symbol ?? "✦"}</span>
                    <span className="signal-window-copy"><strong>{latestPublicSignal.playerName} flashed {latestSignalMeta?.label ?? "a signal"}</strong><small>Trust it: JACKPOT · Challenge it: SUSPECT</small></span>
                    <time className="signal-window-clock" aria-label={`${signalSecondsRemaining} seconds remaining`}>0:{String(signalSecondsRemaining).padStart(2, "0")}</time>
                  </div>
                ) : (
                  <span className="mini-tag">Passes {game.passCount} · Your team signal is selected</span>
                )}
              </div>
              <div className="topbar-right">
                <div className="reaction-menu-anchor">
                  <button type="button" className="reaction-toggle" aria-expanded={reactionMenuOpen} onClick={() => setReactionMenuOpen((open) => !open)}>React</button>
                  {reactionMenuOpen ? <div className="reaction-picker" role="group" aria-label="Quick reactions">
                    {quickReactions.map((reaction) => <button key={reaction.id} type="button" data-reaction-id={reaction.id} aria-label={reaction.label} title={reaction.label} onClick={handleReactionClick}>{reaction.symbol}</button>)}
                  </div> : null}
                </div>
                <span className="room-presence"><span className="status-live-dot" aria-hidden="true" />{room?.gameAuthoritative ? "Live room" : "Practice match"}</span>
              </div>

            </header>

            <div className="table-layout">
              <div ref={tableRef} className="whot-table" data-player-count={seated.length} aria-label="Jackpot table">
                <div className="table-status-strip">
                  <span className="status-live-dot" aria-hidden />
                  <strong>{isYourPass ? "Your turn" : `${activePlayer?.name ?? "Player"} is passing`}</strong>
                  <span>Passing to {passReceiver?.name ?? "next player"}</span>
                </div>
                {seated.map((player, visualIndex) => (
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
                    canSelect={isYourPass && !busy}
                    onSelectCard={setSelectedCardId}
                    reaction={reactionBursts.filter((entry) => entry.playerId === player.id).at(-1)}
                  />
                ))}

                {passFlight ? <div className="pass-flight-layer" aria-hidden>
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
                  ><WhotCard faceDown compact /></div>
                </div> : null}

                <div className="table-center-void">
                  <div className="table-crown" aria-hidden>♛</div>
                  <span className="void-mark">JACKPOT TABLE</span>
                  {status ? <p className="center-status">{status}</p> : null}
                  {yourFour ? (
                    <p className="center-hint hot">You have four {yourFour}s — signal or JACKPOT!</p>
                  ) : null}
                </div>

                <div className="table-action-dock">
                  <button
                    type="button"
                    className="dock-btn pass"
                    disabled={!isYourPass || !selectedCardId || busy}
                    onClick={onPassSelected}
                  >
                    <span className="dock-icon">▱</span>
                    <span><strong>PASS CARD</strong><small>Select a card to pass</small></span>
                  </button>
                  <button type="button" className="dock-btn jackpot" disabled={busy} onClick={onJackpot}>
                    <span className="dock-icon">♛</span>
                    <span><strong>JACKPOT</strong><small>Your teammate has 4 of a kind</small></span>
                  </button>
                  <div className="signal-action-group">
                    <button type="button" className="dock-btn signal" disabled={busy} aria-expanded={signalMenuOpen} onClick={() => setSignalMenuOpen((open) => !open)}>
                      <span className="dock-icon">≋</span>
                      <span><strong>SIGNAL ▾</strong><small>Real or fake</small></span>
                    </button>
                    {signalMenuOpen ? <div className="signal-action-menu">
                      <button type="button" onClick={onSignal}><span>≋</span><strong>Flash team signal</strong><small>Your agreed signal</small></button>
                      <button type="button" onClick={onFakeSignal}><span>?</span><strong>Fake signal</strong><small>Send a random decoy</small></button>
                    </div> : null}
                  </div>
                  <button type="button" className="dock-btn suspect" disabled={busy || suspectAttemptsLeft <= 0} onClick={onSuspect}>
                    <span className="dock-icon">!</span>
                    <span><strong>SUSPECT · {suspectAttemptsLeft}</strong><small>Team calls remaining</small></span>
                  </button>
                </div>
              </div>

              <aside className="table-side">
                <div className="side-block">
                  <h3>Score</h3>
                  <div className="score-strip vertical">
                    {scoreTeams.map((team) => (
                      <span key={team} className={`score-chip ${team.toLowerCase()}`}>
                        {team} {scores[team]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="side-block feed">
                  <h3>Event feed</h3>
                  <ul>
                    {game.log.map((line, index) => (
                      <li key={`${line}-${index}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        )}

        {screen === "result" && result && (
          <section className="result-screen">
            {result.valid ? <div className="confetti-burst" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 9) * 0.07}s`, backgroundColor: ["#f6cd68", "#43d7c1", "#ff7387", "#8da5ff", "#fff1c7"][index % 5] }} />)}</div> : null}
            <div className={`result-box ${result.valid ? "win" : "miss"}`}>
              <span className="mini-tag">Round {round} resolved</span>
              <h2>{result.title}</h2>
              <p>{result.detail}</p>

              <div className="result-grid four">
                {scoreTeams.map((team) => (
                  <div key={team} className="result-stat">
                    <small>{team}</small>
                    <strong>{scores[team]}</strong>
                  </div>
                ))}
              </div>

              <div className="cta-row split">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={room?.gameAuthoritative && room.hostPlayerId !== session?.playerId}
                  onClick={() => {
                    if (room?.gameAuthoritative) void requestServerGameAction("restart");
                    else {
                      setRound((value) => value + 1);
                      beginRound();
                    }
                  }}
                >
                  {room?.gameAuthoritative ? room.hostPlayerId === session?.playerId ? "Restart game" : "Waiting for host" : "Next round"}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setGame(null);
                    setResult(null);
                    navigate("home");
                  }}
                >
                  Exit home
                </button>
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
  isTeammate,
  peek,
  selectedCardId,
  canSelect,
  onSelectCard,
  reaction,
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
        isTeammate ? "is-teammate" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-seat-id={player.id}
    >
      {reaction ? <div key={reaction.id} className="reaction-burst" aria-label={`${reaction.playerName} reacted`}>
        {quickReactions.find((item) => item.id === reaction.reactionId)?.symbol ?? "✨"}
      </div> : null}
      {!isYou && (
        <div className="player-plaque">
          <span className="player-avatar" aria-hidden>{player.name.slice(0, 1)}</span>
          <span className="player-name" title={player.name}>{player.name}</span>
          <span className="hand-count">{count}</span>
          <span className="online-dot" aria-label="Online" />
        </div>
      )}

      {showFaces ? (
        <div className={`player-hand ${isYou ? "you-hand" : "peek-hand"}`} data-hand-count={count}>
          {player.hand.map((card) => (
            <WhotCard
              key={card.id}
              card={card}
              selected={isYou && selectedCardId === card.id}
              onClick={
                isYou && canSelect
                  ? () => onSelectCard(card.id)
                  : undefined
              }
              compact={!isYou}
            />
          ))}
        </div>
      ) : (
        <CardFan count={count} compact />
      )}

      {isYou && (
        <div className="player-plaque you">
          <span className="player-avatar" aria-hidden>{player.name.slice(0, 1)}</span>
          {isActive ? <span className="turn-dot" aria-hidden /> : null}
          <span className="player-name" title={player.name}>{player.name}</span>
          <span className="hand-count">{count}</span>
          <span className="online-dot" aria-label="Online" />
        </div>
      )}

      <span className={`team-chip ${isTeammate ? "team-chip-teammate" : ""}`}>
        {isTeammate ? "✦ TEAMMATE" : player.team}
      </span>
    </div>
  );
}
