import type { Metadata } from "next";
import { H2, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Jackpot",
  description: "How Jackpot handles your nickname, account details, room data and local settings.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Jackpot is a four-player team card game you can play against AI bots or with friends in shared rooms. This
        page explains what information the game uses and why.
      </p>

      <H2>Information we handle</H2>
      <ul>
        <li><strong>Nickname / profile:</strong> the display name and avatar you choose, shown to other players in your room.</li>
        <li><strong>Account (optional):</strong> if you create an account we store your username, avatar and game stats (wins, jackpots called, suspects caught). An email address and password are only stored if you provide them when signing up.</li>
        <li><strong>Room and match data:</strong> room codes, seats, teams, card passes, signals, SUSPECT and JACKPOT calls and chat messages for shared rooms. This is stored temporarily so the match can run and sync between players.</li>
        <li><strong>On-device settings:</strong> your sound and music preferences, offline team name, chosen AI partner and bot difficulty are saved in your browser&apos;s local storage. Guest progress may also live there.</li>
      </ul>

      <H2>How we use it</H2>
      <ul>
        <li>To run matches, keep rooms in sync and resolve rounds fairly.</li>
        <li>To save your profile, stats and preferences.</li>
        <li>To keep the service working and secure, and to fix bugs.</li>
      </ul>

      <H2>What we don&apos;t do</H2>
      <ul>
        <li>We do not sell your personal information.</li>
        <li>We do not show third-party advertising.</li>
        <li>AI bots play only from what they can legitimately observe at the table; they are never given other players&apos; hidden cards.</li>
      </ul>

      <H2>Sharing</H2>
      <p>
        Your nickname, avatar, in-game actions and room chat are visible to other players in the same room. We rely on
        hosting and database providers to run the game; they process data only to provide that infrastructure.
      </p>

      <H2>Retention and deletion</H2>
      <p>
        Room data is kept only as long as needed to run and resume matches and may be cleaned up automatically after
        inactivity. You can clear on-device data any time by clearing your browser site data. To request removal of your
        account, contact us using the link below.
      </p>

      <H2>Cookies and storage</H2>
      <p>
        We use browser local storage and a service worker (for the installable app experience and offline page). We do
        not use tracking or advertising cookies. The cookie notice on first launch records your choice on your device only.
      </p>

      <H2>Children</H2>
      <p>
        Jackpot is not directed at children under 13. If you believe a child has given us personal information, contact
        us and we will remove it.
      </p>

      <H2>Changes</H2>
      <p>We may update this policy as the game evolves. The date above shows the latest revision.</p>
    </LegalPage>
  );
}
