# Portfolio Website

An interactive, animated one-page portfolio site — pure HTML/CSS/JS, no build step required.

## Features
- Dark, professional theme with gradient accents
- Animated preloader, custom cursor, and scroll progress bar
- Scroll-triggered reveal animations (IntersectionObserver)
- Animated stat counters, skill progress bars, and infinite marquees
- Auto-scrolling testimonials/reviews carousel (pauses on hover)
- Magnetic buttons, parallax hero blobs, and a responsive mobile nav
- Fully responsive down to mobile widths

## Structure
- `index.html` — page markup & content
- `style.css` — all styling & animations
- `script.js` — interactivity (cursor, reveal, counters, marquees, nav)

## Customize
- Swap the name, bio, stats, skills, projects, and testimonials in `index.html`.
- Update the contact email/social links in the `#contact` section.
- Colors and easing live in the `:root` variables at the top of `style.css`.

## Run locally
Just open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

---

# Crown Clash (`arena/`)

A real-time tower-battle strategy game, playable in the browser with no build step. Open `arena/index.html`, or serve the repo and visit `/arena/`.

## What's implemented
- **Arena:** 18×32 vertical map with a river, two bridges, two Princess Towers and a King Tower per side. Ground troops path over the bridges (the Boar Rider leaps the river). The King Tower sleeps until it takes damage, then fires for the rest of the match. Destroying it is an instant three-crown win.
- **Clock:** 3:00 regulation. Up to 2:00 of sudden-death overtime if crowns are tied, where the first tower down wins. If it's still tied, the side whose weakest tower has the lowest HP loses.
- **Elixir:** 10 cap, 1 per 2.8s, ×2 in the last minute and ×3 in overtime. Live elixir-trade counter in battle; the end screen shows spent, leaked, destroyed and lost elixir.
- **Cards:** 25 cards across Common/Rare/Epic/Legendary/Champion: win conditions, spells and support. Levels 1–16 at +10% HP/damage per level. Copy totals per rarity (23,000 / 4,800 / 600 / 70 / 42) and 365,000 gold per card match the design spec. Max-level cards unlock cosmetic Star Levels that don't change stats.
- **Deck slots:** 8 cards with an Evolution slot, a Hero slot and a Wild slot. Evolution-capable cards in the Evo or Wild slot play evolved. Heroes have activated abilities and can only go in the Hero or Wild slot.
- **Modes:** 1v1 Ladder (trophies), 2v2 with an AI ally, Training Camp (fixed bots) and Practice Matches. Practice Matches replay a ladder opponent who beat you, with their exact deck and levels.
- **Matchmaking fallback:** at low trophies or during off-peak hours, the queue fills quickly with scripted bots that use rigid patterns, flawless timing and canned emotes.

## Code
- `arena/js/data.js`: rules constants, rarities, upgrade tables, cards, bot decks
- `arena/js/engine.js`: deterministic battle simulation (`Match`)
- `arena/js/ai.js`: bot brains (training / human-like / practice / scripted / ally)
- `arena/js/render.js`: canvas renderer
- `arena/js/main.js`: profile (localStorage), menus, matchmaking, battle HUD

All opponents are local AI. There is no network multiplayer server.
