# Saviour

**The launchpad that saves the trenches.** A Solana launchpad built against bundles, vamps and ticker races. `$SAVIOUR` launches first on pump.fun, and the launchpad follows.

- **0.5 SOL deploy fee**, 100% used to buy and burn `$SAVIOUR`
- **30-minute ticker lock** on normalised tickers, so `SAV1OUR`, `$saviour` and Cyrillic look-alikes all count as one
- Fair Start batch auction, Bundle Score, Origin badges, Vamp Shield and more. See the litepaper.

## Repo

| Path | What |
|---|---|
| `index.html`, `styles.css`, `main.js` | The website: static, no build step |
| `assets/` | Logo, favicon, OG image (`og.svg` source, `og.png` for social cards) |
| [`docs/LITEPAPER.md`](docs/LITEPAPER.md) | Product, rules, feature ideas, revenue routing, roadmap |
| [`docs/TECH_SPEC.md`](docs/TECH_SPEC.md) | How the launchpad is built: Anchor accounts, instructions, indexer |
| [`docs/LAUNCH_PLAYBOOK.md`](docs/LAUNCH_PLAYBOOK.md) | Step-by-step pump.fun launch and 30-day growth plan |
| [`docs/LAUNCHPAD_BUILD_PLAN.md`](docs/LAUNCHPAD_BUILD_PLAN.md) | Plan for the working launchpad: 0.5 SOL fee, auto burn, ticker lock on Meteora DBC |

## Going live

1. Edit `CONFIG` at the top of `main.js`:
   ```js
   const CONFIG = {
     ticker: "SAVIOUR",
     ca: "<contract address from pump.fun>",
     links: {
       pump: "https://pump.fun/coin/<CA>",
       dex: "https://dexscreener.com/solana/<CA>",
       x: "https://x.com/<handle>",
       telegram: "https://t.me/<group>",
     },
     lockMinutes: 30,
   };
   ```
   The ticker, CA and every button on the page update from this one object.
2. Deploy the folder as a static site:
   - **Vercel:** `npx vercel --prod` in the repo root, or import the GitHub repo (framework preset "Other").
   - **Netlify:** drag the folder into app.netlify.com/drop, or connect the repo (no build command, publish directory `.`).
   - **GitHub Pages:** Settings → Pages → deploy from branch, root folder.
3. Set `og:image` in `index.html` to an absolute URL (`https://yourdomain/assets/og.png`) so X and Telegram previews work.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Design system

Playful launchpad style (chunky type, pill controls, hard offset shadows, cream page with dark bands), in Saviour's own rescue orange.

| Token | Hex | Use |
|---|---|---|
| Paper | `#F7F5EE` | Page background |
| Ink | `#141210` | Text, outlines, hard shadows (`2px 2px 0`) |
| Rescue orange | `#FF4F00` | Header, primary buttons, highlights, burn |
| Sand | `#E6E3D8` / `#CFCBBD` | Card borders, dividers |
| Band | `#0E0E0E` / `#161616` | Dark sections (lock board, footer) |
| Up / down | `#2ED37A` / `#F0565B` | Locked / flagged states |

Type: **Archivo Black** (uppercase hero), **Titan One** (display headings), **Plus Jakarta Sans** (UI), **IBM Plex Mono** (data), **Shantell Sans** (hand-drawn notes).

---

`$SAVIOUR` is a memecoin with no intrinsic value or expectation of financial return. Nothing here is financial advice.
