# Soccer Manager 26

A text-based football manager simulation in plain HTML/CSS/JS (no build step, no dependencies).

## Play
Open `soccer-manager/index.html` in a browser, or serve the repo:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000/soccer-manager/
```

## Features
- **7 European leagues:** Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Liga Portugal and Eredivisie. Squads are real 2025/26 players (~2,700 in total). Where a club's listed squad is thin it is topped up with generated "Academy" players.
- **OVR system (FC 26 style):** every player has an overall rating, position and age. A player's rating in a slot is OVR minus an out-of-position penalty, plus or minus current form.
- **Import real FC 26 ratings:** use *Import FC 26 ratings* on the start screen or the *Data* tab to load a CSV/JSON file. Players are matched by name and club, then re-rated, moved to their listed club, or added. Recognised columns: `Name`/`short_name`/`long_name`, `Club`/`club_name`, `Position`/`player_positions`, `OVR`/`overall`, `Age`, `League`. A template and a full CSV export of the database are available in-game.
- **Transfer market:** search and filter every player in Europe plus free agents and youth players. Prices come from OVR, age, position, form and average match rating, so players who perform well get more expensive. You can sell to AI clubs (multiple offers), release players, and accept or reject incoming bids.
- **Tactics:** 9 formations (4-3-3, 4-4-2, 4-2-3-1, 4-1-2-1-2, 4-1-4-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1) on an interactive pitch, 4 mentalities, and auto-pick of the best XI.
- **Simulate Match:** a minute-by-minute engine with live text commentary (goals, saves, woodwork, corners, penalties, cards, injuries), match stats, player ratings and a player of the match. The preview shows team strengths and win/draw/loss odds.
- **Season calendar:** a dated fixture list for the whole season. Browse any matchday, jump ahead with *Simulate up to Matchday X*, quick-sim a single round, or simulate the rest of the season. Played matches open a match report.
- **League table, stats** (top scorers, assists, ratings, clean sheets), injuries, suspensions and a news feed.
- **Multiple seasons:** prize money, player ageing and progression, retirements, academy graduates and manager history.
- Auto-saves to `localStorage`. Save files can be downloaded and loaded.

## Files
- `data.js`: leagues, clubs and players (`Name,POS,OVR,AGE`), plus name pools for generated players.
- `game.js`: world builder, match engine, season logic, transfers, import/export and UI.
- `style.css`: styling (responsive down to phone width).

> Built-in ratings are estimates in the style of EA SPORTS FC 26. Import an FC 26 ratings file for exact values.
