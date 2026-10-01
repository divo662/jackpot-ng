This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Multiplayer table backend

Room, team, strategy, signal, card, pass, score, and result state is stored in Neon Postgres. The API uses optimistic version checks to reject overlapping updates instead of silently overwriting another player's action. Browsers receive room updates by polling, and seat access is bound to an HTTP-only cookie scoped to each room. Each player receives their own hand and card backs for all other seats.

### Connect Neon

1. Create a Neon project and copy its **pooled** Postgres connection string.
2. Create `.env.local` in the project root and set `DATABASE_URL` to that connection string. `.env.local` is ignored by Git.
3. Restart `npm run dev`. The app creates the `jackpot_rooms` table on its first room API request. The matching SQL is in `database/schema.sql` if you prefer to run it from Neon SQL Editor.
4. In Vercel, add `DATABASE_URL` to Preview and Production environment variables, then redeploy.

### Dynamic card deal

The deck scales with the room: four, six, or eight players receive four cards each, with exactly four copies of each of the same number of shapes as players. The shuffled deck is fully dealt and the draw pile is empty. Deals are retried if a player starts with all four copies of one shape. The first seat receives a temporary fifth pass token, which moves clockwise as players pass one card.

Passing sends one card clockwise from the single hand holding one extra card. The table has no center card or pile. If the agreed Jackpot rules require a different six-player remainder policy, change that configuration before release.

Teams choose one shared private signal during a 60-second strategy period. Teammates see the same selection; changing it clears prior agreement, and it locks when everyone on the team agrees or when strategy time expires. At expiry the server deals the table and advances all room clients.

During a round, a team has three shared SUSPECT calls. A wrong call consumes one attempt but does not end the round; a correct call resolves it and scores. The three-call limit is configurable in `SUSPECT_ATTEMPTS_PER_TEAM`. Players can flash their team signal or a server-selected decoy signal. The decoy appears as an ordinary signal until a SUSPECT call; then every player is told who called, whether the call was correct, and whether the latest signal was genuine or fake. The authenticity stays server-private until that reveal. The brief specifies the attempt limit but not an additional score penalty for a false SUSPECT, so the configured penalty is one consumed attempt.

Run `npm run dev` to try the app, `npm run lint` for ESLint, and `npm run build` for a production build.
