import type { Metadata } from "next";
import { H2, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | Jackpot",
  description: "The rules for using Jackpot, including fair play, accounts, rooms and chat.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>By using Jackpot you agree to these terms. If you don&apos;t agree, please don&apos;t use the game.</p>

      <H2>The game</H2>
      <p>
        Jackpot is a free, casual card game for entertainment. There is no real-money play, no prizes and nothing of
        monetary value. Points, stats and titles are for fun only.
      </p>

      <H2>Fair play</H2>
      <ul>
        <li>Secret signals, fake signals, bluffing and calling SUSPECT are part of the game and allowed.</li>
        <li>Don&apos;t cheat: no scripts, bots, exploits, tampering with the app or requests, or sharing hidden cards outside the game&apos;s own signals.</li>
        <li>Don&apos;t abuse bugs. Please report them instead.</li>
      </ul>

      <H2>AI bots and difficulty</H2>
      <p>
        AI partners and opponents have different personalities and difficulty levels, and the Hard setting is meant to
        be challenging. Bot behaviour is automated, may change over time, and carries no guarantee of any outcome.
      </p>

      <H2>Accounts and nicknames</H2>
      <ul>
        <li>You&apos;re responsible for your account and anything done with it. Keep your login details private.</li>
        <li>Choose a nickname that isn&apos;t offensive, hateful or impersonating someone else. We may change or remove names that are.</li>
      </ul>

      <H2>Rooms and chat</H2>
      <p>
        Be respectful. Harassment, hate speech, threats, spam and illegal content are not allowed. We may remove
        content, end rooms or restrict access to keep the game friendly.
      </p>

      <H2>Availability</H2>
      <p>
        The game is provided &quot;as is&quot;. We may change, pause or discontinue features at any time, and matches or
        progress may occasionally be lost due to bugs, outages or maintenance.
      </p>

      <H2>Liability</H2>
      <p>
        To the extent permitted by law, we are not liable for any indirect or incidental damages arising from your use
        of the game.
      </p>

      <H2>Changes and termination</H2>
      <p>
        We may update these terms; continuing to play means you accept the updated version. We may suspend access for
        anyone who breaks these terms.
      </p>

      <H2>Privacy</H2>
      <p>
        See our <a href="/privacy" style={{ color: "#fbbf24" }}>Privacy Policy</a> for how your information is handled.
      </p>
    </LegalPage>
  );
}
