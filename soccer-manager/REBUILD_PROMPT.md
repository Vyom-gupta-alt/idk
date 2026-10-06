# Prompt: Build "Soccer Manager 26" (browser football manager + player career)

> Paste everything below this line into Claude. The whole build should fit in about 200K tokens, so the prompt asks for a phased build with a strict priority order. Anything marked **[LATER]** is optional.

---

You are an expert game developer. Build **Soccer Manager 26**, a football (soccer) management simulation that runs entirely in the browser. It has two modes: **Manager career** and **Player career**.

## 0. Hard constraints

- **Plain HTML, CSS and JavaScript only.** No build step, no npm and no frameworks. It must work when `index.html` is opened from disk.
- The only external library allowed is **three.js from cdnjs**, and it should load on demand for the optional 3D match only.
- Use these files:
  - `index.html`: the shell.
  - `style.css`: dark theme with CSS variables, responsive down to 360px phone width.
  - `data.js`: leagues, clubs, players and name pools.
  - `game.js`: the world, the engine, season logic and the UI.
  - `play3d.js`: optional, for the 3D match.
- Write `game.js` as a single IIFE.
  - Keep all state in one object, `S`, with a helper `C()` that returns the current career.
  - Keep UI-only state in a separate `ui` object.
- Render the UI from state using template strings and `innerHTML`.
  - Handle clicks with event delegation: `data-act="action-name"` plus `data-id`, with all handlers in one `ACTIONS` map.
  - Handle input and select changes the same way through a `CHANGES` map.
  - Use one generic `openModal(html)` / `closeModal()` and an `askConfirm(text, onYes)` helper.
- Use a seeded RNG, such as mulberry32, so a world can be regenerated from its seed.
- **Saves** go in `localStorage`.
  - Gzip-compress them with `CompressionStream` and fall back to plain JSON if that isn't available.
  - Auto-save after each matchday.
  - Support export and import of a save file.
- Add a test hook, `window.SM = { S, go, simUntilDay, ... }`, so the game can be driven from a browser console or Playwright.
- Code quality: small named functions, no dead code, and comments only where the logic isn't obvious.
- **Work in phases (section 9).** After each phase, the game must load and be playable with no console errors. If you run short on budget, finish the current phase cleanly instead of starting the next one.

## 1. Data (`data.js`)

- **Leagues:**
  - Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Liga Portugal and Eredivisie.
  - **[LATER]** Their second divisions: Championship (24 clubs), LaLiga Hypermotion, Serie B, 2. Bundesliga, Ligue 2, Liga Portugal 2 and Eerste Divisie.
- Each club has:
  - name and short name
  - two colours
  - stadium
  - reputation (1–100)
  - starting budget
  - wage budget
- **Players** are stored as compact CSV-like strings per club, `"Name,POS,OVR,AGE"`, which keeps tokens low.
  - Write real 2025/26 squads for the **Premier League** (about 22 players per club).
  - For every other league, write only the club list and generate realistic squads from name pools by nationality, so the token budget holds.
  - Ratings follow EA SPORTS FC 26 style estimates.
- **Positions:** GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, CF, ST.
- **Name pools** per country, used for generated players, youth intakes and regens.
- **Ratings import:** accept a CSV or JSON file in FC 26 format and use it to overwrite matching players.
  - Recognised columns: `Name`/`short_name`/`long_name`, `Club`/`club_name`, `Position`/`player_positions`, `OVR`/`overall`, `Age`, `League`.

## 2. World model

### Player

```
{ id, name, nat, pos, alt:[positions], age, ovr, pot,
  attrs:{pac,sho,pas,dri,def,phy} | GK:{div,han,kic,ref,spd,pos},
  club, wage, value, contractEnd, releaseClause?, sellOn?,
  morale, form, injury:{days}, suspension, intlDuty,
  stats:{[comp]:{apps,goals,assists,ratingSum,yellows,reds}},
  history:[{season,club,apps,goals,ovr}],
  training:{focus, progress, bonus, intensity, learnPos?},
  playStyles:[{id,plus}] }
```

- **Value** is derived from OVR, POT, age and contract length.
- **Wage** is derived from OVR and club reputation.
- **Potential** comes from age, OVR and random variation. Youngsters can reach 85–92.
- **Attributes** are generated around OVR, weighted by position (a winger is high on PAC and DRI, a CB on DEF and PHY).
- Each position has 2–3 **key attributes**, shown starred. Training those raises OVR.

### Club

```
{ id, name, short, colors, league, rep, budget, wageBudget,
  squad:[pid], lineup:{formation, slots:[pid], mentality, style, roles},
  academy:{level, region, prospects:[]}, trophies:[] }
```

### Career

```
{ mode:'manager'|'player', clubId, playerId?, season, day,
  calendar:[...], competitions:{...}, inbox:[], events:[],
  board:{confidence, objectives, longTerm, askedThisWindow},
  history:[...seasons], awards:[] }
```

## 3. Calendar and competitions

- Use one real calendar, starting at the beginning of August 2025.
  - League games are on Saturdays.
  - Cup and European games are midweek.
  - International breaks are in September, October, November and March.
- The **Home** screen shows the next fixture and has these buttons:
  - **Play next** (watch the match)
  - **Sim to date** (a date picker)
  - **Sim to end of season**
- **League:** double round robin. The table shows Pos, P, W, D, L, GF, GA, GD and Pts, with form dots.
- **Domestic cups:** single-leg knockout with extra time and penalties. Use FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France, Taça de Portugal and KNVB Cup.
- **Europe:**
  - Champions League: 36 clubs in a Swiss-style league phase of 8 matches. Positions 1–8 go to the round of 16, 9–24 to a playoff, then two-legged knockouts and a one-match final.
  - **[LATER]** Europa League (24 clubs) and Conference League (16 clubs) in the same format.
  - European places come from league position plus the domestic cup winner. Season 1 uses the real 2024/25 tables.
- **Promotion and relegation:** the bottom 3 go down and the top 3 come up, if second divisions exist. Reserve sides (B/Jong) can't be promoted.
- **End of season:**
  - Run aging: young players grow toward their potential and players over 31 decline.
  - Run retirements and generate regens.
  - Expire contracts, which creates free agents.
  - Hold the board review and the awards.
  - Show a **season summary** modal.

## 4. Match engine (the core; build it carefully)

- The engine simulates the match **minute by minute**. Each minute it:
  1. Decides possession from midfield strength, tactics and home advantage.
  2. Decides whether there's an attack, using attack strength against defence strength.
  3. Decides whether that attack produces a chance and how good it is.
  4. Picks the shooter by role and position weight.
  5. Resolves the shot as a goal, a save (the keeper's rating matters), off target or blocked.
  6. Picks the assister.
- Events also include fouls, yellow and red cards, injuries, corners and substitutions.
- **Team strength** comes from the XI's OVR adjusted by:
  - **Position fit:** out of position costs −5 to −15, depending on how far the positions are apart.
  - **Morale and form.**
  - **Formation:** how many players are in defence, midfield and attack.
- **Mentality:** Defensive, Balanced, Attacking, All-out. This shifts attack rate against defensive exposure.
- **Play styles** each change possession, attack rate, chance quality, crossing share and card rate:
  - Balanced
  - Tiki-taka
  - Gegenpress
  - Counter-attack
  - Long ball
  - Wing play
  - Park the bus
- **Roles** per position change who shoots, creates and heads crosses, and the commentary changes with them. Examples:
  - Holding midfielder, Deep-lying playmaker, Box-to-box, Mezzala
  - Inside forward, Winger, Cross specialist
  - Target man, Poacher, False 9
  - Wing-back, Ball-playing CB
- **Formations:** at least 10 to start, then 27 **[LATER]**.
  - Each is a list of `[pos, x%, y%]` slots, used both for the pitch display and for strength.
  - Group them by back three, four or five in the dropdown.
  - Include 4-3-3, 4-2-3-1, 4-4-2, 4-1-4-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1, 4-2-2-2 and 4-3-3 (False 9).
- **Output:**
  - Goals with minute, scorer and assister.
  - Stats: possession, shots, shots on target, xG, corners, fouls and cards.
  - A rating from 1 to 10 for every player, based on goals, assists, clean sheet, result and noise.
  - Man of the match.
- **Watching a match:**
  - Text commentary streams with a speed setting: slow, normal, fast or instant.
  - Show a **live 2D pitch**: 22 dots and a ball, moved each minute to match the event (attacks, shots, corners, goals). In player career, ring your own dot and label it "YOU".
- **Substitutions:** up to 5 per side.
  - The manager pauses, picks who goes off and who comes on, and the rest of the match is re-simulated from that minute. Earlier events stay the same.
  - The AI makes subs for its own side, and for yours until you make one yourself.
- Extra time and penalty shootouts for knockouts.
- Every match updates appearances, goals, assists, ratings, injuries (1–60 days) and suspensions. Five yellows means a one-match ban, and a red means one or more matches.
- **Development after each match:** players gain progress from their match rating.
  - Young players gain faster.
  - Progress gets harder at higher OVR.
  - OVR is capped at POT.

## 5. Manager career features

1. **Squad tab:**
   - A sortable table: pos, name, age, OVR, POT, value, wage, contract, morale, apps, goals and average rating.
   - Click a row to open the player profile: attributes, PlayStyles, career history, stats per competition and contract.
   - Actions: Sell, Loan, Renew, Release.
2. **Tactics tab:**
   - A formation dropdown, mentality, play style, and a role per slot.
   - Show the pitch with draggable or clickable slots, and a "Best XI" button.
   - **The lineup is locked.** The XI never changes unless you change it. An injured, suspended or away player gets a temporary stand-in and returns automatically once available.
3. **Transfers:**
   - Windows: summer until 1 September, and January. Free agents can be signed at any time.
   - **Search:** filter by position, max age, min OVR, max value and league.
   - **Negotiation, step 1 (fee):**
     - Make an offer and the club accepts, rejects, or counters.
     - You get up to 3 bids per player per window.
     - Clubs value key players, young talents and sales to league rivals higher. Some stars are untouchable.
   - **Negotiation, step 2 (personal terms):**
     - Agree wage and contract length (1–5 years), with counter-offers.
     - The wage must fit your **wage room**.
     - Players may refuse a smaller club, a weaker league, or a club with no European football.
   - **Swap deals:** offer one of your players plus cash. The selling club values him by price, age and whether he would make their team, and if it's close they say how much cash to add.
   - **Release clauses:**
     - Every LaLiga player has one, and about 25% of players elsewhere.
     - Paying the clause means the club can't refuse, but the player still has to agree.
     - When you sign or renew someone, you choose the clause: none, 1.5×, 2× or 3× value. A lower clause gets a lower wage.
     - **[LATER]** Signing-on fees and sell-on clauses (10–30%).
   - **AI market:** AI clubs fill weak positions every window, bid for your players, buy and sell among themselves, and renew their key players' contracts in January.
   - **Loans:** send a player out for a season. Interested clubs show his expected role and the share of his wage you still pay. **[LATER]** Recalls and options to buy.
4. **Contracts:** every player has an end date. Renew before expiry, or he leaves on a free. The Home screen shows an "Expiring contracts" card.
5. **Bulk actions** (these save a lot of clicks):
   - A checkbox column in the squad table and a sticky bulk bar with **Renew selected**, **Sell selected**, **Clear** and **Select expiring**.
   - **Bulk renew:** one modal with each player's demand. Edit wage and years per row, then *Offer all*. Players who counter get the counter pre-filled, and signed players drop out of the selection.
   - **Bulk sell:** sell each player to his best bidder or release him. Respect the minimum squad size (18) and never sell the last GK. Group the failures by reason in the result message.
6. **Sell advisor:**
   - If a signing doesn't fit your wage room or budget, the negotiation shows "Short of €X wages / €Y fee" and a **Suggest players to sell** button. The same advisor is on the Transfers tab, where you type the amount you need.
   - **Ranking:** score each player as 0.35×OVR + 0.25×POT + 0.20×apps + 0.20×average rating, with each value normalised within the squad. Lowest first.
   - Pick players greedily until the gap is covered, while respecting the minimum squad size and the last-GK rule.
   - Show **how many** players, **what each one frees** (wage and fee) and **each one's full profile and best offer**, with a "Keep him instead" button that swaps in the next candidate.
   - "Sell these N players" runs the sales and goes straight back to the negotiation.
7. **Training tab (both modes):**
   - Each player gets a focus: improve one attribute, or learn a new position.
   - Intensity: light, normal or intense. Intense is faster but risks injury.
   - Progress builds after each match the club plays. Gains are largest for the young, with up to +15 per attribute from training. Key attributes raise OVR, up to POT.
   - **Learning a position:** familiarity builds and the out-of-position penalty shrinks. Similar positions are learned faster (CB→CDM is quicker than CB→ST).
   - **Bulk training:**
     - **Auto-train whole squad** gives each player his best key attribute: the highest-weighted key attribute that isn't maxed, with ties going to the lowest value.
     - **Rest everyone.**
     - Checkboxes, **Select under-21s**, and a focus dropdown with **Apply**.
8. **The board:**
   - Each season has objectives based on squad strength (league position plus cup and Europe targets), plus a long-term goal over 2–3 seasons. Show live status on Home.
   - Confidence moves with results.
   - If confidence collapses, you are **sacked**. You can then take a smaller club's offer or retire.
   - The transfer budget gets only 10–30% of revenue, depending on confidence. Player sales go to the budget in full.
   - **Ask the board for funds:** three request sizes, once per window. Asking costs some confidence whatever the answer.
   - End-of-season wage budget review:
     - Champions League +15%, Europa League +8%, Conference League +5%.
     - Promotion +20%.
     - Trophies: league +10%, Champions League +12%, other European +6%, domestic cup +5%.
     - Finishing 4 or more places above expectations +6%.
     - Relegation −15%. Finishing 5 or more places below expectations −5%.
     - Clamp the total between −25% and +50%.
9. **Youth academy:** facilities levels 1–5 and a scouting region. A new intake arrives every summer, and prospects develop on matchdays. Promote or release them. At age 18 they must be promoted or they leave.
10. **[LATER]** Create your own club, replacing an existing one. Pick the name, colours, stadium, squad strength and owner wealth.

## 6. Player career features

- **Create a player:**
  - Name, nationality, position, a player type (for example "inside forward" or "cross specialist") and a starting club.
  - Age 17, OVR 64, high potential.
- The AI manager picks the XI, so you earn your place through form and OVR. Show "Selected / Bench / Not in squad" before each match.
- **My Career tab:**
  - OVR and POT, attributes, PlayStyles, contract and morale.
  - Season-by-season history: season, club, apps, goals and OVR.
  - Trophies and awards.
- **Training tab:** your own focus, plus a **Pick the best for me** button, attribute explanations and PlayStyles.
- **Agent:** ask for a transfer or a loan, choose between club offers, negotiate wages (clubs have a hidden limit and may withdraw), and renew with your current club.
- Terminate your contract and join a club as a free agent, or retire, which shows a career summary.

## 7. Extra systems (do these after the core works)

- **International football:**
  - National teams built from the best players of each nationality, with call-ups during international breaks. Away players are marked **INTL** and miss club games.
  - Friendlies and qualifiers, the 2026 World Cup (48 teams), Euros, Copa América, AFCON and Asian Cup, each with groups and a bracket.
  - Elo rankings and an International tab.
  - In player career you earn caps.
- **Awards:**
  - Golden Boot.
  - Ballon d'Or night on 26 October, with 30 nominees and the top 3 revealed in order.
  - Kopa Trophy (best U21), Yashin Trophy (goalkeeper), Gerd Müller Trophy (top scorer), Johan Cruyff Trophy (coach) and Club of the Year.
  - Team of the Year.
  - An Awards tab with the live Ballon d'Or race and a hall of fame.
- **Random events:** decision cards with 2–3 choices that have consequences for morale, money, injuries or board confidence. Examples:
  - training clash
  - homesick player
  - sponsorship offer
  - fan protest
  - partying player
  - press conference
  - rushing back an injured star

  Player career has its own set: endorsement deal, party invite, interview, scouts in the stands.
- **PlayStyles (FC-style):** derived from attributes, with PlayStyle+ (◆) for elite players. Examples:
  - Rapid, Quick Step, Technical, Press Proven
  - Finesse Shot, Power Shot
  - Incisive Pass, Tiki Taka, Long Ball Pass
  - Intercept, Anticipate, Slide Tackle, Bruiser, Relentless
  - Far Reach and Footwork for goalkeepers

  They give small boosts in the match engine.

## 8. Optional: playable 3D match (`play3d.js`) **[LATER]**

On the Match tab, add a **🎮 Play Match (3D)** button that lazy-loads three.js from cdnjs.

- **Players:** 22 simple humanoids (capsule body, jointed arms and legs) with a run animation, kit colours and shirt numbers.
- **Pitch:** markings and goals with nets.
- **Controls:**
  - Keyboard: WASD to move, Shift to sprint, Space to shoot (hold for power), E to pass, Q for a through ball, R for a lob or cross, X for a skill move or slide tackle, C to change camera, Esc to pause.
  - Mouse: the cursor aims. Hold left to dribble, click left to pass, hold right to sprint.
  - Gamepad through the standard Gamepad API.
- **Who you control:** in manager mode you control the whole team and switch players with Tab or Q. In player career you control only yourself, and E calls for the ball.
- **AI:** teammates support play and make runs. Opponents press, tackle and shoot. The goalkeeper dives.
- **Attributes drive play:** pace sets speed, shooting sets accuracy, passing sets pass error, defending wins tackles, and keeper ratings decide saves.
- **Rules:**
  - Out of play: throw-ins, corners and goal kicks.
  - Fouls give free kicks, or penalties inside the box.
  - Cards for fouls.
  - Offside.
  - Half-time.
- **Match length:** 3, 5, 8 or 12 real minutes. You can end the match early and keep the score.
- **Result:** the score, scorers and assists become the official result.

## 9. Build order (follow strictly)

1. **Phase 1: skeleton.**
   - `index.html`, `style.css`, the data for one league, world generation, a new-game screen (choose mode, league and club), and the Home and Squad tabs.
   - Save and load.
2. **Phase 2: season.**
   - Calendar, fixtures, the match engine with text commentary, the league table, and Play next, Sim to date and Sim to season end.
   - End of season: aging, contracts, and the summary.
3. **Phase 3: management.**
   - Tactics: formations, mentality, styles, roles, the locked lineup.
   - Training.
   - Player development after matches.
   - Injuries and suspensions.
4. **Phase 4: transfers.**
   - Windows, search, fee and terms negotiation, AI transfers, contracts and renewals, loans, release clauses.
5. **Phase 5: player career.**
   - Create a player, selection logic, My Career, the agent, offers.
6. **Phase 6: quality of life.**
   - Bulk renew and sell, bulk training, the sell advisor, the board.
   - The live 2D pitch.
   - Substitutions during a match.
7. **Phase 7: breadth.**
   - All 7 leagues, then cups, the Champions League and promotion and relegation.
8. **Phase 8 [LATER]:**
   - Second divisions, Europa League and Conference League.
   - International football, awards, events, academy, create a club, PlayStyles.
   - The 3D match.

## 10. Acceptance checks (verify mentally or with the `window.SM` hooks)

- A new manager career with any Premier League club loads with no errors, and a whole season simulates to the end in under about 30 seconds.
- The league table is consistent: points equal 3W + D, and goals for across the league equal goals against.
- No player is ever on two clubs. Squad sizes stay between 18 and 35.
- Each of the 10 or more formations produces a full XI of 11 players with exactly one goalkeeper.
- A transfer moves the player, the fee and the wage correctly, and the AI never takes a club's budget below 0.
- The sell advisor never drops the squad below 18 and never sells the last GK.
- Bulk renew removes signed players from the selection.
- A save survives a reload, and a compressed export can be imported again.
- The UI works at 360px width with no horizontal scroll.

## 11. How to respond

- Output complete files, not diffs, in this order: `data.js`, `style.css`, `index.html`, `game.js`, then `play3d.js` if you get that far.
- If a file is too long for one message, split it into clearly labelled parts (for example "game.js part 2/4") that join together into a single valid file.
- At the end, list:
  - what's implemented
  - what's simplified
  - what was left for later

  Also give a short README with how to play: open `index.html`, or run `python3 -m http.server`.
