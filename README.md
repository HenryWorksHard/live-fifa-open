# Live FIFA Open

Pack-opening web app for the 2026 World Cup. Pick a pack, click to rip, tap each card to spin-reveal — FUT-style cards with real player data across the 48 qualified nations.

## Run locally

No build step. Serve the folder over any static server:

```bash
python3 -m http.server 5173
# then open http://localhost:5173
```

## Project shape

- `index.html` — shell with picker / pack / reveal screens and the session stats bar
- `styles.css` — base, packs, FUT card design (6 rarity tiers), spin animation, responsive
- `app.js` — state machine, weighted card selection per set, flip-and-slide reveal flow, holo tilt
- `data/cards.json` — 84 cards across 37 nations (bronze / silver / gold / rare_gold / hero / icon)

## Notes

- Country flag images are loaded from [flagcdn.com](https://flagcdn.com).
- Player face graphics are silhouette SVG placeholders — drop in licensed photos by editing the `<svg use="#silhouette">` block in `app.js`.
- Card and pack art is entirely original CSS — not a copy of any EA / FIFA / Panini artwork.
