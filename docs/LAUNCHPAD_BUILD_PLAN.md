# Saviour Launchpad: Build Plan (v1)

Goal: anyone can open the Saviour site, connect a wallet and launch a coin. Each launch:
- pays **0.5 SOL**, which is **automatically swapped into $SAVIOUR and burned in the same transaction**
- **locks the ticker for 30 minutes**
- gets a bonding curve that people can trade on right away and that graduates to a DEX pool.

This plan replaces the custom-curve design in `TECH_SPEC.md` for v1. The custom curve (and Fair Start) moves to v2.

---

## 1. Key decision: don't write our own bonding curve

A bonding curve program is the riskiest part of a launchpad. It holds everyone's SOL, its maths has to be exact, and it has to be audited. Two audited curve programs already let a third-party launchpad plug in:

| | **Meteora Dynamic Bonding Curve (DBC)**, recommended | Raydium LaunchLab |
|---|---|---|
| How a launchpad plugs in | We create a **config key** (curve shape, fees, graduation). Creators launch pools with that key. | We create a **Platform PDA** with our fee destination and fee share. |
| Our fee | Partner trading fee, claimable by us | Platform fee in bps, pre- and post-migration |
| Graduation | Automatic to a Meteora DAMM pool | Automatic to a Raydium CPMM pool |
| SDK | `@meteora-ag/dynamic-bonding-curve-sdk`, Rust SDK, CPI supported | `@raydium-io/raydium-sdk-v2` |
| Devnet | Same program ID on devnet and mainnet | Separate devnet program |

**Recommendation: Meteora DBC.**
- It supports CPI, so our program can wrap the launch, and it has a Rust SDK.
- It works on devnet with the same program ID as mainnet.
- Its config controls curve shape, fees and graduation, with a dynamic fee option that may cover our "snipe tax" rule. That still needs confirming in the docs.
- Coins on DBC can be traded on Jupiter and the usual terminals.

**What we still write ourselves** is the part that makes Saviour different: the ticker lock, the 0.5 SOL fee and the buy-and-burn.

---

## 2. Architecture

```
 Creator ──▶ Saviour web app (Next.js) ──▶ ONE transaction:
                                            1. saviour_gate::launch
                                               ├─ check + set TickerLock PDA (30 min)
                                               ├─ take 0.5 SOL from creator
                                               ├─ CPI: PumpSwap buy $SAVIOUR (min_out enforced)
                                               ├─ CPI: SPL burn all $SAVIOUR received
                                               ├─ CPI: Meteora DBC create pool (our config key)
                                               └─ write Coin PDA + emit LaunchEvent
                                            (all-or-nothing: if any step fails, nothing happens)

 Traders ──▶ Web app ──▶ Meteora DBC swap (buy/sell on curve) ──▶ graduates to DAMM pool

 Helius webhooks/Geyser ──▶ Indexer (Node + Postgres) ──▶ API ──▶ feed, coin pages,
                                                               lock board, burn dashboard
```

### Why the burn happens in the launch transaction
- The marketing says the deploy fee is bought and burned in the same transaction. Doing it atomically makes that literally true, and anyone can verify it on Solscan.
- 0.5 SOL is a small swap. With a tight `min_out` (quoted by the app just before signing, checked onchain), sandwich risk is low. If the price moves too much, the transaction just fails and the creator retries.
- We call the $SAVIOUR/SOL **PumpSwap pool directly** instead of through Jupiter. Jupiter's own docs warn that CPI swaps often fail because multi-hop routes don't fit in one transaction. A single pool fits.
- **Prerequisite:** $SAVIOUR must have **graduated from pump.fun to PumpSwap** before the launchpad goes to mainnet. Until then there's no pool to buy from.

---

## 3. Components to build

### A. `saviour_gate` (Anchor program, Rust): the core
- **Accounts**
  - `Config`: admin multisig, fee (0.5 SOL), lock seconds (1800), $SAVIOUR mint, PumpSwap pool, DBC config key, a pause switch
  - `TickerLock` PDA `[b"ticker", normalised]` holding `locked_until` and `mint`
  - `Coin` PDA `[b"coin", mint]` holding creator, ticker, time and SOL burned
  - `Stats` PDA: totals for launches, SOL burned and $SAVIOUR burned
- **Instructions**
  - `launch(name, ticker, uri, min_saviour_out)`, which does the steps in the diagram above
  - `set_config` (multisig only, behind a time-lock), `pause` and `unpause`
- **Ticker normaliser:** the same rules as `main.js` (`normalise()`), written in Rust, with shared test vectors so the site and the program can never disagree.
- **Tests:** Anchor/Bankrun tests for:
  - a locked ticker getting rejected, including look-alikes
  - a lock expiring after 30 minutes
  - the fee being exact
  - the burn amount matching the `Stats` totals
  - slippage failure
  - pause

### B. Meteora DBC config (one-time setup)
- Create the Saviour config key with:
  - 1B supply, SOL quote
  - curve and graduation threshold close to pump.fun's, so traders feel at home
  - pre- and post-graduation trading fees
  - partner fee claimer set to the Saviour multisig
- **Must verify on devnet:** whether DBC lets a config restrict pool creation so people can't skip our gate. If it doesn't, coins created outside the gate still won't show up on Saviour, because our indexer only lists coins with a `Coin` PDA, but they'd use our config.

### C. Fee routing (trading fees)
- Partner trading fees from DBC accumulate for the multisig. A small scheduled job claims them and splits them per the litepaper: 50% buy-and-burn $SAVIOUR, 30% operations, 20% creators.
- Creators can also claim their own share through the DBC creator-fee functions.

### D. Token metadata
- The creator uploads an image, name, ticker, description and socials in the app.
- The app uploads the image and JSON metadata to IPFS (Pinata) or Arweave (Irys). The resulting `uri` goes into `launch`.

### E. Indexer and API (Node/TypeScript + Postgres)
- Helius webhooks (or Geyser) on `saviour_gate` events and DBC swaps.
- Tables for coins, trades, candles (1s/1m/5m), holders, locks and burns.
- REST and WebSocket endpoints for the feed, a coin page, the lock board and burn totals.
- Later: Bundle Score (wallet funding graph), Origin badges, Vamp Shield image matching.

### F. Web app (Next.js + Tailwind, keeping the current Saviour design)
- **Home:** live feed of new coins and trending coins, plus the lock board and burn counters, with real data replacing the demo.
- **Create:**
  - form for image, name, ticker and socials, with a live ticker-lock check as you type
  - fee summary: "0.5 SOL → buys ≈ X $SAVIOUR → burned"
  - sign one transaction
- **Coin page:**
  - chart (TradingView Lightweight Charts) and buy/sell panel via the DBC SDK
  - trades, holders and bonding-curve progress
  - "Launched on Saviour: 0.5 SOL burned" badge with a Solscan link
- **Burns:** live dashboard of total burned, with a link to every burn transaction.
- **Wallets:** Phantom, Solflare and Backpack via wallet-adapter.

---

## 4. What you (the owner) need to provide

| Item | Why | Rough cost |
|---|---|---|
| **$SAVIOUR mint address, graduated to PumpSwap** | The launch transaction buys from that pool | n/a |
| **Squads multisig** (2-of-3 with trusted people) | Owns program upgrades, config and fee claims, so no single key can rug | Free |
| **Deployer wallet** (your own, run locally) | Deploys the program. **Never paste private keys into chat.** You run the deploy command yourself. | ~3–6 SOL rent for the program account |
| **Helius RPC key** (or Triton) | Reliable RPC plus webhooks for the indexer | ~$50–500/month by tier |
| **Pinata (IPFS) key** | Coin images and metadata | Free to ~$20/month |
| **Hosting** | Vercel (web) + Railway/Render/Supabase (indexer + Postgres) | ~$25–100/month |
| **Domain** | | ~$15/year |
| **Security audit** of `saviour_gate` | It handles user SOL. Strongly recommended before mainnet. | Roughly $10k–50k depending on firm and scope |
| **Legal check** | Running a token platform has regulatory exposure in some countries | Varies |

---

## 5. Build phases

| Phase | Deliverable | Rough time |
|---|---|---|
| **1. Devnet MVP** | `saviour_gate` with ticker lock, 0.5 SOL fee, swap-and-burn against a devnet test pool, and DBC create; tests passing; Create page + coin page + feed on devnet; basic indexer | 2–3 weeks |
| **2. Mainnet-ready** | Real PumpSwap pool wiring, multisig ownership, pause switch, metadata uploads, burn dashboard, fee-claim job, rate limits, monitoring | 1–2 weeks |
| **3. Audit + public beta** | Audit fixes, bug bounty, invite-only creators, then open launch | 2–4 weeks (mostly audit queue) |
| **4. v2 features** | Bundle Score, Origin badges, Vamp Shield, declared dev buy cap, then Fair Start (needs our own curve program) | Ongoing |

**What I can build in this environment:**
- the Anchor program and its tests
- the indexer
- the Next.js app
- deploying all of it to **devnet**

**What you have to do yourself:**
- the **mainnet** deploy, from your own machine with your own keys and multisig (I'll write the exact commands)
- the audit and the paid service accounts

---

## 6. Open questions to resolve during phase 1
1. Can a DBC config restrict who creates pools with it? This decides whether the gate can be bypassed. If not, document the indexer-only listing.
2. What's the exact DBC curve parameters for a pump.fun-like feel? Test them on devnet.
3. Is DBC's dynamic or scheduled fee enough to implement the "snipe tax → burn" rule? Check on devnet.
4. Compute budget: can one transaction fit lock + transfer + PumpSwap CPI + burn + DBC create? Measure on devnet. Fallback: two instructions in the same transaction, with the gate checking the DBC create via the instructions sysvar.
