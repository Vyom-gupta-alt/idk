# Soccer Manager 26

A text-based football manager simulation in plain HTML/CSS/JS (no build step, no dependencies).

## Play
Open `soccer-manager/index.html` in a browser, or serve the repo:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000/soccer-manager/
```

## Features
- **7 European leagues:** Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Liga Portugal and Eredivisie, with real 2025/26 squads (~2,700 players). Every league is played in full each season.
- **Cups & Europe:** each country has its domestic cup (FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France, Taça de Portugal, KNVB Cup) as a single-leg knockout with extra time and penalties. There is also a **Champions League** (36 clubs), **Europa League** (24) and **Conference League** (16), with a Swiss-style league phase, two-legged knockout ties and a one-match final. European places come from league position plus the cup winner. Season 1 uses the real 2024/25 tables.
- **One real calendar:** league games on Saturdays, cup and European games midweek, and international breaks. Browse any date, or simulate up to a date or to the end of the season.
- **Locked lineup:** your XI never changes unless you change it. Injured or suspended players get a temporary stand-in and return to the team automatically once available.
- **Dynamic OVR:** after every match, players gain or lose progress based on their match rating. Young players grow fastest, up to a hidden potential (shown as a range), and it gets harder to improve the higher a player's OVR already is. Veterans slowly decline. There is also a summer age effect, plus retirements and academy graduates.
- **Realistic transfers:**
  - Summer (until 1 Sep) and January windows. Free agents can be signed any time.
  - Clubs value their key players, young talents and players sold to league rivals higher, and some stars are untouchable.
  - Fee negotiation with counter-offers and a limit of 3 bids per window.
  - Players may refuse to join clubs that are smaller, play in a weaker league or have no European football.
  - Wage demands must fit your wage budget.
  - AI clubs buy and sell among themselves, and bid for your players.
- **FC 26 ratings import** (CSV/JSON): `Name`/`short_name`/`long_name`, `Club`/`club_name`, `Position`/`player_positions`, `OVR`/`overall`, `Age`, `League`.
- **Match engine:** a minute-by-minute simulation with live text commentary, stats, player ratings, extra time and penalty shootouts. 9 formations and 4 mentalities.
- Stats per competition, a trophy cabinet, season history and auto-save.

## Files
- `data.js`: leagues, clubs and players (`Name,POS,OVR,AGE`), plus name pools for generated players.
- `game.js`: world builder, match engine, season logic, transfers, import/export and UI.
- `style.css`: styling (responsive down to phone width).

> Built-in ratings are estimates in the style of EA SPORTS FC 26. Import an FC 26 ratings file for exact values.
