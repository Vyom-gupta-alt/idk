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

# OpenScore — free SAT & ACT prep (`prep/`)

A second site lives in [`prep/`](prep/): a free SAT/ACT prep platform. Every feature is free, with no accounts and no backend. Progress is stored in the browser's `localStorage`.

## Features
- **Question Bank**: hand-written SAT (Math, Reading & Writing) and ACT (English, Math, Science, Reading) questions tagged by domain, skill and difficulty (Easy to Extreme), each with an explanation and, where useful, a Desmos shortcut.
- **Infinite Math**: procedurally generated SAT math (linear, systems, quadratics, quadratic regression, exponentials, percents, circles, and more). Every generated question has a worked answer.
- **Adaptive mock exams**: timed SAT Math (Module 2 routes harder or easier based on Module 1), SAT R&W, and ACT mixed. Scored with a full answer review.
- **Diagnostics**: accuracy by domain, predicted SAT (400–1600) and ACT (1–36) scores, and a study path built from your weakest domains.
- **Daily question** with streak tracking, a **vocab builder** (flashcards and quiz), **course modules** (Desmos regression techniques, SAT R&W, ACT strategy), and **Atlas**, a rule-based study tutor that runs in the browser.
- Built-in **Desmos calculator** drawer.

## Run
```bash
cd prep && python3 -m http.server 8000   # then open http://localhost:8000
```

## Add content
- Questions: `prep/js/data-questions.js` (schema documented at the top of the file)
- Vocab: `prep/js/data-vocab.js` · Lessons: `prep/js/data-lessons.js` · Generators: `prep/js/generator.js`
- The Desmos embed uses Desmos's public **demo** API key (`DESMOS_KEY` in `prep/js/app.js`). Get your own key from https://www.desmos.com/api before deploying publicly.
