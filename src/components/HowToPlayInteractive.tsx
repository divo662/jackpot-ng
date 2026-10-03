"use client";

import React, { useState, useEffect } from "react";
import { WhotCard } from "@/components/WhotCard";
import type { JackpotCard, Suit } from "@/lib/deck";

type HowToProps = {
  onBack: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
};

type StageKey = "deck" | "passing" | "signals" | "jackpot" | "suspect" | "scoreboard";

const STAGES: { key: StageKey; label: string; icon: string; shortDesc: string }[] = [
  { key: "deck", label: "1. The 4-of-a-Kind Deck", icon: "🂠", shortDesc: "Collect 4 identical shapes" },
  { key: "passing", label: "2. Clockwise Passing", icon: "🔄", shortDesc: "Real-time card circulation" },
  { key: "signals", label: "3. Secret Signals", icon: "🤫", shortDesc: "Silent partner communication" },
  { key: "jackpot", label: "4. Calling JACKPOT!", icon: "⚡", shortDesc: "Partner calls the win" },
  { key: "suspect", label: "5. Suspect & Intercept", icon: "👀", shortDesc: "Catch opponent bluffs" },
  { key: "scoreboard", label: "6. Spelling J-A-C-K-P-O-T", icon: "🏆", shortDesc: "First to 7 points wins" },
];

const SIGNALS_LIST = [
  { id: "tap", label: "Double Tap Table", icon: "✌️", animation: "tapping fingers rhythmically" },
  { id: "scratch", label: "Scratch Nose", icon: "👃", animation: "subtly brushing nose" },
  { id: "look_up", label: "Glance at Ceiling", icon: "👀", animation: "tilting head upward" },
  { id: "glasses", label: "Adjust Glasses", icon: "👓", animation: "pushing glasses up" },
  { id: "smile", label: "Quick Smirk / Smile", icon: "😊", animation: "subtle nod and smile" },
  { id: "nod", label: "Double Nod", icon: "🙆", animation: "nodding head twice" },
];

export function HowToPlayInteractive({ onBack, onCreateRoom, onJoinRoom }: HowToProps) {
  const [activeStage, setActiveStage] = useState<StageKey>("deck");

  // Stage 1: Deck & Hand state
  const [selectedSuit, setSelectedSuit] = useState<Suit>("star");
  const [handHasFour, setHandHasFour] = useState(false);
  const [mismatchedSuit, setMismatchedSuit] = useState<Suit>("triangle");

  // Stage 2: Passing state
  const [passStep, setPassStep] = useState(0);
  const [isPassing, setIsPassing] = useState(false);
  const [lastPassMessage, setLastPassMessage] = useState("Tap 'Pass a Card' to start the table flow!");

  // Stage 3: Signals state
  const [chosenSignal, setChosenSignal] = useState(SIGNALS_LIST[0]);
  const [signalActive, setSignalActive] = useState(false);
  const [signalFeedback, setSignalFeedback] = useState("");

  // Stage 4: Jackpot state
  const [jackpotOutcome, setJackpotOutcome] = useState<"none" | "valid" | "false">("none");
  const [jackpotScore, setJackpotScore] = useState(1);

  // Stage 5: Suspect state
  const [suspectOutcome, setSuspectOutcome] = useState<"none" | "caught" | "false">("none");
  const [suspectsLeft, setSuspectsLeft] = useState(3);

  // Stage 6: Wordboard state
  const [alphaLetters, setAlphaLetters] = useState(2);
  const [bravoLetters, setBravoLetters] = useState(4);

  // Handle stage 1 card swap
  const handleSwapCard = () => {
    setHandHasFour((prev) => !prev);
  };

  // Handle stage 2 passing animation
  const handlePassCard = () => {
    if (isPassing) return;
    setIsPassing(true);
    const nextStep = (passStep + 1) % 4;
    setPassStep(nextStep);

    const messages = [
      "You (South) passed a card to West ➔ West passed to North ➔ North passed to East!",
      "West passed a card to North (Your Partner) ➔ North evaluated their hand!",
      "North (Your Partner) passed unwanted card to East ➔ East passed to You!",
      "East passed a fresh card to You (South)! Your hand updated instantly!",
    ];
    setLastPassMessage(messages[nextStep]);

    setTimeout(() => {
      setIsPassing(false);
    }, 600);
  };

  // Handle stage 3 signal perform
  const handlePerformSignal = (sig = chosenSignal) => {
    setChosenSignal(sig);
    setSignalActive(true);
    setSignalFeedback(`Performed: ${sig.icon} ${sig.label}!`);
    setTimeout(() => {
      setSignalActive(false);
    }, 2400);
  };

  // Stage 1 cards demo
  const demoCards: JackpotCard[] = [
    { id: `${selectedSuit}-1`, suit: selectedSuit, number: 1 },
    { id: `${selectedSuit}-2`, suit: selectedSuit, number: 2 },
    { id: `${selectedSuit}-3`, suit: selectedSuit, number: 3 },
    {
      id: handHasFour ? `${selectedSuit}-4` : `${mismatchedSuit}-1`,
      suit: handHasFour ? selectedSuit : mismatchedSuit,
      number: handHasFour ? 4 : 1,
    },
  ];

  return (
    <div className="howto-wrapper">
      {/* Top Breadcrumb & Title Plaque */}
      <div className="howto-hero-header">
        <div className="howto-badge-line">
          <span className="howto-mini-tag">OFFICIAL GAME RULES</span>
          <span className="howto-step-counter">
            STEP {STAGES.findIndex((s) => s.key === activeStage) + 1} OF 6
          </span>
        </div>
        <h1 className="howto-main-title">Interactive Guide: How to Play Jackpot</h1>
        <p className="howto-subtitle">
          Master the rules through interactive simulations. Practice 4-of-a-kind, real-time passing,
          secret signals, suspect interceptions, and the race to victory.
        </p>
      </div>

      {/* Stage Selector Bar (Scrollable Tabs on mobile) */}
      <nav className="howto-nav-pills" aria-label="Game Rules Steps">
        {STAGES.map((stage) => {
          const isActive = activeStage === stage.key;
          return (
            <button
              key={stage.key}
              type="button"
              className={`howto-pill-btn ${isActive ? "active" : ""}`}
              onClick={() => setActiveStage(stage.key)}
            >
              <span className="pill-icon">{stage.icon}</span>
              <div className="pill-text-wrap">
                <strong className="pill-label">{stage.label}</strong>
                <small className="pill-desc">{stage.shortDesc}</small>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Main Interactive Plaque */}
      <div className="howto-stage-card">
        {/* =============================================================== */}
        {/* STAGE 1: THE DECK & 4-OF-A-KIND */}
        {/* =============================================================== */}
        {activeStage === "deck" && (
          <div className="howto-stage-content">
            <div className="stage-text-block">
              <span className="stage-eyebrow">RULE 1: THE CORE GOAL</span>
              <h2 className="stage-title">Collect 4 Cards of the Exact Same Shape</h2>
              <p className="stage-paragraph">
                Jackpot is played with a deck of <strong>32 cards</strong> across <strong>8 distinct shapes</strong> (Circle, Triangle, Cross, Square, Star, Diamond, Heart, Moon).
                Each player holds exactly <strong>4 cards</strong> in their hand.
              </p>
              <div className="stage-rule-box">
                <span className="rule-icon">💡</span>
                <div>
                  <strong>Only shapes matter — numbers are purely for identification.</strong>
                  <p>Your ultimate goal is to collect all 4 cards of any single shape. The moment you hold 4-of-a-kind, you are Jackpot-ready!</p>
                </div>
              </div>
            </div>

            {/* Interactive Hand Demo */}
            <div className="howto-interactive-panel">
              <div className="panel-header">
                <span className="panel-title">INTERACTIVE HAND SIMULATION</span>
                <span className={`status-pill ${handHasFour ? "success" : "waiting"}`}>
                  {handHasFour ? "🎉 4-OF-A-KIND READY!" : "⏳ 3-OF-A-KIND (1 CARD NEEDED)"}
                </span>
              </div>

              {/* Suit Selector Chips */}
              <div className="suit-selector-row">
                <span className="suit-selector-label">Test Shape:</span>
                {(["star", "circle", "cross", "square", "diamond"] as Suit[]).map((suit) => (
                  <button
                    key={suit}
                    type="button"
                    className={`suit-chip ${selectedSuit === suit ? "active" : ""}`}
                    onClick={() => {
                      setSelectedSuit(suit);
                      if (mismatchedSuit === suit) {
                        setMismatchedSuit(suit === "star" ? "triangle" : "star");
                      }
                    }}
                  >
                    {suit.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Cards Fan */}
              <div className={`howto-cards-row ${handHasFour ? "is-four-matching-row" : ""}`}>
                {demoCards.map((card, idx) => {
                  const isMatch = card.suit === selectedSuit;
                  return (
                    <div
                      key={card.id}
                      className={`howto-card-slot ${!isMatch ? "mismatched-slot" : ""} ${
                        handHasFour ? "jackpot-glow" : ""
                      }`}
                      onClick={idx === 3 ? handleSwapCard : undefined}
                      title={idx === 3 ? "Click to swap this card" : ""}
                    >
                      <WhotCard
                        card={card}
                        className={handHasFour ? "is-four-matching" : idx === 3 ? "selected" : ""}
                      />
                      {idx === 3 && !handHasFour && (
                        <div className="swap-badge-hint">Click to Swap ➔</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Interactive Control & Feedback */}
              <div className="hand-controls-footer">
                <button
                  type="button"
                  className={`interactive-cta-btn ${handHasFour ? "reset-btn" : "action-btn"}`}
                  onClick={handleSwapCard}
                >
                  {handHasFour ? "🔄 Reset Hand (Back to 3 of 4)" : "🂠 Swap 4th Card to Complete 4-of-a-Kind!"}
                </button>

                {handHasFour && (
                  <div className="jackpot-alert-banner">
                    <strong>👑 JACKPOT READY!</strong>
                    <span>
                      You have 4 {selectedSuit.toUpperCase()}S! <em>DO NOT shout Jackpot yourself!</em> Look at your partner and perform your secret signal!
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* STAGE 2: CLOCKWISE PASSING */}
        {/* =============================================================== */}
        {activeStage === "passing" && (
          <div className="howto-stage-content">
            <div className="stage-text-block">
              <span className="stage-eyebrow">RULE 2: THE MOVEMENT OF CARDS</span>
              <h2 className="stage-title">Relentless Clockwise Passing</h2>
              <p className="stage-paragraph">
                The game does not use traditional slow turns. Instead, cards circulate continuously <strong>clockwise</strong> around the table.
                One designated player starts with a 5th pass token. They choose an unwanted card and pass it to the neighbor on their right (clockwise).
              </p>
              <div className="stage-rule-box">
                <span className="rule-icon">⚡</span>
                <div>
                  <strong>Maintain 4 cards in hand at all times.</strong>
                  <p>When a card is passed to you, quickly decide whether it helps your set. Keep what you need, and pass your discard clockwise!</p>
                </div>
              </div>
            </div>

            {/* Interactive Mini-Table Passing Demo */}
            <div className="howto-interactive-panel">
              <div className="panel-header">
                <span className="panel-title">MINI-TABLE PASSING SIMULATOR</span>
                <span className="status-pill clockwise-pill">↻ CLOCKWISE DIRECTION</span>
              </div>

              <div className="mini-table-visual">
                {/* North Seat: Partner */}
                <div className={`mini-seat seat-north ${passStep === 2 ? "active-seat" : ""}`}>
                  <div className="mini-seat-avatar bravo">P</div>
                  <div className="mini-seat-meta">
                    <strong>Partner</strong>
                    <small>Team Bravo</small>
                  </div>
                </div>

                {/* East Seat: Opponent Alpha */}
                <div className={`mini-seat seat-east ${passStep === 3 ? "active-seat" : ""}`}>
                  <div className="mini-seat-avatar alpha">R1</div>
                  <div className="mini-seat-meta">
                    <strong>Rival East</strong>
                    <small>Team Alpha</small>
                  </div>
                </div>

                {/* South Seat: You */}
                <div className={`mini-seat seat-south ${passStep === 0 ? "active-seat" : ""}`}>
                  <div className="mini-seat-avatar bravo you">YOU</div>
                  <div className="mini-seat-meta">
                    <strong>You</strong>
                    <small>Team Bravo</small>
                  </div>
                </div>

                {/* West Seat: Opponent Alpha */}
                <div className={`mini-seat seat-west ${passStep === 1 ? "active-seat" : ""}`}>
                  <div className="mini-seat-avatar alpha">R2</div>
                  <div className="mini-seat-meta">
                    <strong>Rival West</strong>
                    <small>Team Alpha</small>
                  </div>
                </div>

                {/* Center Felt / Passing Indicator */}
                <div className="mini-table-felt">
                  <div className={`passing-card-flight ${isPassing ? "in-motion" : ""} step-${passStep}`}>
                    🂠
                  </div>
                  <div className="felt-compass-ring">
                    <span className="felt-arrow">↻</span>
                    <small>PASS</small>
                  </div>
                </div>
              </div>

              {/* Ticker & Button */}
              <div className="passing-feedback-bar">
                <p className="passing-ticker-text">{lastPassMessage}</p>
                <button
                  type="button"
                  className="interactive-cta-btn action-btn"
                  onClick={handlePassCard}
                  disabled={isPassing}
                >
                  {isPassing ? "Card in Flight..." : "➔ Click to Pass One Card Clockwise"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* STAGE 3: SECRET SIGNALS */}
        {/* =============================================================== */}
        {activeStage === "signals" && (
          <div className="howto-stage-content">
            <div className="stage-text-block">
              <span className="stage-eyebrow">RULE 3: THE HEART OF THE BLUFF</span>
              <h2 className="stage-title">Silent Communication With Your Partner</h2>
              <p className="stage-paragraph">
                Before the match starts, each team enters a <strong>Private Team Strategy Room</strong> to agree on a secret signal.
                Partners sit across the table from each other. When you complete your 4-of-a-kind, <strong>NEVER say anything out loud!</strong>
              </p>
              <div className="stage-rule-box alert-box">
                <span className="rule-icon">⚠️</span>
                <div>
                  <strong>THE GOLDEN RULE OF JACKPOT:</strong>
                  <p>You cannot call Jackpot for yourself. <strong>ONLY your partner can call JACKPOT for you</strong> when they notice your signal!</p>
                </div>
              </div>
            </div>

            {/* Interactive Signal Studio */}
            <div className="howto-interactive-panel">
              <div className="panel-header">
                <span className="panel-title">SECRET SIGNAL SIMULATOR</span>
                <span className="status-pill">{chosenSignal.label}</span>
              </div>

              {/* Signal Choice Buttons */}
              <div className="signal-selector-grid">
                {SIGNALS_LIST.map((sig) => (
                  <button
                    key={sig.id}
                    type="button"
                    className={`signal-select-card ${chosenSignal.id === sig.id ? "selected" : ""}`}
                    onClick={() => handlePerformSignal(sig)}
                  >
                    <span className="sig-icon">{sig.icon}</span>
                    <strong className="sig-title">{sig.label}</strong>
                    <small className="sig-detail">{sig.animation}</small>
                  </button>
                ))}
              </div>

              {/* Simulation Table Preview */}
              <div className="signal-demo-arena">
                <div className={`signal-player-pod you-pod ${signalActive ? "performing-signal" : ""}`}>
                  <div className="pod-avatar">YOU</div>
                  <span className="pod-name">You (South)</span>
                  {signalActive && (
                    <div className="signal-speech-bubble">
                      {chosenSignal.icon} <em>{chosenSignal.animation}</em>
                    </div>
                  )}
                </div>

                <div className="signal-arena-middle">
                  <div className="secret-signal-line" />
                  <span className="secret-signal-tag">EYE CONTACT ACROSS TABLE</span>
                </div>

                <div className={`signal-player-pod partner-pod ${signalActive ? "partner-alerted" : ""}`}>
                  <div className="pod-avatar">P</div>
                  <span className="pod-name">Partner (North)</span>
                  {signalActive && (
                    <div className="signal-speech-bubble partner-bubble">
                      👀 <em>"I saw the {chosenSignal.label}! Calling JACKPOT!"</em>
                    </div>
                  )}
                </div>
              </div>

              {/* Signal Results Bar */}
              <div className="signal-trigger-bar">
                <button
                  type="button"
                  className="interactive-cta-btn action-btn"
                  onClick={() => handlePerformSignal(chosenSignal)}
                >
                  🎬 Click to Perform Signal: &quot;{chosenSignal.label}&quot;
                </button>
                {signalFeedback && <span className="signal-result-text">{signalFeedback}</span>}
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* STAGE 4: CALLING JACKPOT */}
        {/* =============================================================== */}
        {activeStage === "jackpot" && (
          <div className="howto-stage-content">
            <div className="stage-text-block">
              <span className="stage-eyebrow">RULE 4: SCORING POINTS</span>
              <h2 className="stage-title">Slamming JACKPOT &amp; Claiming Letters</h2>
              <p className="stage-paragraph">
                When you spot your teammate performing the secret signal, slam the <strong>JACKPOT</strong> button immediately!
                The table freezes for 500ms while hands are inspected.
              </p>
              <div className="stage-rule-box">
                <span className="rule-icon">🎯</span>
                <div>
                  <strong>Correct Jackpot: +1 Letter toward JACKPOT!</strong>
                  <p>If your teammate holds four matching cards, your team scores a point and unlocks the next letter on the board.</p>
                </div>
              </div>
              <div className="stage-rule-box alert-box">
                <span className="rule-icon">❌</span>
                <div>
                  <strong>False Jackpot: The Bluff Backfire!</strong>
                  <p>If you call Jackpot but your teammate does NOT hold 4-of-a-kind, it counts as a False Call. Opponents get the advantage!</p>
                </div>
              </div>
            </div>

            {/* Interactive Call Tester */}
            <div className="howto-interactive-panel">
              <div className="panel-header">
                <span className="panel-title">JACKPOT CALL TESTER</span>
                <span className="status-pill gold-pill">SCORE: {jackpotScore}/7 LETTERS</span>
              </div>

              <div className="call-tester-dock">
                <button
                  type="button"
                  className="call-action-btn jackpot-call-btn"
                  onClick={() => {
                    setJackpotOutcome("valid");
                    setJackpotScore((s) => Math.min(s + 1, 7));
                  }}
                >
                  <span className="btn-crown">♛</span>
                  <strong>CALL JACKPOT!</strong>
                  <small>(Simulate Valid: Teammate has 4-of-a-kind)</small>
                </button>

                <button
                  type="button"
                  className="call-action-btn false-call-btn"
                  onClick={() => setJackpotOutcome("false")}
                >
                  <span className="btn-crown">⚠️</span>
                  <strong>MISTAKEN CALL</strong>
                  <small>(Simulate False: Teammate had only 3 cards)</small>
                </button>
              </div>

              {/* Call Result Alert */}
              {jackpotOutcome === "valid" && (
                <div className="call-result-banner success-result">
                  <div className="result-header">
                    <span className="result-icon">🎉</span>
                    <strong>VALID JACKPOT! TEAM SCORES +1 POINT!</strong>
                  </div>
                  <p>Your teammate held 4 Stars. Your team earned the next letter on the board!</p>
                </div>
              )}

              {jackpotOutcome === "false" && (
                <div className="call-result-banner fail-result">
                  <div className="result-header">
                    <span className="result-icon">🚫</span>
                    <strong>FALSE JACKPOT CALL!</strong>
                  </div>
                  <p>Teammate only had 3 matching cards. The round was not completed. Be careful with false alarms!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* STAGE 5: THE SUSPECT COUNTER */}
        {/* =============================================================== */}
        {activeStage === "suspect" && (
          <div className="howto-stage-content">
            <div className="stage-text-block">
              <span className="stage-eyebrow">RULE 5: BLUFF CATCHING &amp; STEALS</span>
              <h2 className="stage-title">Calling SUSPECT on Opponents</h2>
              <p className="stage-paragraph">
                You are not only looking at your partner — you must keep your eyes on the opponents!
                If you see an opponent nodding, tapping, or acting suspicious, you can shout <strong>SUSPECT</strong> on their seat!
              </p>
              <div className="stage-rule-box">
                <span className="rule-icon">🕵️</span>
                <div>
                  <strong>Caught! (Successful Suspect):</strong>
                  <p>If the accused opponent has 4-of-a-kind or was caught signaling, <strong>YOUR TEAM WINS THE POINT!</strong> You stole their victory!</p>
                </div>
              </div>
              <div className="stage-rule-box alert-box">
                <span className="rule-icon">🛡️</span>
                <div>
                  <strong>False Suspect Penalty:</strong>
                  <p>Each team only has <strong>3 Suspect Tokens</strong> per round. If you call suspect falsely, you burn a token. If you run out of tokens, you cannot suspect for the rest of the round!</p>
                </div>
              </div>
            </div>

            {/* Interactive Suspect Demo */}
            <div className="howto-interactive-panel">
              <div className="panel-header">
                <span className="panel-title">SUSPECT &amp; BLUFF-CATCH SIMULATOR</span>
                <span className="status-pill suspect-pill">
                  TOKENS REMAINING: {suspectsLeft}/3
                </span>
              </div>

              {/* Target Opponent Preview */}
              <div className="suspect-target-card">
                <div className="target-avatar">R1</div>
                <div className="target-details">
                  <div className="target-name-line">
                    <strong>Rival West (Team Alpha)</strong>
                    <span className="target-action-tag">👀 Just scratched their nose twice!</span>
                  </div>
                  <p className="target-desc">Are they transmitting a secret signal to their teammate?</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="suspect-actions-row">
                <button
                  type="button"
                  className="interactive-cta-btn suspect-btn"
                  onClick={() => {
                    setSuspectOutcome("caught");
                  }}
                  disabled={suspectsLeft <= 0}
                >
                  🚨 Call SUSPECT on West (Simulate Catch!)
                </button>

                <button
                  type="button"
                  className="interactive-cta-btn false-suspect-btn"
                  onClick={() => {
                    setSuspectOutcome("false");
                    setSuspectsLeft((s) => Math.max(s - 1, 0));
                  }}
                  disabled={suspectsLeft <= 0}
                >
                  ❌ Test False Suspect (Burns 1 Token)
                </button>
              </div>

              {/* Suspect Outcome Feedback */}
              {suspectOutcome === "caught" && (
                <div className="call-result-banner success-result">
                  <div className="result-header">
                    <span className="result-icon">🎯</span>
                    <strong>CAUGHT RED-HANDED! STEAL SUCCESSFUL!</strong>
                  </div>
                  <p>West was holding 4 Squares! Your team exposed their signal and scored +1 point!</p>
                </div>
              )}

              {suspectOutcome === "false" && (
                <div className="call-result-banner fail-result">
                  <div className="result-header">
                    <span className="result-icon">⚠️</span>
                    <strong>FALSE ACCUSATION!</strong>
                  </div>
                  <p>West only had 2 Squares. You burned 1 Suspect token. Tokens left: {suspectsLeft}/3.</p>
                  {suspectsLeft <= 0 && (
                    <button
                      type="button"
                      className="reset-pill-link"
                      onClick={() => {
                        setSuspectsLeft(3);
                        setSuspectOutcome("none");
                      }}
                    >
                      Reset Suspect Tokens to 3
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* STAGE 6: SPELLING JACKPOT */}
        {/* =============================================================== */}
        {activeStage === "scoreboard" && (
          <div className="howto-stage-content">
            <div className="stage-text-block">
              <span className="stage-eyebrow">RULE 6: THE FINAL OBJECTIVE</span>
              <h2 className="stage-title">First Team to Spell J-A-C-K-P-O-T Wins!</h2>
              <p className="stage-paragraph">
                The match is divided into multiple rounds. Each time a team successfully executes a Jackpot call or intercepts with a correct Suspect,
                they earn the next letter of the word <strong>J - A - C - K - P - O - T</strong> (7 points total).
              </p>
              <div className="stage-rule-box">
                <span className="rule-icon">👑</span>
                <div>
                  <strong>Grand Match Victory:</strong>
                  <p>The first team to unlock all 7 letters wins the entire match, triggers the championship podium, and earns the crown!</p>
                </div>
              </div>
            </div>

            {/* Interactive Wordboard Demo */}
            <div className="howto-interactive-panel">
              <div className="panel-header">
                <span className="panel-title">INTERACTIVE SCOREBOARD TRACKER</span>
                <span className="status-pill gold-pill">RACE TO 7 LETTERS</span>
              </div>

              {/* Team Alpha Scoreboard */}
              <div className="demo-scoreboard-team">
                <div className="team-score-header">
                  <span className="team-badge alpha">TEAM ALPHA</span>
                  <span className="team-count">{alphaLetters}/7 Letters</span>
                </div>
                <div className="demo-jackpot-letters">
                  {["J", "A", "C", "K", "P", "O", "T"].map((char, index) => (
                    <span
                      key={index}
                      className={`demo-char ${index < alphaLetters ? "earned earned-alpha" : ""}`}
                    >
                      {char}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="mini-point-btn"
                  onClick={() => setAlphaLetters((l) => (l >= 7 ? 0 : l + 1))}
                >
                  {alphaLetters >= 7 ? "Reset Alpha" : "+ Add Point to Alpha"}
                </button>
              </div>

              {/* Team Bravo Scoreboard */}
              <div className="demo-scoreboard-team">
                <div className="team-score-header">
                  <span className="team-badge bravo">TEAM BRAVO (YOU &amp; PARTNER)</span>
                  <span className="team-count">{bravoLetters}/7 Letters</span>
                </div>
                <div className="demo-jackpot-letters">
                  {["J", "A", "C", "K", "P", "O", "T"].map((char, index) => (
                    <span
                      key={index}
                      className={`demo-char ${index < bravoLetters ? "earned earned-bravo" : ""}`}
                    >
                      {char}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="mini-point-btn highlight"
                  onClick={() => setBravoLetters((l) => (l >= 7 ? 0 : l + 1))}
                >
                  {bravoLetters >= 7 ? "Reset Bravo" : "+ Add Point to Bravo"}
                </button>
              </div>

              {bravoLetters >= 7 && (
                <div className="grand-victory-announcement">
                  <strong>🏆 GRAND MATCH CHAMPION! TEAM BRAVO SPELLED J-A-C-K-P-O-T!</strong>
                  <p>Congratulations! You have mastered all rules and mechanics of Jackpot!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Navigation Bar */}
        <div className="howto-card-footer">
          <div className="stage-nav-buttons">
            <button
              type="button"
              className="ghost-btn"
              disabled={activeStage === "deck"}
              onClick={() => {
                const currentIndex = STAGES.findIndex((s) => s.key === activeStage);
                if (currentIndex > 0) setActiveStage(STAGES[currentIndex - 1].key);
              }}
            >
              ← Previous Rule
            </button>

            <button
              type="button"
              className="game-primary-btn next-stage-btn"
              onClick={() => {
                const currentIndex = STAGES.findIndex((s) => s.key === activeStage);
                if (currentIndex < STAGES.length - 1) {
                  setActiveStage(STAGES[currentIndex + 1].key);
                } else {
                  onCreateRoom();
                }
              }}
            >
              {activeStage === "scoreboard" ? "Play Now: Create Room ➔" : "Next Rule ➔"}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Reference Summary Plaque */}
      <div className="howto-summary-grid">
        <div className="summary-box">
          <span className="summary-icon">🂠</span>
          <strong className="summary-heading">4 Cards per Hand</strong>
          <p>Collect four of the same shape. Only shapes matter — numbers are identification only.</p>
        </div>
        <div className="summary-box">
          <span className="summary-icon">🔄</span>
          <strong className="summary-heading">Clockwise Passing</strong>
          <p>Pass unwanted cards clockwise in real time. Maintain exactly 4 cards in hand.</p>
        </div>
        <div className="summary-box">
          <span className="summary-icon">🤫</span>
          <strong className="summary-heading">Secret Signals</strong>
          <p>Never yell Jackpot yourself. Silently signal your partner sitting across the table.</p>
        </div>
        <div className="summary-box">
          <span className="summary-icon">👀</span>
          <strong className="summary-heading">3 Suspects per Round</strong>
          <p>Catch opponent signals to steal points, but beware of false accusations burning tokens.</p>
        </div>
      </div>

      {/* Bottom CTA Bar */}
      <div className="howto-bottom-cta">
        <button type="button" className="game-primary-btn cta-play-btn" onClick={onCreateRoom}>
          👑 Create a Room &amp; Play
        </button>
        <button type="button" className="game-secondary-btn cta-join-btn" onClick={onJoinRoom}>
          ⚡ Join Match with Code
        </button>
        <button type="button" className="ghost-btn cta-back-btn" onClick={onBack}>
          ← Back to Main Menu
        </button>
      </div>
    </div>
  );
}
