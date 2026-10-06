"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { WhotCard } from "@/components/WhotCard";
import type { JackpotCard } from "@/lib/deck";
import { chooseSuspectDefenseCards } from "@/lib/game";
import type { GameSound } from "@/lib/sound";

export type SuspectSequenceData = {
  callerId: string;
  callerName: string;
  targetId: string;
  targetName: string;
  targetHand: JackpotCard[];
  isTargetHuman: boolean;
  isCallerHuman: boolean;
};

type SuspectRevealOverlayProps = {
  sequence: SuspectSequenceData;
  viewerPlayerId: string;
  playCue: (sound: GameSound) => void;
  onComplete: (selectedCardIds: [string, string], isSuccess: boolean) => void;
};

type RevealStage = "choosing" | "revealing" | "flipping_back" | "result";

export function SuspectRevealOverlay({
  sequence,
  viewerPlayerId,
  playCue,
  onComplete,
}: SuspectRevealOverlayProps) {
  const [stage, setStage] = useState<RevealStage>("choosing");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chosenCards, setChosenCards] = useState<[JackpotCard, JackpotCard] | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [resultState, setResultState] = useState<{ isSuccess: boolean } | null>(null);

  const timersRef = useRef<number[]>([]);
  const completedRef = useRef(false);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Bot choosing flow or dramatic pause
  useEffect(() => {
    if (stage !== "choosing") return;

    if (!sequence.isTargetHuman) {
      // Bot is suspected: dramatic suspense pause, then bot chooses 2 cards
      playCue("suspense");
      addTimer(() => {
        const defensePair = chooseSuspectDefenseCards(sequence.targetHand);
        setChosenCards(defensePair);
        setSelectedIds([defensePair[0].id, defensePair[1].id]);
        startReveal(defensePair);
      }, 750);
    } else {
      // Human is suspected: play dramatic suspense cue
      playCue("suspense");
    }
  }, [stage, sequence, addTimer]);

  // Card selection by human player (must pick exactly 2)
  const handleToggleCard = (cardId: string) => {
    if (stage !== "choosing" || !sequence.isTargetHuman) return;

    playCue("card_click");
    setSelectedIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= 2) {
        // Replace oldest or keep max 2
        return [prev[1], cardId];
      }
      return [...prev, cardId];
    });
  };

  // Human clicks REVEAL CARDS
  const handleHumanConfirmReveal = () => {
    if (selectedIds.length !== 2 || stage !== "choosing") return;
    const cardA = sequence.targetHand.find((c) => c.id === selectedIds[0]);
    const cardB = sequence.targetHand.find((c) => c.id === selectedIds[1]);
    if (!cardA || !cardB) return;

    const pair: [JackpotCard, JackpotCard] = [cardA, cardB];
    setChosenCards(pair);
    startReveal(pair);
  };

  // Transition: choosing -> revealing (card flip) -> 1.5s visible -> flipping_back -> result
  const startReveal = (cards: [JackpotCard, JackpotCard]) => {
    setStage("revealing");
    playCue("card_flip");

    // Quick tick for 3D flip trigger
    addTimer(() => {
      setIsFlipped(true);
    }, 60);

    // Keep revealed cards visible for roughly 1.5 seconds
    addTimer(() => {
      // Start flipping back
      setStage("flipping_back");
      setIsFlipped(false);
      playCue("card_flip");

      // Flip-back animation completes in 350ms, then show result
      addTimer(() => {
        const isSuccess = cards[0].suit === cards[1].suit;
        setResultState({ isSuccess });
        setStage("result");

        if (isSuccess) {
          playCue("caught");
        } else {
          playCue("false_call");
        }

        // Display result briefly, then return to table
        const resultDuration = isSuccess ? 1600 : 1300;
        addTimer(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete([cards[0].id, cards[1].id], isSuccess);
          }
        }, resultDuration);
      }, 380);
    }, 1500 + 400); // 400ms flip time + 1500ms reveal
  };

  // Only the player who made the suspect sees the card faces (or the player whose cards they are)
  const canSeeFaces = sequence.callerId === viewerPlayerId || sequence.targetId === viewerPlayerId;

  return (
    <div
      className={`suspect-reveal-overlay-backdrop ${resultState?.isSuccess ? "pulse-caught" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Jackpot Suspect Reveal"
    >
      <div className="suspect-reveal-container">
        {/* STAGE 1: CHOOSING CARDS */}
        {stage === "choosing" && (
          <>
            {sequence.isTargetHuman ? (
              /* Suspected Human Player UI */
              <div className="suspect-modal-panel suspected-human-panel" role="region">
                <div className="suspect-badge-radar">
                  <span className="suspect-badge-icon">🚨</span>
                  <span className="suspect-badge-tag">INTERCEPTION CALLED</span>
                </div>

                <h2 className="suspect-main-title">YOU’VE BEEN SUSPECTED</h2>
                <p className="suspect-caller-quote">
                  “{sequence.callerName} thinks you’ve got Jackpot.”
                </p>

                <p className="suspect-instruction-note">
                  Select exactly <strong>TWO</strong> cards from your hand to prove your read:
                </p>

                {/* Hand cards selection */}
                <div className="suspect-hand-selection-row">
                  {sequence.targetHand.map((card) => {
                    const isSelected = selectedIds.includes(card.id);
                    return (
                      <div
                        key={card.id}
                        className={`suspect-hand-card-wrapper ${isSelected ? "selected" : ""}`}
                        onClick={() => handleToggleCard(card.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleToggleCard(card.id);
                          }
                        }}
                        aria-pressed={isSelected}
                        aria-label={`Card ${card.suit}`}
                      >
                        <WhotCard card={card} />
                        {isSelected && (
                          <div className="suspect-selected-badge" aria-hidden="true">
                            ✓
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action button */}
                <div className="suspect-actions-footer">
                  <button
                    type="button"
                    className="suspect-reveal-action-btn"
                    disabled={selectedIds.length !== 2}
                    onClick={handleHumanConfirmReveal}
                  >
                    REVEAL CARDS ({selectedIds.length}/2)
                  </button>
                  <small className="suspect-helper-hint">
                    {selectedIds.length === 2
                      ? "Ready! Tap to flip cards to the table."
                      : "Choose 2 cards above to unlock reveal."}
                  </small>
                </div>
              </div>
            ) : (
              /* AI Opponent being suspected - Dramatic table suspense */
              <div className="suspect-modal-panel suspect-waiting-panel" role="region">
                <div className="suspect-badge-radar pulse">
                  <span className="suspect-badge-icon">🎯</span>
                  <span className="suspect-badge-tag">SUSPECT IN PLAY</span>
                </div>

                <h2 className="suspect-main-title">SUSPECT CALLED!</h2>
                <p className="suspect-caller-quote">
                  “{sequence.callerName} thinks {sequence.targetName} has got Jackpot.”
                </p>

                <div className="suspect-bot-status-indicator">
                  <div className="suspect-spinner-ring" />
                  <span>{sequence.targetName} is selecting 2 cards...</span>
                </div>

                {/* Display face-down placeholder cards of suspected opponent */}
                <div className="suspect-bot-hand-preview">
                  {sequence.targetHand.slice(0, 4).map((card, idx) => (
                    <div key={card.id || idx} className="suspect-hand-card-wrapper bot-preview">
                      <WhotCard faceDown />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* STAGE 2 & 3: REVEAL ANIMATION (3D Card-Flip in Center of Screen) */}
        {(stage === "revealing" || stage === "flipping_back") && chosenCards && (
          <div className="suspect-center-reveal-stage" role="region" aria-label="Cards Reveal">
            <div className="suspect-reveal-header">
              <span className="reveal-tag">CARDS REVEAL</span>
              <h3 className="reveal-sub-text">
                {sequence.targetName} reveals 2 cards to {sequence.callerName}
              </h3>
            </div>

            {/* Two Center 3D Flip Cards */}
            <div className={`suspect-cards-flip-arena ${isFlipped ? "flipped" : ""}`}>
              {chosenCards.map((card, idx) => (
                <div key={card.id || idx} className={`suspect-3d-card-wrap card-pos-${idx + 1}`}>
                  <div className="suspect-3d-card-inner">
                    {/* Face Down Back */}
                    <div className="suspect-3d-card-face suspect-3d-card-back">
                      <WhotCard faceDown />
                    </div>
                    {/* Face Up Front (Visible only if canSeeFaces) */}
                    <div className="suspect-3d-card-face suspect-3d-card-front">
                      <WhotCard card={card} faceDown={!canSeeFaces} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="suspect-reveal-timer-bar">
              <div className="suspect-timer-fill" />
            </div>
          </div>
        )}

        {/* STAGE 4: RESULT */}
        {stage === "result" && resultState && (
          <div
            className={`suspect-result-panel ${resultState.isSuccess ? "caught" : "failed"}`}
            role="alert"
          >
            {resultState.isSuccess ? (
              <>
                <div className="suspect-confetti-container" aria-hidden="true">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span key={i} className={`confetti-particle c-${i % 8}`} />
                  ))}
                </div>
                <div className="result-icon-crown">♛ 🚨</div>
                <h2 className="result-headline-title">CAUGHT!</h2>
                <p className="result-headline-sub">“SUSPECT SUCCESSFUL”</p>
                <div className="result-points-badge">+1 POINT AWARDED</div>
              </>
            ) : (
              <>
                <div className="result-icon-cross">❌</div>
                <h2 className="result-headline-title">SUSPECT FAILED</h2>
                <p className="result-headline-sub">“Wrong read.”</p>
                <span className="result-penalty-note">Different suits — safe play!</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
