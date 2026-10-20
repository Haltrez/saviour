# Saviour Litepaper (v0.1)

> The launchpad that saves the trenches.

## 1. The problem

Solana memecoin launchpads made launching a coin free and instant. That also made the worst plays cheap and fast.

| Problem | What happens | Who loses |
|---|---|---|
| **Bundled launches** | The deployer funds 10–20 wallets and buys their own coin in the launch block (Proxima-style bundlers, Jito bundles). The holder list looks distributed, but one person controls the supply. | Every buyer after the first block |
| **Vamp launches** | A coin trends, then a clone appears with the same name and image and more bot volume behind it. | The original community, whose liquidity gets split |
| **Ticker races** | News breaks and 10–50 coins with the same ticker deploy within a minute, mostly from bots. | Buyers who guess wrong, which is most of them |
| **Spam** | Free deploys mean thousands of throwaway coins a day, which buries real launches. | Everyone |

Existing platforms monetise this volume and have little reason to stop it.

## 2. The Saviour rules

Each rule is meant to be enforced **in the Saviour onchain program**, not as a policy on a website. Anyone can verify it on Solscan.

### S-01: 0.5 SOL deploy fee, 100% bought and burned
- Creating a coin costs **0.5 SOL**.
- In the same transaction, the program swaps all 0.5 SOL into `$SAVIOUR` and burns it with the SPL `burn` instruction.
- The team keeps none of it.
- **Effect:** spam gets expensive. Real creators pay roughly the cost of a meal. Every launch reduces `$SAVIOUR` supply, so platform usage translates directly into token demand.

### S-02: 30-minute ticker lock
- After `$XYZ` is deployed, no one can deploy `$XYZ` again for **30 minutes**.
- Matching uses a **normalised** ticker, so tricks don't get through:
  - case and symbols: `$xyz`, `X.Y.Z` → `XYZ`
  - look-alike digits: `0→O`, `1→I`, `3→E`, `4→A`, `5→S`, `7→T`, `8→B`
  - Cyrillic and Greek homoglyphs: `Х`, `Υ`, `Ζ` → `XYZ`
- Near-misses (edit distance 1 on tickers of 5+ characters) are **allowed but flagged** on the coin page.
- **Squatting** costs 0.5 SOL every 30 minutes, all of it burned, so squatters fund the burn.

### S-03: Fair Start (single-price batch auction)
- For the first **45 seconds** of a coin, buys are collected into one batch instead of executing one by one.
- When the window closes, every order fills at **the same clearing price** on the curve.
- Bundles and launch-block snipers gain nothing, because there is no first block to win.
- This is the strongest anti-bundle mechanic and the main technical moat.

### S-04: Bundle Score
- An indexer builds a funding graph for every early buyer: which wallet funded it, when, and whether that traces back to the deployer.
- Each coin shows a badge from **0 to 100** (clean to fully bundled), plus the share of supply held by connected wallets.
- The score is computed from public chain data, and the methodology is open source.

### S-05: Origin badge (news coins)
- A creator can attach a **source URL** (an X post or an article) when deploying.
- The first coin to deploy a given source gets the **Origin** badge.
- Later coins with the same source are labelled **Clone of $XYZ**, with a link to the Origin coin.
- This stops buyers guessing which news coin is the real one.

### S-06: Vamp Shield
- On create, the image's perceptual hash (pHash) and the coin name are compared against coins that are trending in the last 24 hours.
- Near-identical coins are blocked for 30 minutes from the original's launch, and labelled after that.

### S-07: Declared dev buy
- The dev buy is optional, **capped at 3% of supply**, and must happen in the create transaction.
- It's shown publicly on the coin page.
- Dev-wallet sells appear in the live feed as they happen.

### S-08: Snipe tax → burn
- After Fair Start, a decaying fee applies for **5 minutes**: it starts at 10% and falls linearly to the base 1%.
- Everything above the base fee buys and burns `$SAVIOUR`.

## 3. More ideas (backlog, to be weighed with the community)
- **Creator reputation:** wallet-level history (rugs, graduations, average holder retention) shown on every new launch.
- **Graduation burn:** when a coin graduates, a fixed share of the graduation fee buys and burns `$SAVIOUR`.
- **Holder-gated launches:** creators holding `$SAVIOUR` above a threshold get a fee discount (paid in `$SAVIOUR`, which is then burned) or early access to Terminal features.
- **Kill switch for clones:** the community flags a coin as a confirmed vamp, and the UI hides it from trending.
- **Public API and webhooks:** bots and aggregators read lock state, Bundle Score and Origin. This also spreads the brand to other tools.
- **Burn leaderboard:** creators ranked by the `$SAVIOUR` their launches have burned, as a social flex.

## 4. Revenue routing (proposal)

| Source | Burn `$SAVIOUR` | Ops / treasury | Coin creators |
|---|---|---|---|
| Deploy fee (0.5 SOL) | **100%** | 0% | 0% |
| Bonding-curve trading fee (1%) | 50% | 30% | 20% |
| Snipe tax above base | **100%** | 0% | 0% |

These numbers are fixed in the program before mainnet and can then only change through a time-locked parameter update.

## 5. The token: `$SAVIOUR`
- 1,000,000,000 supply, fair launched on pump.fun.
- No presale, no team allocation, and a small public dev buy.
- Mint and freeze authority revoked (pump.fun standard).
- Utility: it's the burn sink for every Saviour launch, there are planned fee discounts for holders, and later there's governance over protocol parameters.

## 6. Roadmap
| Phase | Name | Deliverables |
|---|---|---|
| 0 | Genesis | Token fair launch, site, litepaper, tech spec, community, graduation |
| 1 | Devnet registry | Ticker Registry program on devnet, open-source normaliser, public demo, Bundle Score beta |
| 2 | Mainnet beta | Launchpad on mainnet with buy-and-burn and the 30-minute lock, audit, burn dashboard |
| 3 | Fair Start & Origin | Batch auction, Origin badges, Vamp Shield, snipe tax |
| 4 | Saviour Terminal | Pro terminal, public API, mobile, governance |

## 7. Disclaimer
`$SAVIOUR` is a memecoin. It has no intrinsic value and comes with no promise of profit. The features described here are in development and may change. Nothing in this document is financial advice.
