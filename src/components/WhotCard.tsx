import type { JackpotCard, Suit } from "@/lib/deck";

type WhotCardProps = {
  card?: JackpotCard;
  /** Face-down opponent card (Whot-style back). */
  faceDown?: boolean;
  selected?: boolean;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
};

const SUIT_LABELS: Record<Suit, string> = {
  circle: "Circle",
  triangle: "Triangle",
  cross: "Cross",
  square: "Square",
  star: "Star",
  diamond: "Diamond",
  heart: "Heart",
  moon: "Moon",
};

/** One deterministic SVG mark per suit so every card face has a visible shape. */
function SuitMark({ suit, size = "lg" }: { suit: Suit; size?: "sm" | "lg" }) {
  const dim = size === "sm" ? 14 : 36;

  switch (suit) {
    case "circle":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="12.5" fill="currentColor" />
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
        </svg>
      );
    case "triangle":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <polygon points="20,4 34,32 6,32" fill="currentColor" />
          <polygon points="20,10 29,28 11,28" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.25" />
        </svg>
      );
    case "cross":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <rect x="15" y="4" width="10" height="32" rx="2" fill="currentColor" />
          <rect x="4" y="15" width="32" height="10" rx="2" fill="currentColor" />
          <rect x="15" y="9" width="10" height="22" rx="2" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" />
        </svg>
      );
    case "square":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <rect x="7" y="7" width="26" height="26" rx="3" fill="currentColor" />
          <rect x="11" y="11" width="18" height="18" rx="2" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.4" />
        </svg>
      );
    case "star":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <polygon
            points="20,3 24.5,15 37,15 27,23 31,36 20,28 9,36 13,23 3,15 15.5,15"
            fill="currentColor"
          />
          <polygon
            points="20,9 22.9,17 31.5,17 24.5,22.3 27.5,30.5 20,25.3 12.5,30.5 15.5,22.3 8.5,17 17.1,17"
            fill="none"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "diamond":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <polygon points="20,4 34,20 20,36 6,20" fill="currentColor" />
          <polygon points="20,10 29,20 20,30 11,20" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" />
        </svg>
      );
    case "heart":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <path
            d="M20 34 C20 34 6 24 6 14.5 C6 9.5 10 6 14.5 6 C17.5 6 19.5 7.8 20 10 C20.5 7.8 22.5 6 25.5 6 C30 6 34 9.5 34 14.5 C34 24 20 34 20 34 Z"
            fill="currentColor"
          />
          <path
            d="M20 30 C20 30 10 22.5 10 15 C10 11 12.5 9 16 9 C18.2 9 19.7 10.4 20 12 C20.3 10.4 21.8 9 24 9 C27.5 9 30 11 30 15 C30 22.5 20 30 20 30 Z"
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "moon":
      return (
        <svg width={dim} height={dim} viewBox="0 0 40 40" aria-hidden>
          <path
            d="M29 5 C18 7 12 14 12 22 C12 30 18 36 27 35 C20 32 17 27 18 20 C19 13 23 8 29 5 Z"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return null;
  }
}

export function WhotCard({
  card,
  faceDown = false,
  selected = false,
  compact = false,
  className = "",
  onClick,
}: WhotCardProps) {
  const classes = [
    "whot-card",
    faceDown ? "face-down" : "face-up",
    selected ? "selected" : "",
    compact ? "compact" : "",
    card?.isPlaceholder ? "placeholder" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (faceDown || !card) {
    return (
      <div className={classes} aria-label="Face-down card" role="img">
        <div className="card-back">
          <span className="card-back-crown" aria-hidden>♛</span>
        </div>
      </div>
    );
  }

  const label = `${SUIT_LABELS[card.suit]} ${card.number ?? ""} card`;
  const faceNumber = card.number ?? 1;
  const face = (
    <>
      <div className="card-corner top-left">
        <span className="card-number">{faceNumber}</span>
        <SuitMark suit={card.suit} size="sm" />
      </div>
      <div className="card-center">
        <SuitMark suit={card.suit} size="lg" />
      </div>
      <div className="card-corner bottom-right">
        <span className="card-number">{faceNumber}</span>
        <SuitMark suit={card.suit} size="sm" />
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} aria-label={label}>
        {face}
      </button>
    );
  }

  return (
    <div className={classes} aria-label={label} role="img">
      {face}
    </div>
  );
}

/** Overlapping fan of face-down cards (opponent hand). */
export function CardFan({
  count,
  compact = false,
}: {
  count: number;
  compact?: boolean;
}) {
  const shown = Math.min(Math.max(count, 0), 5);
  return (
    <div className={`card-fan ${compact ? "compact" : ""}`} aria-hidden>
      {Array.from({ length: shown }, (_, index) => (
        <WhotCard key={index} faceDown compact={compact} className={`fan-card fan-${index}`} />
      ))}
    </div>
  );
}
