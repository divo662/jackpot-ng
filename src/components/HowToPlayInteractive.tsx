"use client";

import React, { useState } from "react";
import { WhotCard } from "@/components/WhotCard";
import type { JackpotCard, Suit } from "@/lib/deck";

type HowToProps = {
  onBack: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
};

type StepKey = 1 | 2 | 3 | 4 | 5;

const STEPS = [
  { step: 1, title: "Objective", short: "4-of-a-Kind" },
  { step: 2, title: "Passing", short: "Clockwise" },
  { step: 3, title: "Signals", short: "Secret Cues" },
  { step: 4, title: "Calls", short: "Jackpot & Suspect" },
  { step: 5, title: "Victory", short: "Spell JACKPOT" },
] as const;

export function HowToPlayInteractive({ onBack, onCreateRoom, onJoinRoom }: HowToProps) {
  const [currentStep, setCurrentStep] = useState<StepKey>(1);

  // Step 1: Hand state
  const [hasFour, setHasFour] = useState(false);

  // Step 2: Passing simulation
  const [passCount, setPassCount] = useState(0);
  const [passingActive, setPassingActive] = useState(false);

  // Step 3: Signal choice
  const [activeSignal, setActiveSignal] = useState<{ symbol: string; label: string }>({
    symbol: "↕️",
    label: "Nod",
  });
  const [showSignalBubble, setShowSignalBubble] = useState(false);

  // Step 4: Call test
  const [testedCall, setTestedCall] = useState<"none" | "jackpot" | "suspect">("none");

  // Step 5: Letters earned preview
  const [earnedLetters, setEarnedLetters] = useState(4);

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep((prev) => (prev + 1) as StepKey);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep((prev) => (prev - 1) as StepKey);
  };

  // Demo cards for Step 1
  const stepOneCards: JackpotCard[] = [
    { id: "star-1", suit: "star", number: 1 },
    { id: "star-2", suit: "star", number: 2 },
    { id: "star-3", suit: "star", number: 3 },
    hasFour
      ? { id: "star-4", suit: "star", number: 4 }
      : { id: "cross-1", suit: "cross", number: 5 },
  ];

  return (
    <div className="how-page-root">
      {/* Top Navigation Bar */}
      <header className="how-topbar">
        <div className="how-stepper-track" role="tablist" aria-label="Rulebook steps">
          {STEPS.map((s) => {
            const isActive = currentStep === s.step;
            const isDone = currentStep > s.step;
            return (
              <button
                key={s.step}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setCurrentStep(s.step as StepKey)}
                className={`how-step-pill ${isActive ? "active" : ""} ${isDone ? "completed" : ""}`}
              >
                <span className="step-num">{s.step}</span>
                <span className="step-text">{s.short}</span>
              </button>
            );
          })}
        </div>

        <button type="button" onClick={onCreateRoom} className="how-quick-play-btn">
          Play Now 🚀
        </button>
      </header>

      {/* Main Single-Page Card Container */}
      <main className="how-card-viewport">
        <section className="how-slide-card" key={currentStep}>
          {/* Step 1: Collect 4-of-a-Kind */}
          {currentStep === 1 && (
            <div className="how-step-content">
              <div className="how-step-header">
                <span className="how-step-badge">STEP 1 OF 5 • CORE OBJECTIVE</span>
                <h1 className="how-step-title">Collect 4 Cards of the Same Shape</h1>
                <p className="how-step-desc">
                  Every player starts with 4 cards. Your goal is to collect all 4 cards of any single shape
                  (Stars, Circles, Triangles, Crosses, Squares, Diamonds, Hearts, or Moons).
                </p>
              </div>

              {/* Clean Visual: 4 Cards with ample spacing */}
              <div className="how-visual-box">
                <div className="how-cards-row">
                  {stepOneCards.map((c) => (
                    <WhotCard key={c.id} card={c} />
                  ))}
                </div>

                <div className="how-action-prompt">
                  {hasFour ? (
                    <div className="how-ready-badge">
                      <span className="badge-icon">⚡</span>
                      <strong>JACKPOT READY!</strong>
                      <span>You have 4 Stars. Silently signal your partner!</span>
                    </div>
                  ) : (
                    <div className="how-needed-badge">
                      <span>Holding 3 Stars + 1 Cross — <strong>1 card needed</strong></span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setHasFour((prev) => !prev)}
                    className="how-toggle-action-btn"
                  >
                    {hasFour ? "Reset Hand" : "Complete 4-of-a-Kind ➔"}
                  </button>
                </div>
              </div>

              <div className="how-rules-bullets">
                <div className="how-bullet">
                  <span className="bullet-icon">✨</span>
                  <div>
                    <strong>Only Shapes Matter</strong>
                    <p>Numbers (1–8) are purely for identification. Collect identical shapes to win.</p>
                  </div>
                </div>
                <div className="how-bullet">
                  <span className="bullet-icon">🤫</span>
                  <div>
                    <strong>Keep It Secret</strong>
                    <p>Do NOT yell when you get 4-of-a-kind! You must signal your teammate secretly.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Clockwise Passing */}
          {currentStep === 2 && (
            <div className="how-step-content">
              <div className="how-step-header">
                <span className="how-step-badge">STEP 2 OF 5 • REAL-TIME PASSING</span>
                <h1 className="how-step-title">Cards Pass Clockwise Around the Table</h1>
                <p className="how-step-desc">
                  Jackpot has no pause! Players constantly pass 1 unwanted card to the player on their left.
                  Keep what matches your set, and discard the rest.
                </p>
              </div>

              {/* Visual Table Circulation */}
              <div className="how-visual-box">
                <div className="how-circulate-demo">
                  <div className="demo-player you">
                    <span className="demo-avatar">👤</span>
                    <span className="demo-label">You (South)</span>
                  </div>
                  <div className={`demo-pass-arrow right ${passingActive ? "passing" : ""}`}>➔</div>

                  <div className="demo-player opponent-left">
                    <span className="demo-avatar">🤖</span>
                    <span className="demo-label">West</span>
                  </div>
                  <div className={`demo-pass-arrow up ${passingActive ? "passing" : ""}`}>➔</div>

                  <div className="demo-player partner">
                    <span className="demo-avatar">🤝</span>
                    <span className="demo-label">Partner (North)</span>
                  </div>
                  <div className={`demo-pass-arrow left ${passingActive ? "passing" : ""}`}>➔</div>

                  <div className="demo-player opponent-right">
                    <span className="demo-avatar">🤖</span>
                    <span className="demo-label">East</span>
                  </div>
                  <div className={`demo-pass-arrow down ${passingActive ? "passing" : ""}`}>➔</div>
                </div>

                <div className="how-action-prompt">
                  <p className="pass-counter-text">
                    Simulated Passes: <strong>{passCount}</strong> cards circulated
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPassingActive(true);
                      setPassCount((prev) => prev + 1);
                      setTimeout(() => setPassingActive(false), 500);
                    }}
                    className="how-toggle-action-btn"
                  >
                    Simulate Card Pass ↻
                  </button>
                </div>
              </div>

              <div className="how-rules-bullets">
                <div className="how-bullet">
                  <span className="bullet-icon">⚡</span>
                  <div>
                    <strong>Continuous Flow</strong>
                    <p>The extra 5th card circulates endlessly until a team completes 4-of-a-kind.</p>
                  </div>
                </div>
                <div className="how-bullet">
                  <span className="bullet-icon">🤝</span>
                  <div>
                    <strong>Help Your Partner</strong>
                    <p>Notice what shapes your teammate might be hunting and pass matching cards their way.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Secret Signals */}
          {currentStep === 3 && (
            <div className="how-step-content">
              <div className="how-step-header">
                <span className="how-step-badge">STEP 3 OF 5 • TEAM SIGNALS</span>
                <h1 className="how-step-title">Agree on a Secret Signal with Your Partner</h1>
                <p className="how-step-desc">
                  Before the round starts, you and your partner choose a subtle gesture. When you complete
                  four-of-a-kind, flash your signal without opponents catching on!
                </p>
              </div>

              {/* Visual Signal Demonstration */}
              <div className="how-visual-box">
                <div className="how-signal-seat-preview">
                  <div className="preview-avatar-wrap">
                    {showSignalBubble && (
                      <div className="seat-signal-bubble">
                        <span className="seat-signal-symbol">{activeSignal.symbol}</span>
                        <span className="seat-signal-label">Partner: {activeSignal.label}</span>
                      </div>
                    )}
                    <div className="preview-avatar">🤝</div>
                    <span className="preview-name">Your Partner (North)</span>
                  </div>
                </div>

                <div className="how-signal-picker-row">
                  {[
                    { symbol: "↕️", label: "Nod" },
                    { symbol: "🖐️", label: "Tap Table" },
                    { symbol: "🤔", label: "Scratch Head" },
                    { symbol: "😉", label: "Wink" },
                    { symbol: "👓", label: "Adjust Glasses" },
                  ].map((sig) => (
                    <button
                      key={sig.label}
                      type="button"
                      onClick={() => {
                        setActiveSignal(sig);
                        setShowSignalBubble(true);
                        setTimeout(() => setShowSignalBubble(false), 2400);
                      }}
                      className={`signal-pick-chip ${activeSignal.label === sig.label ? "active" : ""}`}
                    >
                      <span>{sig.symbol}</span>
                      <small>{sig.label}</small>
                    </button>
                  ))}
                </div>

                <div className="how-action-prompt">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignalBubble(true);
                      setTimeout(() => setShowSignalBubble(false), 2400);
                    }}
                    className="how-toggle-action-btn"
                  >
                    Test Signal ({activeSignal.symbol} {activeSignal.label})
                  </button>
                </div>
              </div>

              <div className="how-rules-bullets">
                <div className="how-bullet">
                  <span className="bullet-icon">🎭</span>
                  <div>
                    <strong>Fake Signals &amp; Bluffs</strong>
                    <p>Throw fake decoy gestures to bait suspicious opponents into calling false alarms.</p>
                  </div>
                </div>
                <div className="how-bullet">
                  <span className="bullet-icon">👁️</span>
                  <div>
                    <strong>Stay Alert</strong>
                    <p>Keep one eye on the cards you pass and one eye on your partner across the table.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Calling JACKPOT vs SUSPECT */}
          {currentStep === 4 && (
            <div className="how-step-content">
              <div className="how-step-header">
                <span className="how-step-badge">STEP 4 OF 5 • GAME CALLS</span>
                <h1 className="how-step-title">Call JACKPOT to Win — or SUSPECT to Intercept!</h1>
                <p className="how-step-desc">
                  You never call Jackpot for yourself. When you spot your teammate signaling, YOU call JACKPOT!
                  If you catch an opponent signaling, call SUSPECT to steal the win!
                </p>
              </div>

              {/* Visual Calls Showcase */}
              <div className="how-visual-box">
                <div className="how-calls-grid">
                  <div className={`how-call-card jackpot ${testedCall === "jackpot" ? "active" : ""}`}>
                    <div className="call-card-icon">♛</div>
                    <h3>JACKPOT!</h3>
                    <p>Your teammate signaled they have 4-of-a-kind. Call this to claim the point!</p>
                    <button
                      type="button"
                      onClick={() => setTestedCall("jackpot")}
                      className="call-test-btn jackpot"
                    >
                      Test JACKPOT Call
                    </button>
                  </div>

                  <div className={`how-call-card suspect ${testedCall === "suspect" ? "active" : ""}`}>
                    <div className="call-card-icon">!</div>
                    <h3>SUSPECT</h3>
                    <p>You caught an opponent signaling! Catch their 4-of-a-kind to steal the point.</p>
                    <button
                      type="button"
                      onClick={() => setTestedCall("suspect")}
                      className="call-test-btn suspect"
                    >
                      Test SUSPECT Call
                    </button>
                  </div>
                </div>

                {testedCall !== "none" && (
                  <div className="how-call-feedback">
                    {testedCall === "jackpot" ? (
                      <p className="success-text">
                        ✓ <strong>JACKPOT Correct:</strong> Partner holds 4 Stars! Your team scores 1 letter!
                      </p>
                    ) : (
                      <p className="suspect-text">
                        ✓ <strong>SUSPECT Correct:</strong> Opponent had 4 Circles! You intercepted their win!
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="how-rules-bullets">
                <div className="how-bullet">
                  <span className="bullet-icon">⚠️</span>
                  <div>
                    <strong>False Alarms Cost You</strong>
                    <p>Calling False Jackpot or False Suspect wastes your team&apos;s attempts for the round.</p>
                  </div>
                </div>
                <div className="how-bullet">
                  <span className="bullet-icon">⚡</span>
                  <div>
                    <strong>Speed is Everything</strong>
                    <p>If opponents call Suspect before you call Jackpot, they steal your hard-earned point!</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Spelling J-A-C-K-P-O-T to Victory */}
          {currentStep === 5 && (
            <div className="how-step-content">
              <div className="how-step-header">
                <span className="how-step-badge">STEP 5 OF 5 • VICTORY CONDITION</span>
                <h1 className="how-step-title">Spell J-A-C-K-P-O-T to Win the Trophy</h1>
                <p className="how-step-desc">
                  Each round won awards your team 1 letter. The first team to collect all 7 letters
                  spells <strong>J-A-C-K-P-O-T</strong> and takes the match!
                </p>
              </div>

              {/* Letter Tiles Showcase */}
              <div className="how-visual-box">
                <div className="how-word-tiles-row">
                  {["J", "A", "C", "K", "P", "O", "T"].map((char, idx) => {
                    const isEarned = idx < earnedLetters;
                    return (
                      <div
                        key={idx}
                        className={`how-letter-tile ${isEarned ? "earned" : "unearned"}`}
                      >
                        {char}
                      </div>
                    );
                  })}
                </div>

                <div className="how-action-prompt">
                  <p className="pass-counter-text">
                    Team Score: <strong>{earnedLetters} of 7 letters</strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => setEarnedLetters((prev) => (prev >= 7 ? 1 : prev + 1))}
                    className="how-toggle-action-btn"
                  >
                    {earnedLetters >= 7 ? "Reset Score" : "+ Award Letter (Score Point)"}
                  </button>
                </div>
              </div>

              <div className="how-final-cta-box">
                <h3>You&apos;re Ready to Play!</h3>
                <p>Gather your friends, pick your secret signal, and jump into a match.</p>

                <div className="how-final-btn-group">
                  <button type="button" onClick={onCreateRoom} className="how-btn-primary">
                    Create New Room 🎮
                  </button>
                  <button type="button" onClick={onJoinRoom} className="how-btn-secondary">
                    Join with Code ⚡
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Card Navigation */}
          <footer className="how-step-footer">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 1}
              className="how-nav-btn prev"
            >
              ← Previous Step
            </button>

            <span className="how-dots-indicator">
              {STEPS.map((s) => (
                <span
                  key={s.step}
                  className={`dot ${currentStep === s.step ? "active" : ""}`}
                />
              ))}
            </span>

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="how-nav-btn next"
              >
                Next: {STEPS.find((s) => s.step === currentStep + 1)?.title ?? "Step"} ➔
              </button>
            ) : (
              <button
                type="button"
                onClick={onCreateRoom}
                className="how-nav-btn finish"
              >
                Start Playing 🚀
              </button>
            )}
          </footer>
        </section>
      </main>
    </div>
  );
}
