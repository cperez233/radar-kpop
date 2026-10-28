# Radar K-pop

**English** · [Español](README.es.md)

![Radar K-pop](assets/icons/og-2026.jpg)

**Where are your favorite groups playing next, and how far is it from you?**

Radar K-pop puts ten groups on a small 3D globe, each one drawn as chibis standing on its next tour stop. You get a countdown, the distance to you and a pastel map of the venue's neighborhood. It's a sticker book you can open every day.

Live at [radar-kpop.vercel.app](https://radar-kpop.vercel.app).

## The groups

<table>
<tr><td align="center" width="33%"><img src="assets/chibis/bts.svg" alt="BTS chibis" height="110"><br><b>BTS</b><br><sub>ARMY</sub></td><td align="center" width="33%"><img src="assets/chibis/skz.svg" alt="Stray Kids chibis" height="110"><br><b>Stray Kids</b><br><sub>STAY</sub></td><td align="center" width="33%"><img src="assets/chibis/twice.svg" alt="TWICE chibis" height="110"><br><b>TWICE</b><br><sub>ONCE</sub></td></tr>
<tr><td align="center" width="33%"><img src="assets/chibis/blackpink.svg" alt="BLACKPINK chibis" height="110"><br><b>BLACKPINK</b><br><sub>BLINK</sub></td><td align="center" width="33%"><img src="assets/chibis/lngshot.svg" alt="LNGSHOT chibis" height="110"><br><b>LNGSHOT</b><br><sub>SHOTTIES</sub></td><td align="center" width="33%"><img src="assets/chibis/seventeen.svg" alt="SEVENTEEN chibis" height="110"><br><b>SEVENTEEN</b><br><sub>CARAT</sub></td></tr>
<tr><td align="center" width="33%"><img src="assets/chibis/enhypen.svg" alt="ENHYPEN chibis" height="110"><br><b>ENHYPEN</b><br><sub>ENGENE</sub></td><td align="center" width="33%"><img src="assets/chibis/newjeans.svg" alt="NewJeans chibis" height="110"><br><b>NewJeans</b><br><sub>Bunnies</sub></td><td align="center" width="33%"><img src="assets/chibis/cortis.svg" alt="CORTIS chibis" height="110"><br><b>CORTIS</b><br><sub>COER</sub></td></tr>
<tr><td align="center" width="33%"><img src="assets/chibis/ateez.svg" alt="ATEEZ chibis" height="110"><br><b>ATEEZ</b><br><sub>ATINY</sub></td><td></td><td></td></tr>
</table>

## What you get

- **A globe you can play with.** Spin it, pinch it, center it on yourself. It stays where you leave it.
- **68 hand-made chibis.** Every current member has a sticker with their own props, like Jin's heart or Hoshi's tiger paws. Tap one and it hops and says its name in Hangul.
- **A card per group.** Big countdown, kilometers from you, the full tour, the official photo, music links and a ticket on-sale sticker. One tap saves the show to your calendar.
- **Member pages.** Profiles with birthdays, official accounts and latest TikToks. Birthdays get a banner, a cake and confetti. Members in military service show up in grey and come back in color on their return date.
- **Your bias, your groups.** Heart the groups you follow and they go first. Pick a bias and it gets the big spot on your shareable story card.
- **Lightsticks.** Each official lightstick is drawn by hand. Tap to light it up, one at a time, like in a stadium.
- **Concert mode.** A show-night dark theme with a night globe, a lit city map and a sea of lightsticks in the color you picked.
- **Coming to your country.** When a tour stops within 600 km of you, the card tells you and counts down to that show.
- **Alerts.** New dates, releases and sightings reach you through free ntfy topics or a Discord forum, with confetti in the page. No account, no personal data.
- **Nearby sightings, news and releases.** Official posts that mention a city, fresh music and videos, and news auto-translated with the original one tap away.
- **Made for phones.** Swipeable group cards, an installable PWA, English and Spanish, small sounds you can mute, and `prefers-reduced-motion` respected.
- **Video mode.** A clean 9:16 tour of about 15 seconds, made for screen recording.

## Try it in 30 seconds

- [Open the radar](https://radar-kpop.vercel.app/) and tap **Use my location** to see who is closest to you.
- Jump straight to a group: [BTS](https://radar-kpop.vercel.app/?pick=bts), [Stray Kids](https://radar-kpop.vercel.app/?pick=skz), [TWICE](https://radar-kpop.vercel.app/?pick=twice).
- See the [sonar view](https://radar-kpop.vercel.app/?view=sonar) of every group around you.
- Watch the [video mode](https://radar-kpop.vercel.app/?demo=video), a 15-second tour made for screen recording.
- Switch language with `?lang=en` or `?lang=es`.

## Why it exists

Tour dates are scattered across label posts, ticket sites and fan accounts. I wanted one page that says where they are next, how far that is from me and how many days are left, and that is fun enough to share.

It only uses public, official schedules and posts. It shows the next confirmed show, not where anyone is right now. Everything is at city level: no airport sightings, no tracking of people.

## Stack

Plain HTML, CSS and JavaScript, with no framework and no npm install. The globe is a canvas drawn with d3-geo, the chibis are SVG and WebP stickers in the DOM, and the city maps use MapLibre with OpenFreeMap tiles. Python scripts fetch and merge the data, and a Python build step bakes it into a single `index.html`. It deploys on Vercel, runs as an installable PWA with a service worker, and keeps alert subscriptions in a tiny Cloudflare Worker.

A bit more detail:

- **Data.** A curated tour file plus Ticketmaster, iTunes, YouTube, kworb.net, official posts on X and TikTok, and news RSS feeds.
- **Updates.** A GitHub Action runs every 15 minutes, refreshes everything and sends alerts (ntfy, Discord). Each step fails softly.
- **Live data.** The bot stores the data on the `data` branch (never on `main`), which GitHub Pages serves at `cperez233.github.io/radar-kpop`; the page reads it from there (`dataUrl` in `config.js`). Fresh data costs no Vercel deploys: the site only deploys when the code changes. `index.html` carries a fallback copy; to refresh it before pushing code: `git fetch origin data && git checkout FETCH_HEAD -- . ':!vercel.json' ':!.nojekyll' ':!.gitignore' && python build.py`.
- **Keys.** Setup is in [CLAVES.md](CLAVES.md) (Spanish); alert channels are in [ALERTAS.md](ALERTAS.md).

```bash
python build.py               # builds index.html
python -m http.server 8000    # open http://localhost:8000
```

Test parameters: `?now=2026-10-16T12:00:00Z`, `?pick=bts`, `?view=sonar`, `?lang=en`, `?demo=alert`, `?demo=video`. Chibis are cut from the sticker sheets in `tools/art/` with `python tools/chibis_images.py`.

Made with fan love by [Cristian Pérez](https://cristianperez.me).
