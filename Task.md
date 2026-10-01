You are now working on JACKPOT, a real-time multiplayer browser game based on the Nigerian WHOT/Jackpot social card-game experience.

IMPORTANT:
We already have a working prototype in this repository. DO NOT throw away the existing prototype blindly. First inspect the entire codebase, understand the current architecture, identify what already works, and then evolve it into a production-quality multiplayer game.

The goal now is NOT to make another prototype.

The goal is to build the actual core game experience with:
- polished game UI
- real-time multiplayer
- private rooms
- lobby system
- team assignment
- private team strategy rooms
- secret signal selection
- WHOT card gameplay
- real-time game state
- secure server-authoritative game logic
- animations
- notifications/toasts
- reconnection handling
- result screens
- restart/rematch flow

The game should feel like a modern multiplayer game, not like a CRUD application.

==================================================
1. FIRST: INSPECT THE EXISTING PROJECT
==================================================

Before changing code:

1. Inspect the repository structure.
2. Identify:
   - frontend framework
   - backend
   - database
   - realtime technology
   - authentication
   - existing game engine
   - existing card implementation
   - existing room/lobby implementation
   - existing UI components
   - existing animations
3. Run the current project.
4. Understand what the current prototype already implements.
5. Reuse existing working components where possible.
6. Do not replace the entire stack unless there is a compelling technical reason.
7. Keep existing functionality that is useful.
8. Refactor where necessary instead of creating duplicate systems.

Before implementation, create a short internal implementation plan based on the actual repository.

Do NOT assume a technology that isn't already being used.

==================================================
2. PRODUCT PRINCIPLE
==================================================

JACKPOT is a social multiplayer game.

The core experience is:

CREATE ROOM
→ INVITE FRIENDS
→ LOBBY
→ CHAT
→ ASSIGN TEAMS
→ ACCEPT TEAM
→ PRIVATE TEAM STRATEGY ROOM
→ CHAT WITH TEAMMATE
→ CHOOSE SECRET SIGNAL
→ GAME TABLE
→ REAL-TIME WHOT GAMEPLAY
→ JACKPOT / SUSPECT
→ RESULT
→ RESTART / END GAME

The game should feel:
- fast
- social
- competitive
- playful
- Nigerian in identity
- modern
- premium
- simple to understand
- difficult to master
- highly replayable

Do not make the UI feel like an admin dashboard.

It should feel like an actual multiplayer game.

==================================================
3. LANDING PAGE
==================================================

The landing page should be extremely simple.

Primary actions:

1. CREATE ROOM
2. JOIN ROOM
3. SETTINGS

Nothing unnecessary should dominate the first screen.

The landing page should communicate:

JACKPOT

A social multiplayer WHOT game where:
- you team up
- communicate secretly
- read signals
- collect matching cards
- call JACKPOT
- catch opponents with SUSPECT

Use polished game branding.

Do not overload the page.

Primary CTA:
CREATE ROOM

Secondary CTA:
JOIN ROOM

Settings should be accessible from a simple icon/button.

The page must work beautifully on:
- desktop
- tablet
- mobile

==================================================
4. CREATE ROOM
==================================================

When the player clicks CREATE ROOM:

Create a room.

Generate:
- unique room code
- shareable room URL
- room ID
- host/admin identity

The host becomes ADMIN.

Example:

ROOM CODE
7H92K

SHARE ROOM

Copy Link
Copy Code
Native Share where supported

The room should immediately open into the lobby.

The URL should be shareable.

Example conceptual route:

/room/7H92K

Joining through the link should automatically take the player to the correct room.

==================================================
5. JOIN ROOM
==================================================

The JOIN ROOM page should support:

- room code input
- join via shared URL
- nickname/player identity
- avatar selection if the prototype supports it

Validate:
- room exists
- room is joinable
- room is not full
- game has not started
- player is not banned/kicked
- session is valid

If invalid:

Show a friendly game-style error.

Examples:

"Room not found."

"This room is already full."

"This game has already started."

"That room is no longer available."

Do not expose internal server errors.

==================================================
6. PLAYER LIMITS
==================================================

The game must support:

4 players
6 players
8 players

The architecture must NOT hard-code 4 players everywhere.

The number of players determines:

- number of teams
- team size
- cards distributed
- possible passing-card state
- table positions
- player layout
- turn/order state

For MVP:

4 players = 2 teams of 2

6 players = 2 teams of 3

8 players = 2 teams of 4

The team system must be designed generically.

Do not create separate hard-coded implementations for 4/6/8.

Use configuration/data-driven logic.

==================================================
7. LOBBY
==================================================

After joining, everyone enters the LOBBY.

The lobby contains:

TOP:
- JACKPOT logo
- room code
- player count
- game status
- leave room

MAIN:
- player list
- team assignment area
- host/admin controls
- ready status

RIGHT SIDE / COLLAPSIBLE PANEL:
CHAT

The lobby chat is a real-time chat.

Players can:
- send messages
- see timestamps
- see player avatar
- see online status
- see system messages

System messages should appear as visually distinct events.

Examples:

"Kemi joined the room."

"Tobi is ready."

"Maya joined the room."

"Admin assigned teams."

"Teams accepted."

Use real-time updates.

No page refresh should ever be required.

==================================================
8. ADMIN / HOST
==================================================

The room creator is ADMIN.

Only the admin can:

- start team assignment
- manually assign teams
- shuffle teams
- start the game
- restart the game
- end the game
- remove players from lobby
- manage room settings

Do NOT give clients authority over these actions.

The server must verify that the requester is the actual admin.

If admin leaves:

Transfer admin according to a deterministic rule.

Example:
next eligible connected player becomes admin.

Show:

"Divine is now admin."

==================================================
9. TEAM ASSIGNMENT
==================================================

Once enough players have joined:

Admin can choose:

ASSIGN TEAMS

or

SHUFFLE TEAMS

MANUAL ASSIGNMENT:

Admin can drag players into teams.

SHUFFLE:

Server randomly assigns teams.

IMPORTANT:

Randomization must happen server-side.

Do not let the client generate the actual team assignment.

After teams are assigned:

Show a Team Assignment Confirmation screen.

Example:

TEAM BRAVO
Kemi
Tobi

TEAM DELTA
Maya
Charlie

Each player gets:

ACCEPT
REJECT

There is a 5-second countdown.

5
4
3
2
1

If everyone accepts:

Proceed.

If anyone rejects:

Return to team assignment.

The UI should clearly show:

"Waiting for everyone to accept..."

Player status:
✓ Accepted
⏳ Waiting
✕

Do not reveal unnecessary information.

==================================================
10. PRIVATE TEAM STRATEGY ROOM
==================================================

After teams are accepted, players from each team are moved into a PRIVATE TEAM ROOM.

This is extremely important.

Players must ONLY see/chat with their teammates here.

Opponent players must not receive:
- teammate chat
- teammate signal
- strategy messages
- private team state

The private team room should feel like a lightweight messaging app.

It contains:

HEADER:
- Team name
- teammate avatars
- countdown
- exit/leave disabled or controlled

CHAT:
- message bubbles
- timestamps
- player avatar
- typing indicator
- quick reactions if desired

BOTTOM:
message input
send button

SIDE/BOTTOM:
Choose Signal

==================================================
11. TEAM STRATEGY TIMER
==================================================

The private team room has exactly:

30 seconds

for strategy.

Display:

STRATEGY TIME
30

Then:

29
28
27
...

At 0:

Automatically lock the room.

Do NOT rely on client-side timers.

The server owns the actual countdown.

Client only renders it.

If someone reconnects, they should receive the correct remaining server time.

==================================================
12. SECRET SIGNAL SYSTEM
==================================================

Each team must choose a secret signal.

IMPORTANT:

DO NOT use emoji as the signal.

Use custom game icons / animated icons.

Signals should feel like game actions.

Minimum:

10 signal types.

Example signal library:

1. Wave
2. Clap
3. Jump
4. Crouch
5. Spin
6. Point
7. Salute
8. Nod
9. Flash
10. Dance

These should be represented by custom icons/animated character actions.

Do NOT use emoji characters.

Use:
- SVG icons
- custom illustrations
- Lottie animations
- CSS animation
- game character/avatar animations

depending on what already exists in the project.

Each signal should have:

- icon
- name
- short animation preview
- clear selection state

Example:

[ WAVE ]
[ CLAP ]
[ JUMP ]
[ CROUCH ]

When selected:

"Signal selected"

But NEVER show the selected signal to opponents.

==================================================
13. SIGNAL PRIVACY
==================================================

This is a critical security requirement.

The opponent client must NEVER receive:

- the opposing team's selected signal
- private strategy messages
- hidden team metadata
- private signal identifiers

Do not merely hide this data in CSS.

Do not send it to the client.

The server must enforce private information boundaries.

Example:

Team A chooses signal ID 7.

Team B's client must not receive:

signalId: 7

or any equivalent hidden information.

Team A receives it.

Team B only sees the public avatar action when it actually occurs during gameplay.

==================================================
14. SIGNAL LOCK
==================================================

Before the 30 seconds ends:

Player can change signal.

Once the signal is confirmed:

LOCKED.

If the timer expires:

Server automatically locks the selected signal.

If no signal was selected:

Use a safe default signal or require selection before continuing depending on existing game rules.

Do not let the game get stuck.

==================================================
15. TRANSITION TO GAME TABLE
==================================================

After strategy ends:

Show a short transition:

"GET READY"

3
2
1

Then enter the main game table.

Use a smooth transition animation.

Do not immediately hard cut between screens.

==================================================
16. MAIN GAME TABLE
==================================================

The game table is the main gameplay screen.

It must work for:

4 players
6 players
8 players

The layout must dynamically reposition players.

The table should NOT contain a "center pile" unless the actual WHOT/Jackpot rules require it.

IMPORTANT:

This is WHOT/Jackpot.

Do not invent a generic center-card mechanic just because other card games have one.

Cards and passing must follow the actual game rules implemented in the existing prototype / agreed rules engine.

==================================================
17. CARD DISTRIBUTION
==================================================

When the game starts:

The SERVER:

1. Creates/shuffles deck.
2. Determines player count.
3. Determines card distribution.
4. Deals cards.
5. Determines passing state.
6. Determines who currently has the passing card if the rules require one.

Never allow clients to determine their own cards.

Cards must be random but server-authoritative.

Each player should only receive their own private hand.

Other players see:

CARD BACKS.

Never send opponents' actual card values to their clients.

==================================================
18. PASSING CARD SYSTEM
==================================================

The game must clearly communicate who is currently passing a card and who the card is being passed to.

Example:

"Maya is passing a card → Kemi"

Show:

Maya avatar
→
card icon
→
Kemi avatar

Include countdown if passing has a time limit.

Example:

PASSING CARD
12s

The game should also show:

CURRENT PASSER

and:

PASSING TO

This information should be highly visible but not overwhelming.

When a card is passed:

Use an animated card movement.

Example:

Card leaves Maya's hand
→ travels across the table
→ arrives at Kemi.

Then show a lightweight toast:

"Maya passed a card to Kemi."

Do NOT flood the screen with unnecessary notifications.

==================================================
19. GAME STATUS / INFORMATION HIERARCHY
==================================================

The game must always communicate:

1. Current round
2. Team scores
3. Player states
4. Current passer
5. Who is receiving the card
6. Cards remaining where applicable
7. Timer
8. Signal status where appropriate
9. JACKPOT availability
10. SUSPECT availability
11. Connection state
12. Important game events

Use a compact status bar.

Do NOT make the UI visually noisy.

==================================================
20. TOAST / EVENT SYSTEM
==================================================

Build a reusable real-time toast/event system.

Examples:

"Kemi passed a card to Maya."

"Charlie received a card."

"Team Bravo signal is locked."

"10 seconds remaining."

"JACKPOT!"

"Suspect called!"

"False JACKPOT."

"Player disconnected."

"Player reconnected."

Toasts should have categories:

INFO
SUCCESS
WARNING
ERROR
GAME EVENT

Use icons and animation.

Important game events can be larger than normal toasts.

==================================================
21. JACKPOT BUTTON
==================================================

The primary action should be visually obvious.

JACKPOT

It should represent:

"My teammate has completed the required card condition and signaled me."

The client requests the action.

The server validates it.

Never let the client determine whether JACKPOT is correct.

After action:

Show a result animation.

SUCCESS:

"JACKPOT!"

FAILURE:

"FALSE JACKPOT"

Then apply the configured rules.

==================================================
22. SUSPECT BUTTON
==================================================

SUSPECT means:

"I believe an opposing player has completed the Jackpot condition and is signaling."

The button must be visually distinct from JACKPOT.

Server validates the accusation.

If correct:

Show:

"SUSPECT CORRECT"

If wrong:

Show:

"FALSE SUSPECT"

Apply configured penalty.

The player/team's remaining SUSPECT attempts must update in real time.

==================================================
23. ACTION SAFETY
==================================================

Prevent accidental calls.

For high-impact actions:

JACKPOT
SUSPECT

Use either:
- intentional press-and-hold
OR
- lightweight confirmation

depending on what the existing prototype supports.

Do not make the confirmation so slow that it ruins gameplay.

The goal is:

fast enough for competitive play
but safe against accidental taps.

==================================================
24. REAL-TIME ARCHITECTURE
==================================================

The game must be genuinely real-time.

Use the existing realtime infrastructure if appropriate.

Prefer WebSockets or the project's current realtime technology.

The server must be authoritative.

Server owns:

- room state
- player membership
- teams
- team acceptance
- timers
- private rooms
- signals
- cards
- card ownership
- passing
- turn/action state
- JACKPOT validation
- SUSPECT validation
- scoring
- round state
- match state
- admin privileges

Clients only request actions.

Example:

Client:
PASS_CARD(cardId)

Server:
"Is this player allowed to pass this card?"

If yes:

broadcast validated event.

If no:

reject.

==================================================
25. GAME STATE MACHINE
==================================================

Implement explicit game states.

Example:

LOBBY

TEAM_ASSIGNMENT

TEAM_CONFIRMATION

PRIVATE_STRATEGY

SIGNAL_SELECTION

GAME_STARTING

ACTIVE_GAME

PASSING

JACKPOT_CALL

SUSPECT_CALL

ROUND_RESULT

MATCH_RESULT

REMATCH

GAME_ENDED

DISCONNECTED / RECONNECTING

Do not build the game using dozens of unrelated boolean flags.

Use a proper state machine or strongly structured state model.

==================================================
26. RECONNECT SYSTEM
==================================================

Players can lose connection.

Do NOT immediately destroy their state.

When disconnected:

Show:

"Kemi disconnected."

with a small reconnect indicator.

Give a reasonable grace period.

If they reconnect:

Restore:
- same room
- same team
- same hand
- same score
- same signal
- same game state

They should not receive a new hand.

They should not lose their progress simply because of a temporary network issue.

==================================================
27. SECURITY
==================================================

Security is a first-class requirement.

Never trust client input.

Validate server-side:

- player identity
- room membership
- team membership
- admin permissions
- card ownership
- card actions
- passing
- signal selection
- JACKPOT
- SUSPECT
- scoring
- timers
- game state transitions

Prevent:
- forged room events
- fake score updates
- fake card ownership
- unauthorized team changes
- reading opponent cards
- reading opponent signals
- private team chat access
- unauthorized admin actions
- duplicate actions
- replay attacks
- invalid state transitions

Use rate limiting where appropriate.

Log suspicious actions.

==================================================
28. PRIVATE DATA MODEL
==================================================

Separate PUBLIC state from PRIVATE state.

PUBLIC STATE may include:

- player names
- avatars
- team
- online status
- score
- public game events
- visible card backs
- current passer
- current receiver
- timers

PRIVATE PLAYER STATE:

- own cards

PRIVATE TEAM STATE:

- teammate chat
- selected signal
- private strategy

Do not accidentally serialize private state into a public game-state object.

==================================================
29. CHAT
==================================================

Lobby chat:

Everyone can see it.

Team strategy chat:

Only teammates can see it.

Do not reuse the same unrestricted channel.

Use separate channels:

ROOM_CHAT

TEAM_CHAT

The server must enforce membership.

Include:

- message timestamps
- sender avatar
- sender name
- message bubble
- typing indicator if feasible
- unread state
- message rate limit

On mobile:

Chat can be a slide-up drawer.

==================================================
30. ANIMATIONS
==================================================

Animations should make the game feel alive.

Important animations:

- card dealing
- card passing
- player joining
- team assignment
- team accepted
- signal selected
- countdown
- timer transitions
- JACKPOT
- SUSPECT
- correct call
- false call
- score change
- round win
- match win
- reconnect
- player disconnect

Use animations sparingly.

Do not animate every tiny UI element.

Gameplay clarity is more important than visual effects.

==================================================
31. RESULT PAGE
==================================================

When the match ends:

Everyone sees the same result.

Show:

WINNER

Team name

Final score

Player contributions/statistics

Important moments

Examples:

JACKPOT CALLS
SUSPECTS
FALSE CALLS
CARDS PASSED
ROUNDS WON

Then:

REMATCH

LEAVE GAME

The admin should have:

RESTART GAME

The normal rematch flow should return players to:

PRIVATE TEAM STRATEGY

not directly into the game.

This gives teammates time to:
- discuss
- change strategy
- select a new signal
- prepare

==================================================
32. RESTART FLOW
==================================================

Admin chooses:

RESTART GAME

Server resets:

- scores
- cards
- round
- signal
- passing state
- game state

Players remain in the same room.

Then:

TEAM STATE

→ PRIVATE STRATEGY

→ SIGNAL SELECTION

→ GAME

Do NOT require everyone to leave and create another room.

==================================================
33. LEAVE GAME
==================================================

Player can leave.

If active game:

Show confirmation:

"Leave this game?"

"Your team will lose a player."

If lobby:

leave immediately or lightweight confirmation.

Admin leaving:

transfer admin.

Do not allow a malicious player to destroy the room simply by leaving.

==================================================
34. MOBILE UX
==================================================

The game must be designed for mobile, not merely shrunk from desktop.

Mobile priorities:

- cards remain readable
- buttons remain reachable
- game information remains visible
- chat becomes a drawer
- player positions adapt
- action buttons remain accessible
- no important information is hidden behind unnecessary menus

Use bottom-sheet UI where appropriate.

Main action area:

PASS
JACKPOT
SUSPECT

must remain easy to access.

==================================================
35. DESKTOP UX
==================================================

Desktop should use:

- large game table
- player positions around table
- persistent score
- compact event feed
- chat sidebar where appropriate
- action bar near player's hand
- room/game status at top

Avoid turning the game into a dashboard.

It must still feel like a game.

==================================================
36. UI DESIGN LANGUAGE
==================================================

Use the existing JACKPOT visual direction:

- dark premium interface
- warm wood game table
- gold/yellow primary accent
- deep navy/black surrounding UI
- subtle red for opponent/negative actions
- green for success/connection
- rounded modern components
- strong typography
- custom game icons
- subtle glow
- smooth animations

Avoid:
- excessive gradients
- excessive glassmorphism
- excessive neon
- childish UI
- emoji-heavy UI
- generic SaaS dashboards

The game should feel premium and playful.

==================================================
37. ICONS
==================================================

Use an icon library or custom SVG icons.

DO NOT use emoji as primary UI icons.

Especially for signals.

Signal icons must look consistent.

Examples:

hand wave icon
clap icon
jump icon
crouch icon
spin icon
point icon
salute icon
flash icon
dance icon
nod icon

All should share the same visual language.

==================================================
38. PERFORMANCE
==================================================

The game must feel extremely fast.

Optimize:

- initial bundle
- images
- animations
- WebSocket messages
- state updates
- React/component rendering if React is used
- card animations
- mobile performance

Do not send the entire game state every time a card moves if a smaller event can be sent.

Use event-driven updates where appropriate.

Avoid unnecessary database writes during every animation.

Persist important state appropriately.

==================================================
39. ERROR HANDLING
==================================================

Never show:

"500 Internal Server Error"

or raw stack traces.

Use friendly game language.

Examples:

"Something went wrong."

"Your connection dropped."

"Trying to reconnect..."

"That action is no longer available."

"The room has ended."

"The game has already started."

Provide:

Retry
Reconnect
Return to Lobby

where appropriate.

==================================================
40. ACCESSIBILITY
==================================================

Support:

- keyboard navigation
- visible focus states
- sufficient contrast
- reduced motion
- readable typography
- buttons with accessible labels
- screen-reader-friendly controls

But do not expose private game information through accessibility metadata.

==================================================
41. NOTIFICATIONS
==================================================

Build a notification/event system for:

- player joined
- player left
- player ready
- teams assigned
- team accepted
- strategy started
- signal locked
- game starting
- card passed
- player disconnected
- player reconnected
- JACKPOT
- SUSPECT
- round result
- match result

Notifications should be contextual.

Do not spam users.

==================================================
42. ADMIN CONTROLS
==================================================

Admin controls should include:

LOBBY:
- assign teams
- shuffle teams
- start game
- remove player
- end room

RESULT:
- restart game
- end room

Do not expose admin-only controls to normal players.

Server must verify permissions.

==================================================
43. DATA PERSISTENCE
==================================================

Persist appropriate information:

- player identity/account
- room metadata
- match result
- statistics
- created rooms where useful
- moderation events

Do not persist every animation event unnecessarily.

For active games, use fast ephemeral state where appropriate.

==================================================
44. GAME EVENT LOG
==================================================

Maintain an authoritative event history.

Examples:

PLAYER_JOINED
TEAM_ASSIGNED
TEAM_ACCEPTED
STRATEGY_STARTED
SIGNAL_LOCKED
CARD_DEALT
CARD_PASSED
JACKPOT_CALLED
SUSPECT_CALLED
CALL_RESOLVED
ROUND_STARTED
ROUND_ENDED
MATCH_ENDED
PLAYER_DISCONNECTED
PLAYER_RECONNECTED

This will be useful for:
- debugging
- replay
- disputes
- analytics
- anti-cheat

==================================================
45. TESTING
==================================================

Do not consider the feature complete until it is tested.

Test:

4 players
6 players
8 players

Test:

- simultaneous actions
- slow connection
- disconnect
- reconnect
- refresh
- duplicate clicks
- malicious client requests
- admin leaving
- player leaving
- team rejection
- timer expiration
- no signal selected
- invalid card pass
- false JACKPOT
- false SUSPECT
- correct JACKPOT
- correct SUSPECT
- rematch
- room ending
- mobile viewport
- desktop viewport

Test that private data cannot leak.

==================================================
46. IMPORTANT: DO NOT INVENT GAME RULES
==================================================

The visual/product system can be built now.

However, the actual WHOT/Jackpot rules should come from:

1. the existing prototype
2. the agreed Jackpot rules
3. the existing game logic in the repository

Do not invent a center pile, generic poker/card mechanics, or unrelated rules.

Where a rule is currently ambiguous:

Create a clear configuration point and document it.

Do not silently invent behavior.

==================================================
47. IMPLEMENTATION STRATEGY
==================================================

Do not try to build everything in one giant uncontrolled change.

Implement in vertical slices.

PHASE 1:
Landing
Create Room
Join Room
Lobby

PHASE 2:
Lobby Chat
Admin
Team Assignment
Shuffle
5-second Team Acceptance

PHASE 3:
Private Team Rooms
Team Chat
30-second Strategy Timer
Signal Selection

PHASE 4:
Real-time Game Table
Player positioning
Cards
Card passing
Server-authoritative state

PHASE 5:
JACKPOT
SUSPECT
Scoring
Round results

PHASE 6:
Match results
Restart
Rematch

PHASE 7:
Reconnect
Security hardening
Rate limits
Validation

PHASE 8:
Animations
Polish
Mobile optimization
Performance

After each phase:
- run the application
- test the flow
- fix issues
- do not leave broken routes
- do not create fake placeholder functionality unless explicitly marked

==================================================
48. ROUTING
==================================================

Use clean routes based on the existing framework.

Conceptually:

/
  Landing

/create
  Create Room

/join
  Join Room

/room/:roomCode
  Lobby

/room/:roomCode/teams
  Team Assignment

/room/:roomCode/strategy/:teamId
  Private Team Strategy

/room/:roomCode/game
  Game Table

/room/:roomCode/result
  Result

/settings
  Settings

Do not duplicate game state between routes.

The server/session should remain authoritative.

==================================================
49. IMPORTANT UX DETAIL
==================================================

At every moment, the player should know:

WHERE AM I?

WHAT IS HAPPENING?

WHAT AM I WAITING FOR?

WHAT CAN I DO?

WHO AM I PLAYING WITH?

WHAT IS MY TEAM DOING?

HOW MUCH TIME IS LEFT?

Examples:

LOBBY:
"Waiting for 2 players."

TEAM ASSIGNMENT:
"Waiting for everyone to accept."

STRATEGY:
"Discuss your plan with your teammate."

GAME:
"Maya is passing a card to Kemi."

RESULT:
"Team Bravo wins."

Never leave the user wondering what the application is waiting for.

==================================================
50. FINAL ACCEPTANCE CRITERIA
==================================================

A complete end-to-end match should work like this:

1. Player opens JACKPOT.
2. Player clicks CREATE ROOM.
3. Room is created.
4. Player shares room link/code.
5. Other players join.
6. Everyone sees each other in lobby.
7. Everyone can chat.
8. Admin assigns teams or shuffles teams.
9. Server creates team assignment.
10. All players receive 5-second accept/reject prompt.
11. Everyone accepts.
12. Players are moved into private team rooms.
13. Teammates can chat privately.
14. Each team selects a secret signal.
15. 30-second strategy timer runs server-side.
16. Strategy ends.
17. Players enter the game table.
18. Server shuffles/deals cards based on player count.
19. Passing state is determined.
20. Players see who is currently passing and who receives.
21. Cards move in real-time.
22. Players can observe opponents.
23. Players can perform visible signals.
24. Teammates can call JACKPOT.
25. Opponents can call SUSPECT.
26. Server validates calls.
27. Score updates for everyone.
28. Round continues until the configured end condition.
29. Result is shown to everyone.
30. Admin can restart.
31. Restart returns players to private strategy rooms.
32. Teams can discuss again.
33. Teams can select new signals.
34. New round/game starts.
35. Players can eventually leave the room.

There must be NO page refresh required for normal gameplay.

There must be NO client-side authority over game outcomes.

There must be NO private information leakage.

There must be NO generic center-pile mechanic unless explicitly required by the actual Jackpot/WHOT rules.

==================================================
51. MOST IMPORTANT DEVELOPMENT RULE
==================================================

Do not optimize for "lots of features".

Optimize for:

FAST
REAL-TIME
FAIR
SOCIAL
CLEAR
ADDICTIVE

The magic of JACKPOT is the social tension:

"I think my teammate has it."

"Did he just signal?"

"WAIT."

"SUSPECT!"

"JACKPOT!"

The product UI and engineering architecture should amplify that moment.

Build the foundation correctly before adding unnecessary features.

Start by inspecting the existing repository and produce a concise implementation plan based on what is already there. Then begin implementation phase-by-phase, testing each phase before moving to the next.