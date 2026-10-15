# Radar K-pop

![Radar K-pop](assets/icons/og.png)

A fan site that shows where eight K-pop groups play next. Each group stands on its next tour stop on a small 3D globe, drawn as chibis, with a countdown and the distance to you.

Groups: BTS, Stray Kids, TWICE, BLACKPINK, LNGSHOT, SEVENTEEN, ENHYPEN and NewJeans.

## Why

Tour dates are spread across label posts, ticket sites and fan accounts. I wanted one page that answers "where are they next, how far is that from me, and how many days are left", and that is fun enough to share.

The radar only uses public, official schedules and posts. It shows the next confirmed show, not where anyone is right now, and it works at city level only. No airport sightings and no tracking of people.

## Features

- **Globe.** It spins on its own. Drag it with one finger, pinch or use the + and − buttons to zoom, and tap the target button to center on yourself. Rotating never scrolls the page.
- **Chibis.** There is one chibi per member, 55 in total, with big heads and big eyes. They breathe while idle, hop when you tap them, and say their name in Hangul. When a unit tours (JxJ from SEVENTEEN), only those members stand on the map.
- **Your location.** The site asks for it on load. If you deny it or it fails, it falls back to Bucaramanga and tells you. You can also pick a city.
- **Sightings near you.** These are official X posts that mention a city, sorted by distance to you. They appear on the globe as round badges and in a news ticker, with a sound and a heads-up when new ones arrive.
- **Group cards.** Each card has a big countdown, km and flight hours from you, local time and your time, and the full tour. You also get the official photo (uncropped), a mini trivia, a ticket on-sale sticker and an .ics calendar file.
- **Share.** Exports a 1080 × 1920 PNG story card.
- **Alerts.** `alerts.json` is checked every minute. A new alert triggers a confetti celebration with sound.
- **Video mode.** A 9:16 automatic globe tour of about 15 seconds, ready to screen record.
- **Sonar view.** Every group placed by direction and distance from you.
- **Get alerts.** Sign up for Discord, WhatsApp or push notifications. Without a server, the form stays in your browser.
- **Other details:**
  - ES/EN.
  - Installable PWA that works offline.
  - Sounds start muted until your first tap and have a mute button.
  - Respects `prefers-reduced-motion`.

## Run it

```bash
python build.py               # builds index.html from src/template.html + events.json
python -m http.server 8000    # open http://localhost:8000
```

No framework and no npm install. Test parameters: `?now=2026-10-16T12:00:00Z`, `?pick=bts`, `?view=sonar`, `?lang=en`, `?demo=alert`, `?demo=video`.

## Data and automation

| File | What it is |
|---|---|
| `events.json` | Tour dates. Optional fields per event: `lineup` (unit members) and `onsale` (ticket sale date); `watch_en` per group. |
| `alerts.json` | Public alert feed. |
| `sightings.json` | Sightings, written by `sightings/fetch_x.py`. Without `X_BEARER_TOKEN` it holds labeled sample data. |
| `tools/members.json` | Chibi traits. `python tools/chibis.py` regenerates every SVG. |
| `assets/photos/` | Official group photos, one per group id. |
| `changelog.json` | Version history. `build.py` writes `CHANGELOG.md` and the site's "What's new" section from it. |
| `backend/` | Subscription server for Cloudflare Workers (`node backend/test.mjs` runs its tests). |
| `config.js` | Server URL, VAPID public key and public site URL. |

A GitHub Action runs every 15 minutes. It updates dates, sightings and alerts, sends Discord, WhatsApp and push messages, and rebuilds the page. Setup for every key and server is in [ALERTAS.md](ALERTAS.md) (Spanish).

Made with fan love by [Cristian Pérez](https://cristianperez.me).
