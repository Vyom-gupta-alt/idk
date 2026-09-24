# Soccer Manager 26

A text-based football manager simulation in plain HTML/CSS/JS (no build step, no dependencies).

## Play
Open `soccer-manager/index.html` in a browser, or serve the repo:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000/soccer-manager/
```

## Game modes
- **Manager career:** pick a club, set the XI and tactics, buy and sell players, and manage the budget and wages.
- **Player career:** create a 17-year-old at any club (starts at 64 OVR with high potential). The AI manager picks the team, and you earn your place, grow your OVR, ask your agent for moves and choose between club offers. Your full career history (seasons, clubs, apps, goals, OVR) is recorded.

## Live 2D match view
Every match you watch shows a pitch with 22 dots and the ball, driven minute by minute by the match engine. You can see which team has the ball, attacks, shots, saves, corners, cards and goals, in sync with the text commentary. In player career your dot is ringed and labelled YOU.

## Play the match yourself (3D)
On the Match tab, **🎮 Play Match (3D)** puts you on the pitch in a real-time 3D match (three.js, loaded on demand) instead of simulating it. The score, scorers and assists you play become the official result.
- **Controls:** WASD / arrows move, **Shift** sprint, **Space** hold for a power shot (W/S aims far/near post) or standing tackle without the ball, **F** curled finesse shot, **X** skill move with the ball or slide tackle without it, **E** pass, **Q** through ball (or switch player when defending), **R** lob / cross, **C** camera, **Esc** pause.
- **Referee:** fouls (late slides and tackles from behind are riskier), free kicks with a 9.15 m wall distance, penalties for fouls in the box, yellow and red cards (a second yellow means red, and so does denying a clear goal-scoring chance), sent-off players leave the pitch (an outfielder goes in goal if the keeper is sent off), and offside when a pass reaches a player beyond the last defender. Cards count toward suspensions.
- **FC-style feel:** stamina drains while sprinting, acceleration depends on pace, and sprinting knocks the ball further ahead (Technical players keep it close). Skill moves beat tackles, and dribbling, defending and physical attributes decide duels.
- **PlayStyles & PlayStyles+:** every player gets FC-style PlayStyles from their attributes (for example Rapid, Quick Step, Technical, Press Proven, Finesse Shot, Power Shot, Incisive Pass, Tiki Taka, Long Ball Pass, Intercept, Anticipate, Slide Tackle, Bruiser and Relentless, plus Far Reach and Footwork for keepers). The best get PlayStyles+ (◆). They change how players move, pass, shoot, tackle and save in the 3D match, and they show on player profiles and on the in-match HUD with your stamina bar.
- **Manager career:** you control the whole team and switch players. **Player career:** you control only yourself, and **E** calls for the ball.
- Player ratings and attributes drive the game: pace sets speed, shooting sets accuracy, passing sets pass error, defending wins tackles, and keeper ratings decide saves. Out-of-position players are weaker.
- Human-looking players with jointed arms and legs, running and kicking animations, kits with shirt numbers, varied skin tones, hairstyles and heights, and real-time shadows. Press **C** to switch camera (Broadcast, Close, Wide).
- Throw-ins, corners, goal kicks, half-time, a radar minimap, and penalties for level knockout ties.
- Match length is 3, 5, 8 or 12 real minutes. You can end a match early and keep the current score.

## Features
- **14 leagues in 7 countries:** Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Liga Portugal and Eredivisie, with real 2025/26 squads, plus their second divisions: Championship (24 clubs, with midweek rounds), LaLiga Hypermotion, Serie B, 2. Bundesliga, Ligue 2, Liga Portugal 2 and Eerste Divisie. Second-division clubs are real, but their squads are generated.
- **Promotion & relegation:** the bottom 3 of each top division swap places with the top 3 of the division below every season. Reserve sides (B / Jong) can't be promoted.
- **Player career history** for every real player and your own squad, shown in each player's profile.
- **Substitutions** during matches (up to 5 per side).
- **Cups & Europe:** each country has its domestic cup (FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France, Taça de Portugal, KNVB Cup) for both divisions as a single-leg knockout with extra time and penalties. There is also a **Champions League** (36 clubs), **Europa League** (24) and **Conference League** (16), with a Swiss-style league phase, two-legged knockout ties and a one-match final. European places come from league position plus the cup winner. Season 1 uses the real 2024/25 tables.
- **One real calendar:** league games on Saturdays, cup and European games midweek, and international breaks. Browse any date, or simulate up to a date or to the end of the season.
- **Locked lineup:** your XI never changes unless you change it. Injured or suspended players get a temporary stand-in and return to the team automatically once available.
- **Dynamic OVR:** after every match, players gain or lose progress based on their match rating. Young players grow fastest, up to their potential (POT, shown for every player in your squad, the transfer market, signing talks, loans and the academy), and it gets harder to improve the higher a player's OVR already is. Veterans slowly decline. There is also a summer age effect, plus retirements.
- **Realistic transfers:**
  - Summer (until 1 Sep) and January windows. Free agents can be signed any time.
  - Clubs value their key players, young talents and players sold to league rivals higher, and some stars are untouchable.
  - Fee negotiation with counter-offers and a limit of 3 bids per window.
  - Players may refuse to join clubs that are smaller, play in a weaker league or have no European football.
  - Wage demands must fit your wage budget.
  - AI clubs buy and sell among themselves, and bid for your players.
- **Loans (manager):** use the Loan button in your squad or a player's profile to send him out for a season. Clubs that want him show his expected role, the share of his wages you still pay, and sometimes a loan fee or an option to buy. Loaned players develop from their games at the new club, are listed under Transfers → Out on loan with their stats, can be recalled while a window is open, and return in the summer unless the loan club takes up its option to buy. Loans agreed in the summer cover the next season.
- **Training & attributes (both modes):** every player has FC-style attributes (PAC, SHO, PAS, DRI, DEF, PHY; keepers DIV, HAN, KIC, REF, SPD, POS), with the key ones for his position starred. In the Training tab (or My Career in player mode), give each player a focus:
  - **Improve an attribute:** it grows after every match your club plays, fastest for young players (up to +15 from training). Key attributes also raise OVR, up to the player's potential. Trained shooting, physical (heading) and keeping directly help in matches.
  - **Learn a new position:** familiarity grows each session, and the out-of-position penalty shrinks as he learns. Similar positions (CB→CDM) are quicker than distant ones (CB→ST). Once learned, he plays there with no penalty, and you can make it his main position.
  - **Intensity:** light, normal or intense. Intense is faster but risks training injuries.
- **Tactics:** 9 formations, 4 mentalities and 7 play styles: Balanced, Tiki-taka, Gegenpress, Counter-attack, Long ball, Wing play and Park the bus. Each changes possession, attacking rate, chance quality, crossing and cards in the match engine.
- **Player roles** for every position, e.g. Holding midfielder, Deep-lying playmaker, Box-to-box, Mezzala, Inside forward, Cross specialist, Target man, Poacher, False 9 and Wing-back. Roles change who shoots, who creates, who heads crosses in, and how much each player adds to attack, midfield or defence. Goal commentary changes with the role too.
- **Player type (player career):** choose how you play (for example a winger who cuts in, or a cross specialist), and change it later in My Career.
- **Contracts & wage negotiation (both modes):** every player has a contract end date. Manager: agree the fee, then personal terms (wage and contract length) with counter-offers, and renew expiring contracts or the player leaves on a free. Player career: ask clubs for a higher wage (they have a hidden limit and may withdraw), and negotiate a new contract with your own club.
- **Create a club (both modes):** found your own club. Pick its name, short name, stadium and badge colour, how strong the squad is compared with the league average, and (in manager mode) how rich the owner is. Your club takes the place of a club you choose, and that club's players become free agents.
- **Youth academy (manager):** upgrade your facilities (levels 1–5) for better intakes, pick a scouting region (local, Europe, South America, Africa or Asia), and watch your prospects develop every matchday. Promote the best prospects to the first team or release them. A new intake arrives each summer, and prospects aged 18 or older must be promoted or they leave.
- **International football (both modes):** 84 national teams with real players who are called up from their clubs.
  - International breaks in September, October, November and March, with friendlies and qualifiers.
  - Tournaments: AFCON (mid-season, so African players miss club games), Asian Cup, the 2026 World Cup (48 teams, hosted by USA/Mexico/Canada), Euros and Copa América (2028), and the Nations League Finals, each with groups and knockouts.
  - A world ranking based on Elo.
  - An International tab shows fixtures, groups, brackets and winners.
  - Players away on duty are marked INTL and miss club matches.
  - In player career, choose your nationality and earn caps.
- **Trophy celebrations:** 3D cutscenes when you win your league (your team jumping around the podium as the captain lifts the trophy, with confetti, fireworks and camera flashes) or the Champions League, and a spot-lit stage ceremony when you (player career) or one of your players (manager) wins the **Ballon d'Or** or your league's **Golden Boot**. The Ballon d'Or top 3 is decided each season from form, goals, assists, ratings and trophies, and shown in the season summary. You can rewatch the celebrations from the season summary.
- **Compressed saves:** saves are gzip-compressed so large worlds fit in browser storage.
- **FC 26 ratings import** (CSV/JSON): `Name`/`short_name`/`long_name`, `Club`/`club_name`, `Position`/`player_positions`, `OVR`/`overall`, `Age`, `League`.
- **Match engine:** a minute-by-minute simulation with live text commentary, stats, player ratings, extra time and penalty shootouts. 9 formations and 4 mentalities.
- Stats per competition, a trophy cabinet, season history and auto-save.

## Files
- `data.js`: leagues, clubs and players (`Name,POS,OVR,AGE`), plus name pools for generated players.
- `play3d.js`: the playable 3D match (three.js from cdnjs).
- `game.js`: world builder, match engine, season logic, transfers, import/export and UI.
- `style.css`: styling (responsive down to phone width).

> Built-in ratings are estimates in the style of EA SPORTS FC 26. Import an FC 26 ratings file for exact values.
