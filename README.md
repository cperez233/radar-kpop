# Radar K-pop

![Radar K-pop](assets/icons/og.png)

A fan site that shows where ten K-pop groups play next. Each group stands on its next tour stop on a small 3D globe, drawn as chibis, with a countdown, the distance to you and a pastel map of the venue's neighbourhood.

Live at [radar-kpop.vercel.app](https://radar-kpop.vercel.app).

## The groups

<table>
<tr><td align="center" width="33%"><img src="assets/chibis/bts.svg" alt="BTS chibis" height="110"><br><b>BTS</b><br><sub>ARMY</sub></td><td align="center" width="33%"><img src="assets/chibis/skz.svg" alt="Stray Kids chibis" height="110"><br><b>Stray Kids</b><br><sub>STAY</sub></td><td align="center" width="33%"><img src="assets/chibis/twice.svg" alt="TWICE chibis" height="110"><br><b>TWICE</b><br><sub>ONCE</sub></td></tr>
<tr><td align="center" width="33%"><img src="assets/chibis/blackpink.svg" alt="BLACKPINK chibis" height="110"><br><b>BLACKPINK</b><br><sub>BLINK</sub></td><td align="center" width="33%"><img src="assets/chibis/lngshot.svg" alt="LNGSHOT chibis" height="110"><br><b>LNGSHOT</b><br><sub>SHOTTIES</sub></td><td align="center" width="33%"><img src="assets/chibis/seventeen.svg" alt="SEVENTEEN chibis" height="110"><br><b>SEVENTEEN</b><br><sub>CARAT</sub></td></tr>
<tr><td align="center" width="33%"><img src="assets/chibis/enhypen.svg" alt="ENHYPEN chibis" height="110"><br><b>ENHYPEN</b><br><sub>ENGENE</sub></td><td align="center" width="33%"><img src="assets/chibis/newjeans.svg" alt="NewJeans chibis" height="110"><br><b>NewJeans</b><br><sub>Bunnies</sub></td><td align="center" width="33%"><img src="assets/chibis/cortis.svg" alt="CORTIS chibis" height="110"><br><b>CORTIS</b><br><sub>COER</sub></td></tr>
<tr><td align="center" width="33%"><img src="assets/chibis/ateez.svg" alt="ATEEZ chibis" height="110"><br><b>ATEEZ</b><br><sub>ATINY</sub></td><td></td><td></td></tr>
</table>

## Why

Tour dates are spread across label posts, ticket sites and fan accounts. I wanted one page that answers three questions: where they are next, how far that is from me, and how many days are left. It also had to be fun enough to open every day and share.

The radar only uses public, official schedules and posts. It shows the next confirmed show, not where anyone is right now. It works at city level only, with no airport sightings and no tracking of people.

## Features

- **Globe.** It spins on its own until you touch it. After that it stays exactly where you leave it.
  - Drag with one finger in any direction; the page does not scroll.
  - Pinch or use the + and − buttons to zoom.
  - Center on yourself, or turn auto-rotate back on.
- **Chibis.** Every current member has a hand-made sticker, 68 in total, each with their own props (Jin's heart, Hoshi's tiger paws, Felix's brownies...). They breathe on the globe. Tap one and it hops and says its name in Hangul.
- **Location.** It asks with a tap, so the browser always shows its prompt. The screen always says whether your location is real, picked by you, or the default (Bucaramanga), and why.
- **City map.** A pastel map around each venue, with 3D buildings and the group standing on it. Built with MapLibre and OpenFreeMap: free, no API key.
- **Group cards.** Each card shows:
  - a big countdown, km from you and local time;
  - the uncropped official photo and the full tour;
  - sticker-style links to Spotify, Apple Music, YouTube Music, YouTube and Weverse (when the group has a community);
  - facts and numbers, the same for every group: debut, years active, members, Spotify monthly listeners, their record, total streams and most streamed song;
  - a mini trivia of timeless facts (names, nicknames, leaders), a ticket on-sale sticker and an .ics calendar file.
- **Group pages.** "See all" on a card (or tapping a chibi) opens a page with tabs: home, members, tour, music and social.
  - Each member has a profile with their birthday, official accounts and latest TikToks; videos play right there.
  - Birthdays get a banner, a cake on the chibi and confetti.
- **Members who are away or left.** Members in military service are shown in grey with a helmet, their enlistment date and their return date, and they come back in colour on their own on that date. Former members appear in grey with the reason (left the group, went solo, contract ended). A watcher reads official posts and the news: an official notice updates the page by itself; news alone only adds a "there is news" link.
- **On phones.** Group cards are a swipeable carousel with a strip of group chibis on top; each card keeps the essentials and folds the photo, music, facts and trivia under one button.
- **Sightings near you.** Official posts that mention a city, newest first (or nearest first), skipping vlogs, videos and merch, with a news ticker and a heads-up when new ones arrive.
- **Releases and videos.** The latest music and official YouTube uploads of each group. Upcoming releases are read from official posts before Apple Music lists them; the card says "Out today!" on the day and "New" for ten days after.
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
| Tour dates | `events.json` (curated, sources in the page footer) + Ticketmaster Discovery API | Ticketmaster adds and updates dates (`TM_API_KEY`); curated dates are never dropped; old past dates are pruned |
| Releases | iTunes Search API (Apple Music catalog) | No key. Future-dated releases show as "Next release" on the card |
| Official videos | YouTube Data API v3 | Needs `YT_API_KEY` (YouTube stopped serving channel RSS in 2026) |
| Group numbers (`stats.json`) | kworb.net (Spotify listeners, streams, top song) + YouTube Data API | Spotify numbers need no key, refreshed every 12 hours |
| Upcoming releases (`releases.json`) | Official posts on X and TikTok ("EP [S.W.I.S.H.] 11/10", "2026. 11. 13 RELEASE") | No key |
| Member status (`rosterwatch.json`) | Official posts + Google News (enlistment, discharge, return, departure) | No key; official notices update the page, news only adds a link |
| News | Soompi and Koreaboo RSS, Google News RSS | No key |
| Official posts: sightings, arrivals, announcements | X through a self-hosted RSSHub (`RSSHUB_URL`); paid X API as a fallback | Works with RSSHub |
| City maps | OpenFreeMap vector tiles | No key |
| Alert delivery | Discord webhook, ntfy (phone push), Web Push, WhatsApp Cloud API | Discord and ntfy are free; see CLAVES.md |

A GitHub Action runs every 15 minutes: it refreshes dates, releases, numbers, sightings and alerts, sends messages, and rebuilds the page. Every step fails softly, and each run's Summary shows which keys are set and how fresh each source is. Key setup, with what each key costs, is in [CLAVES.md](CLAVES.md) (Spanish); alert channels are in [ALERTAS.md](ALERTAS.md).

## Run it

```bash
python build.py               # builds index.html (data, photos, chibis, changelog, CSP, asset versions)
python -m http.server 8000    # open http://localhost:8000
```

No framework and no npm install. The chibis come from hand-made sticker sheets in `tools/art/` (`python tools/chibis_images.py` cuts them out); `python tools/chibis.py` writes the member roster and the generic chibi for new groups. Test parameters: `?now=2026-10-16T12:00:00Z`, `?pick=bts`, `?view=sonar`, `?lang=en`, `?demo=alert`, `?demo=video`.

Made with fan love by [Cristian Pérez](https://cristianperez.me).
