# Saviour Technical Spec (v0.1, draft)

How the Saviour launchpad is meant to be built. This is a design document; none of these programs are deployed yet.

## 1. Architecture

```
            ┌──────────────┐   create_coin (0.5 SOL)  ┌──────────────────────┐
  Creator ─▶│  Web app     │ ────────────────────────▶│  saviour_launchpad   │
            │  Next.js +   │                          │  (Anchor program)    │
            │  wallet-adpt │◀─── coin pages, feed ─── │                      │
            └──────┬───────┘                          │  ├─ TickerLock PDA   │
                   │                                  │  ├─ BondingCurve PDA │
                   │ REST / WS                        │  ├─ FairStart batch  │
            ┌──────▼───────┐   Geyser / Helius        │  └─ CPI: swap+burn   │
            │  Indexer     │◀──── account + tx ───────┤                      │
            │  (Rust/TS)   │      streams             └──────────┬───────────┘
            │  Bundle Score│                                     │ CPI
            │  Origin, pHash                                     ▼
            └──────────────┘                          Jupiter / PumpSwap pool
                                                      ($SAVIOUR/SOL) → SPL burn
```

## 2. Onchain program: `saviour_launchpad` (Anchor)

### Accounts

```rust
#[account]
pub struct Config {
    pub admin: Pubkey,             // multisig (Squads), time-locked
    pub deploy_fee_lamports: u64,  // 500_000_000 (0.5 SOL)
    pub lock_seconds: i64,         // 1800
    pub fair_start_seconds: i64,   // 45
    pub saviour_mint: Pubkey,
    pub fee_split_bps: [u16; 3],   // burn, ops, creator (sum 10_000)
    pub pending_update: Option<ParamUpdate>, // 48h time-lock
}

#[account]
pub struct TickerLock {             // seeds = [b"ticker", normalised_ticker]
    pub ticker: [u8; 10],
    pub mint: Pubkey,               // last coin to claim it
    pub locked_until: i64,          // unix ts
    pub bump: u8,
}

#[account]
pub struct Coin {                   // seeds = [b"coin", mint]
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub created_at: i64,
    pub dev_buy_tokens: u64,        // declared, capped at 3% supply
    pub origin_hash: Option<[u8; 32]>, // sha256(canonical source URL)
    pub phase: Phase,               // FairStart | Curve | Graduated
}
```

### `create_coin(ticker_raw, name, uri, dev_buy_lamports, origin_hash)`
1. `t = normalise(ticker_raw)` onchain (see §3). The client sends the normalised form as the PDA seed, and the program **recomputes and checks** it so it can't be spoofed.
2. Load or init `TickerLock` at `[b"ticker", t]`. Require `now >= locked_until`, otherwise fail with `TickerLocked`.
3. Set `locked_until = now + lock_seconds`, `mint = new_mint`.
4. Transfer `deploy_fee_lamports` from the creator to a program-owned vault.
5. **Swap and burn** in the same instruction: CPI into the `$SAVIOUR`/SOL pool (PumpSwap after graduation, or a Jupiter route) with a `min_out` derived from an oracle/TWAP to limit sandwiching. Then CPI `spl_token::burn` on the received `$SAVIOUR`. Emit a `Burned { sol_in, saviour_burned }` event.
6. Init the mint (metadata via Metaplex), the `BondingCurve`, and `Coin` with `phase = FairStart`. Mint and freeze authorities are set to `None`.
7. If `dev_buy_lamports > 0`: place it as a Fair Start order (not an instant fill), capped at 3% of supply.

> **Sandwich risk on the burn swap.** A single 0.5 SOL market buy per launch is small. Still, burns go through a vault and are batched: every N launches or every T seconds, one `crank_burn` instruction swaps with a slippage bound. This gives better execution and fewer MEV openings. Each launch emits an event showing its fee was received, and the vault balance is public.

### Fair Start: `place_order`, `settle_batch`
- During `FairStart`, `place_order(lamports)` escrows SOL in a `BatchOrder` PDA and executes nothing.
- After `fair_start_seconds`, anyone can call the permissionless `settle_batch`:
  - sum the escrowed SOL into `S`
  - walk the constant-product curve to find the tokens `T` that `S` buys from the starting reserves
  - set the clearing price `p = S / T`
  - every order gets `lamports_i / p` tokens, the same price for everyone
- Then `phase = Curve` and normal trading begins.
- Per-wallet caps during Fair Start (for example 1% of supply) stop one large buyer from taking the batch.

### Snipe tax
`fee_bps(t) = base + max(0, (start_bps - base) * (1 - (t - t0)/300))` for the first 300 seconds after Fair Start. The amount above `base` goes to the burn vault.

### Graduation
At the curve threshold, liquidity migrates to a PumpSwap or Raydium CPMM pool and the LP tokens are burned. This matches what users already expect from pump.fun.

## 3. Ticker normalisation (shared spec)
The program, the indexer and the website (`main.js` `normalise()`) all apply the same steps:

1. Unicode NFKC normalise, trim, and uppercase.
2. Strip leading `$`.
3. Map homoglyphs:
   - `0→O 1→I |→I !→I 3→E 4→A @→A 5→S 7→T 8→B $→S`
   - Cyrillic `А В Е К М Н О Р С Т Х У І`
   - Greek `Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ`
4. Drop everything outside `[A-Z0-9]`.
5. Reject an empty result or one longer than 10 characters.

Onchain, NFKC is too expensive. The client must submit a string that is already NFKC-normalised. The program applies steps 2–5 over a fixed ASCII + Cyrillic + Greek table and rejects any other non-ASCII codepoint.

Edit-distance "similar" flags are **offchain only** (indexer and UI). They are informational and don't block deploys.

## 4. Offchain services

| Service | Stack | Job |
|---|---|---|
| Indexer | Rust or TS + Helius/Triton Geyser | Stream program events, build coin state, push to the WebSocket feed |
| Bundle Score | Same pipeline + Postgres | For the first 50 buyers: trace SOL funding up to 3 hops and 72 hours back, cluster wallets, score supply held by the deployer cluster |
| Vamp Shield | Worker + pHash (64-bit dHash) | Hamming distance ≤ 6 against coins trending in the last 24h; returns a signed attestation that the create transaction must carry (checked onchain by signature) |
| Origin | Worker | Canonicalise the URL (strip tracking, resolve t.co, use the x.com status id), sha256 it, store first claimant |
| Burn dashboard | Next.js + indexer | Total burned, SOL routed, launches, lock board |

## 5. Frontend
- Next.js (App Router) and Tailwind, with `@solana/wallet-adapter` (Phantom, Solflare, Backpack).
- Pages: Trending feed · Coin page (chart, Bundle Score, Origin, dev activity) · Create · Lock board · Burn dashboard.
- Real-time updates via WebSocket from the indexer, and charts with TradingView Lightweight Charts.

## 6. Security and launch checklist
- [ ] Anchor program audited by a reputable Solana auditor, report published
- [ ] Upgrade authority on a Squads multisig, and parameter changes behind a 48h time-lock
- [ ] Fuzz tests on curve math and the batch settlement (no rounding drift, total tokens ≤ supply)
- [ ] Slippage-bounded burn crank, with no admin path to withdraw the burn vault
- [ ] Bug bounty live before mainnet
- [ ] Devnet public beta for at least 2 weeks

## 7. Milestones → roadmap phases
- **P1 (devnet):** `Config`, `TickerLock`, `create_coin` with the fee going to a burn vault (mock pool), the normaliser library and tests, and a public demo UI.
- **P2 (mainnet beta):** real swap-and-burn crank, bonding curve, graduation, indexer, burn dashboard, audit.
- **P3:** Fair Start batch, snipe tax, Origin, Vamp Shield, Bundle Score GA.
- **P4:** Terminal, public API, mobile, governance over `Config` parameters.
