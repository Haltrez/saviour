# $SAVIOUR Launch Playbook (pump.fun)

The token **is** the pitch. A launchpad that claims to fight bundles has to launch cleaner than anything else on pump.fun. People will check the first block on Solscan, Bubblemaps and GMGN within minutes, so a bundled launch would kill the narrative immediately.

---

## 1. Before launch (T-7 to T-1 days)

**Identity**
- [ ] Final ticker. The site defaults to `$SAVIOUR`. Check pump.fun and Dexscreener for live coins using it, and pick a variant if it's taken.
- [ ] Logo: `assets/logo.svg`. Export a **1000×1000 PNG** on the ink background `#0E0D0B` for the pump.fun image. It must read clearly at 48px.
- [ ] Banner for X and Dexscreener: export from `assets/og.svg` (1500×500 version for X).

**Channels**
- [ ] X account `@...` with a pinned thread: problem → rules → site → "CA drops here".
- [ ] Telegram group with a bot (Rose or Safeguard), slow mode, and a CA pin ready.
- [ ] Site deployed (see README) with a custom domain such as `saviour.fun` or `usesaviour.xyz`.

**Content queue (10–15 posts ready before launch)**
- [ ] Screen recording of the **Ticker Lock demo**: type `SAV1OUR` and show it getting locked. This is the clip that sells "tech coin".
- [ ] Before/after graphics: "10 tickers in 60 seconds on pump.fun" vs "1 ticker, locked".
- [ ] A Bubblemaps screenshot of a known bundled launch (anonymised) next to "this can't happen on Saviour".
- [ ] A thread on burn-engine maths, e.g. "1,000 launches a day = 500 SOL a day of buy pressure, burned". Present it as a scenario, not a promise.

**Wallets**
- [ ] One fresh **dev wallet** funded from a CEX or a known wallet, with a public address.
- [ ] No other team wallets buy in the first minutes. Anything else looks like a bundle, and on-chain sleuths will find it.

---

## 2. Launch day: exact pump.fun steps

1. Open **pump.fun** and connect the dev wallet (Phantom or Solflare).
2. Click **Create coin**.
3. Fill in the form:
   - **Name:** `Saviour`
   - **Ticker:** `SAVIOUR` (or your final ticker)
   - **Description:** `The launchpad that saves the trenches. 0.5 SOL deploy fee bought & burned. 30-min ticker lock. No bundles, no vamps. Fair launched: no presale, no team allocation.`
   - **Image:** the 1000×1000 PNG
   - **Socials:** Website, X, Telegram. Fill in all three, because empty socials read as low effort.
4. **Dev buy:** keep it small and public, about **0.5–1.5 SOL**. Tweet the dev wallet address before or at launch, and say it is the only team wallet.
5. Confirm the transaction. Copy the **CA** (contract address).
6. Within 60 seconds:
   - [ ] Paste the CA into `main.js` → `CONFIG.ca`, set `CONFIG.links.pump` to `https://pump.fun/coin/<CA>`, then redeploy the site.
   - [ ] Post the CA on X (quote the pinned thread) and in Telegram, then pin it.
   - [ ] Post the dev wallet address publicly.

> Never use bundlers, sniper rings or "volume bots" on this coin. It's the one thing the brand can't survive.

---

## 3. Day 0–3: bonding curve to graduation
- Run Telegram raids on your own X posts every 30–60 minutes.
- Do a live **X Space** in the first 24 hours: walk through the problem, the rules and the lock demo on screen.
- Reply under every big "bundled again" or "rugged by a copy" tweet in the trenches with the lock demo clip. Be helpful, not spammy.
- After graduation to PumpSwap:
  - [ ] **Dexscreener Enhanced Token Info**: logo, banner, socials, description.
  - [ ] Consider a Dex boost timed with a content drop rather than at random.
  - [ ] Submit to GMGN, Birdeye and Jupiter's token list where applicable.

## 4. Day 3–30: proof of tech (what separates a $1M meme from a $20M one)

Tech coins re-rate on **shipping**. Every milestone is a catalyst, so space them out:

| When | Ship | Why it moves price |
|---|---|---|
| Week 1 | Open-source normaliser library on GitHub + public repo of this site | "Real devs" signal; people can read the code |
| Week 2 | **Devnet Ticker Registry** live, with a public page where anyone can try to deploy a locked ticker | The core claim becomes verifiable |
| Week 3 | Bundle Score beta for any pump.fun coin (paste a CA, get a score) | A **free tool** for the trenches that spreads the brand on every share |
| Week 4 | Audit firm engaged and announced; mainnet date window | Credibility for bigger wallets |

The **Bundle Score for any pump.fun coin** tool is the biggest lever. It is useful today, before the launchpad exists, and every screenshot of it is free marketing.

## 5. KOLs and partnerships
- Prefer tech-focused and trench-native accounts over pure shillers. Ask them to demo the tool, not just post the CA.
- Pay in vested tokens over 30–90 days, or in SOL with disclosed posts. Avoid large up-front token dumps to KOLs, because they sell into your community.
- Partner with **existing anti-rug tools** (bundle checkers, Telegram trading bots) to display the Saviour Bundle Score and Origin badge.

## 6. Market cap milestones (targets, not promises)

| Stage | Rough mcap | Typical catalyst |
|---|---|---|
| Graduation | about $60–90K | Organic launch, clean first block, X Space |
| Survival | $250K–1M | Dex profile, raids, lock demo clip spreading |
| Narrative | $1–5M | Devnet registry live, Bundle Score tool, mid-tier KOLs |
| Category | $5–20M+ | Audit, mainnet date, real launches burning `$SAVIOUR`, tier-1 KOLs and listings |

Most memecoins never pass graduation. No one can guarantee a $20M market cap. What you control is a clean launch, consistent shipping and honest communication, and that's the playbook above.

## 7. Legal hygiene
- Never promise returns ("100x", "guaranteed", "passive income"). Describe the mechanics and let people decide.
- Keep the disclaimer on the site and in the pinned Telegram message.
- If you take a treasury share of platform fees later, check the regulatory implications for your jurisdiction before mainnet.
