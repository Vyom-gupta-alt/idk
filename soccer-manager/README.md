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
- **Mouse:** the cursor aims (a white ring on the pitch). **Hold left** to run or dribble towards the cursor, **click left** to pass to the team-mate nearest the cursor (shown with a blue ring) or into space there, and **hold right** to sprint. Space shoots at the part of the goal you point at. Without the ball, a click switches to that player (manager) or calls for the ball (player career).
- **Controller:** plug in any Xbox or PlayStation pad (or anything the browser sees as a standard gamepad) and press a button. **Left stick** moves (analogue: push gently to jog), **RT** sprints, **A** passes, **X** plays a through ball, **Y** lofts a pass or cross, **B** shoots (hold for power) or tackles, **RB** hits a finesse shot, **LT** does a skill move or slide tackle, **LB** switches player (or calls for the ball), a **right-stick flick** switches to the team-mate in that direction, **View** changes camera and **☰** pauses. The pad rumbles on goals and tackles. Keyboard, mouse and controller all work at the same time.
- **Control the whole team:** as a manager you always control the whole team, switching with **Tab**, **Q**, **LB** or the right stick. In player career you control only your player at first. Press **T** (or **D-pad ↑**, or use the button in the pause menu) to take over any team-mate, and press it again to go back to your player.
- **Keyboard:** WASD / arrows move, **Shift** sprint, **Space** hold for a power shot (W/S aims far/near post) or standing tackle without the ball, **F** curled finesse shot, **X** skill move with the ball or slide tackle without it, **E** pass, **Q** through ball (or switch player when defending), **R** lob / cross, **C** camera, **Esc** pause.
- **Referee:** fouls (late slides and tackles from behind are riskier), free kicks with a 9.15 m wall distance, penalties for fouls in the box, yellow and red cards (a second yellow means red, and so does denying a clear goal-scoring chance), sent-off players leave the pitch (an outfielder goes in goal if the keeper is sent off), and offside when a pass reaches a player beyond the last defender. Cards count toward suspensions.
- **FC-style feel:** stamina drains while sprinting, acceleration depends on pace, and sprinting knocks the ball further ahead (Technical players keep it close). Skill moves beat tackles, and dribbling, defending and physical attributes decide duels.
- **PlayStyles & PlayStyles+:** every player gets FC-style PlayStyles from their attributes (for example Rapid, Quick Step, Technical, Press Proven, Finesse Shot, Power Shot, Incisive Pass, Tiki Taka, Long Ball Pass, Intercept, Anticipate, Slide Tackle, Bruiser and Relentless, plus Far Reach and Footwork for keepers). The best get PlayStyles+ (◆). They change how players move, pass, shoot, tackle and save in the 3D match, and they show on player profiles and on the in-match HUD with your stamina bar.
- **Manager career:** you control the whole team and switch players. **Player career:** you control only yourself, and **E** calls for the ball.
- Player ratings and attributes drive the game: pace sets speed, shooting sets accuracy, passing sets pass error, defending wins tackles, and keeper ratings decide saves. Out-of-position players are weaker.
- Human-looking players with jointed arms and legs, running and kicking animations, kits with shirt numbers, varied skin tones, hairstyles and heights, and real-time shadows. Press **C** to switch camera (Broadcast, Close, Wide).
- Throw-ins, corners, goal kicks, half-time, a radar minimap, and penalties for level knockout ties.
- Match length is 3, 5, 8 or 12 real minutes. You can end a match early and keep the current score.

## Substitutions while simulating
When you simulate a match as a manager, a **🔁 Substitution** button sits under the live commentary. It pauses the match so you can pick who comes off and who comes on (up to 5). The sub takes the same position, and the rest of the match is re-simulated from that minute. Everything that already happened stays the same. Once you make a change, the assistant stops making automatic subs for your side. Your bench always keeps room for your two best under-21 prospects, and the minutes they get count towards their appearances and development. With commentary set to Instant, the match is simulated in one go without a chance to sub.

## The board (manager career)
- **Revenue share:** your transfer budget no longer gets all of the club's revenue. The board releases 10–30% of it, depending on their confidence in you; the rest pays wages and running costs. Money from player sales still comes to you in full.
- **Objectives:** each season comes with targets set from your squad's strength. These are a league position (win the league, top 4, top half, avoid relegation or win promotion) plus, where relevant, a cup run and a European run. There is also a long-term goal over two to three seasons: win the Champions League, win the league, qualify for the Champions League, establish the club in the top half, or win promotion. Their live status shows in the board card on Home.
- **Confidence:** results move board confidence during the season, and the end-of-season review adds or removes a lot more. The verdict shows in the season summary and also affects your wage budget. If confidence collapses, during the season or at the review, you are **sacked**. Only smaller clubs will offer you a job, or you can retire.
- **Asking for money:** the board card has an **Ask the board for transfer funds** button with three sizes of request. The chance of a yes depends on their confidence and falls for bigger requests. Each request costs some confidence either way, and you can only ask once per transfer window.

## AI clubs are smarter
- Every summer, and to a lesser extent in January, each AI club looks for a real hole in its team, such as a much weaker player in one position or an ageing keeper, and signs a better player for it if it can afford one. Big clubs can take stars from smaller clubs.
- In January, clubs give new contracts to their most important players before those contracts expire.

## Wage budget reviews
At the end of every season the board reviews your wage budget, and the result shows in the season summary:
- Qualifying for Europe: +15% (Champions League), +8% (Europa League) or +5% (Conference League).
- Promotion: +20%.
- Trophies: +10% for the league, +12% for the Champions League, +6% for another European trophy and +5% for a domestic cup.
- Finishing at least 4 places above where your squad was expected to finish: +6%.
- Relegation: −15%. Finishing 5 or more places below expectations: −5%.

The total is capped between −25% and +50%, and the new budget applies from the next season.

## Swap deals
When you negotiate for a player, you can offer one of your own players as part of the deal, with or without cash. The selling club values him by his market price, his age and whether he is good enough for their team. The player you offer must be willing to join them. If the swap falls a little short, the club tells you how much cash to add. Swaps work even when your squad is full, because one player leaves as another arrives.

## Contracts: release clauses, signing-on fees and sell-on clauses
- **Release clauses:** every player in LaLiga has one, as Spanish law requires, and about a quarter of players elsewhere do. The clause shows in the negotiation screen and on player profiles. Pay it with **💥 Pay release clause** and the club cannot refuse, though the player still has to want to join. AI clubs can pay the clauses of your players too, and you can't stop them.
- **Your contracts:** when you sign or renew a player, you choose a release clause of no clause, 1.5×, 2× or 3× his value. A lower clause makes him accept a lower wage (up to 10% less), but it's easier for another club to take him.
- **Signing-on fees:** add a one-off fee to any contract offer. It comes out of your transfer budget and lowers the weekly wage he needs, and he values it slightly more than the same money paid as wages.
- **Sell-on clauses:** offer the selling club 10–30% of any future fee and they'll accept less now. This is worth most for young players. When the player is sold on later, that club automatically receives its cut. The same applies to players you buy who already carry a sell-on clause.

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
- **Tactics:** 27 formations (grouped by back three, four or five, including 4-2-2-2, 4-3-2-1, 3-4-2-1, 5-2-3 and a false-9 4-3-3), 4 mentalities and 7 play styles: Balanced, Tiki-taka, Gegenpress, Counter-attack, Long ball, Wing play and Park the bus. Each changes possession, attacking rate, chance quality, crossing and cards in the match engine.
- **Player roles** for every position, e.g. Holding midfielder, Deep-lying playmaker, Box-to-box, Mezzala, Inside forward, Cross specialist, Target man, Poacher, False 9 and Wing-back. Roles change who shoots, who creates, who heads crosses in, and how much each player adds to attack, midfield or defence. Goal commentary changes with the role too.
- **Player type (player career):** choose how you play (for example a winger who cuts in, or a cross specialist), and change it later in My Career.
- **Contracts & wage negotiation (both modes):** every player has a contract end date. Manager: agree the fee, then personal terms (wage and contract length) with counter-offers, and renew expiring contracts or the player leaves on a free. Player career: ask clubs for a higher wage (they have a hidden limit and may withdraw), and negotiate a new contract with your own club.
- **Bulk renew and sell (manager):** tick players in the Squad table (or use *Select expiring*) to renew several contracts at once, each with its own wage and length, or to sell them all to their best bidders (or release them) in one go. The Home screen's expiring-contracts card has a *Renew all* button.
- **Create a club (both modes):** found your own club. Pick its name, short name, stadium and badge colour, how strong the squad is compared with the league average, and (in manager mode) how rich the owner is. Your club takes the place of a club you choose, and that club's players become free agents.
- **Youth academy (manager):** upgrade your facilities (levels 1–5) for better intakes, pick a scouting region (local, Europe, South America, Africa or Asia), and watch your prospects develop every matchday. Promote the best prospects to the first team or release them. A new intake arrives each summer, and prospects aged 18 or older must be promoted or they leave.
- **International football (both modes):** 84 national teams with real players who are called up from their clubs.
  - International breaks in September, October, November and March, with friendlies and qualifiers.
  - Tournaments: AFCON (mid-season, so African players miss club games), Asian Cup, the 2026 World Cup (48 teams, hosted by USA/Mexico/Canada), Euros and Copa América (2028), and the Nations League Finals, each with groups and knockouts.
  - A world ranking based on Elo.
  - An International tab shows fixtures, groups, brackets and winners.
  - Players away on duty are marked INTL and miss club matches.
  - In player career, choose your nationality and earn caps.
- **Trophy celebrations:** 3D cutscenes when you win your league (your team jumping around the podium as the captain lifts the trophy, with confetti, fireworks and camera flashes) or the Champions League, and a stage ceremony when you or your player wins your league's **Golden Boot**. You can rewatch them from the season summary.
- **Awards gala (Ballon d'Or night), every 26 October:** when the season ends, 30 Ballon d'Or nominees and shortlists for the other awards are announced. On 26 October you get an invitation to attend the 3D ceremony in Paris: a theatre with an audience, spotlights and a giant golden ball. Each award is presented in turn (nominees, "and the winner is…", and the winner walking on stage to lift the trophy): the **Kopa Trophy** (best U21), **Yashin Trophy** (goalkeeper), **Gerd Müller Trophy** (top scorer), **Puskás Award** (goal of the season, from wonder goals in simulated matches and long-range or finesse goals you score in 3D), **Johan Cruyff Trophy** (coach, which you can win as a manager) and **Club of the Year**, with the **Ballon d'Or** last (3rd, 2nd, then the winner). Your first season shows the real 2025 results.
- **Awards dashboard:** a new Awards tab with a countdown to the next gala, the nominees (yours starred), a live Ballon d'Or race for the current season, last year's podium and winners, the Team of the Year, your awards, a "most Ballon d'Ors" list and a hall of fame with every ceremony (rewatch any of them).
- **Unexpected events (both modes):** decision cards pop up during the season, and your choice has consequences. Manager: training-ground clashes and injuries, dressing-room bust-ups, homesick players (give them leave, loan them home, or tell them to toughen up), illness in the squad, contract demands, sponsorship offers, club takeovers, fan protests, trialists, players caught partying, press conferences, veterans thinking about retirement, and rushing injured stars back. Player career: training clashes, homesickness (you can ask for a move home), endorsement deals, party invites, interviews, knocks, charity visits and scouts in the stands. Recent events are listed on your home / career page.
- **Contracts & retirement:** managers can terminate a player's contract (paying him off), resign and choose a job offer from another club, or retire. Players can terminate their contract and join a club as a free agent, or retire. Retiring ends the career with a summary of your stats, clubs, trophies and awards, plus a farewell ceremony.
- **Compressed saves:** saves are gzip-compressed so large worlds fit in browser storage.
- **FC 26 ratings import** (CSV/JSON): `Name`/`short_name`/`long_name`, `Club`/`club_name`, `Position`/`player_positions`, `OVR`/`overall`, `Age`, `League`.
- **Match engine:** a minute-by-minute simulation with live text commentary, stats, player ratings, extra time and penalty shootouts. 27 formations and 4 mentalities.
- Stats per competition, a trophy cabinet, season history and auto-save.

## Files
- `data.js`: leagues, clubs and players (`Name,POS,OVR,AGE`), plus name pools for generated players.
- `play3d.js`: the playable 3D match (three.js from cdnjs).
- `game.js`: world builder, match engine, season logic, transfers, import/export and UI.
- `style.css`: styling (responsive down to phone width).

> Built-in ratings are estimates in the style of EA SPORTS FC 26. Import an FC 26 ratings file for exact values.
