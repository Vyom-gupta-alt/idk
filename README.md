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
