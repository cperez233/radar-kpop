# Radar K-pop

![Radar K-pop](assets/icons/og.png)

A fan site that shows where eight K-pop groups play next. Each group stands on its next tour stop on a small 3D globe, drawn as chibis, with a countdown, the distance to you and a pastel map of the venue's neighbourhood.

Groups: BTS, Stray Kids, TWICE, BLACKPINK, LNGSHOT, SEVENTEEN, ENHYPEN and NewJeans.

Live at [radar-kpop.vercel.app](https://radar-kpop.vercel.app).

## Why

Tour dates are spread across label posts, ticket sites and fan accounts. I wanted one page that answers three questions: where they are next, how far that is from me, and how many days are left. It also had to be fun enough to open every day and share.

The radar only uses public, official schedules and posts. It shows the next confirmed show, not where anyone is right now. It works at city level only, with no airport sightings and no tracking of people.

## Features

- **Globe.** It spins on its own until you touch it. After that it stays exactly where you leave it.
  - Drag with one finger in any direction; the page does not scroll.
  - Pinch or use the + and − buttons to zoom.
  - Center on yourself, or turn auto-rotate back on.
- **Chibis.** Every current member is hand-built in SVG, 55 in total, in a K-pop sticker style. They breathe and blink. Tap one and it hops and says its name in Hangul.
- **Location.** It asks with a tap, so the browser always shows its prompt. The screen always says whether your location is real, picked by you, or the default (Bucaramanga), and why.
- **City map.** A pastel map around each venue, with 3D buildings and the group standing on it. Built with MapLibre and OpenFreeMap: free, no API key.
- **Group cards.** Each card shows:
  - a big countdown, km from you and local time;
  - the uncropped official photo and the full tour;
  - a mini trivia, a ticket on-sale sticker and an .ics calendar file.
- **Sightings near you.** Official posts that mention a city, sorted by distance to you, with a news ticker and a heads-up when new ones arrive.
- **Releases and videos.** The latest music and official YouTube uploads of each group.
- **Alerts.** A new alert triggers a confetti celebration. You can also sign up for Discord, WhatsApp or push notifications.
- **Video mode.** A clean 9:16 tour of about 15 seconds, made for screen recording.
- **Everything else.**
  - A top menu that follows the section you are in.
  - A sonar view of all groups around you.
  - Shareable PNG story cards.
  - Spanish and English, with an animated switch.
  - An installable PWA.
  - Small sounds: muted until your first tap, with a mute button.
  - Respects `prefers-reduced-motion`.

## Data sources

| Data | Source | Status |
|---|---|---|
| Tour dates | `events.json` (curated, sources listed in the page footer) + Ticketmaster Discovery API | Curated data works. Ticketmaster needs `TM_API_KEY`. |
| Releases | iTunes Search API | Works, no key |
| Official videos | YouTube channel RSS | Works, no key |
| News | Soompi and Koreaboo RSS, Google News RSS | Works, no key |
| City maps | OpenFreeMap vector tiles | Works, no key |
| Sightings | X API v2, official accounts only | Sample data until `X_BEARER_TOKEN` is set |
| "Arrived in..." posts | X through a self-hosted RSSHub | Needs `RSSHUB_URL` |
| Sign-ups and push | `backend/` worker on Cloudflare | Needs `subscribeEndpoint`, `vapidPublicKey` and `VAPID_PRIVATE_KEY` |
| Discord and WhatsApp delivery | Discord bot or webhook, WhatsApp Cloud API | Need their tokens |

A GitHub Action runs every 15 minutes: it refreshes dates, releases, sightings and alerts, sends messages, and rebuilds the page. Key setup is in [ALERTAS.md](ALERTAS.md) (Spanish).

## Run it

```bash
python build.py               # builds index.html (data, photos, chibis, changelog, CSP, asset versions)
python -m http.server 8000    # open http://localhost:8000
```

No framework and no npm install. `python tools/chibis.py` redraws the chibis from `tools/members.json`. Test parameters: `?now=2026-10-16T12:00:00Z`, `?pick=bts`, `?view=sonar`, `?lang=en`, `?demo=alert`, `?demo=video`.

Made with fan love by [Cristian Pérez](https://cristianperez.me).
